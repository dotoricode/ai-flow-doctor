import type { Node, Tree } from "web-tree-sitter";
import type { LanguageExtractor, HologramOptions } from "./types";
import { collapse as collapseWhitespace } from "./utils";
import { readFileSync } from "fs";

/** Extract imported symbols from a context file using regex (L1 filtering) */
function extractImportedSymbols(contextSource: string, targetPath: string): Set<string> | "all" {
  const symbols = new Set<string>();
  const targetBase = targetPath.replace(/\.[tj]sx?$/, "").replace(/\\/g, "/");
  const targetName = targetBase.split("/").pop() ?? targetBase;

  function matchesTarget(from: string): boolean {
    const normalized = from.replace(/\.[tj]sx?$/, "").replace(/\\/g, "/");
    return normalized.endsWith(targetName) || normalized.endsWith(targetBase);
  }

  // Namespace import
  const nsRe = /import\s+\*\s+as\s+\w+\s+from\s+["']([^"']+)["']/g;
  for (const m of contextSource.matchAll(nsRe)) {
    if (matchesTarget(m[1])) return "all";
  }

  // Named imports
  const namedRe = /import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;
  for (const m of contextSource.matchAll(namedRe)) {
    if (matchesTarget(m[2])) {
      m[1].split(",").forEach(s => {
        const name = s.trim().split(/\s+as\s+/)[0].trim();
        if (name) symbols.add(name);
      });
    }
  }

  // Default import
  const defaultRe = /import\s+(\w+)\s+from\s+["']([^"']+)["']/g;
  for (const m of contextSource.matchAll(defaultRe)) {
    if (matchesTarget(m[2])) symbols.add("default");
  }

  // Combined: import X, { A, B } from "./target"
  const combinedRe = /import\s+(\w+)\s*,\s*\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;
  for (const m of contextSource.matchAll(combinedRe)) {
    if (matchesTarget(m[3])) {
      symbols.add("default");
      m[2].split(",").forEach(s => {
        const name = s.trim().split(/\s+as\s+/)[0].trim();
        if (name) symbols.add(name);
      });
    }
  }

  return symbols;
}

/** Node types that contain implementation bodies (NOT pure type declarations) */
const IMPL_NODE_TYPES = new Set([
  "function_declaration",
  "generator_function_declaration",
  "class_declaration",
  "lexical_declaration",
  "variable_declaration",
  "expression_statement",
]);

/**
 * Fast pure-type file check: scans only root-level node types (O(n), no deep traversal).
 * Returns true if every top-level statement is a pure type declaration with no implementation body.
 */
function isPureTypeFile(rootChildren: Node[]): boolean {
  for (const node of rootChildren) {
    if (IMPL_NODE_TYPES.has(node.type)) return false;

    if (node.type === "export_statement") {
      // Check what's being exported — if it has an implementation node, it's not pure
      const inner = node.namedChildren.find(c =>
        c.type !== "export_clause" && c.type !== "string" && c.type !== "identifier"
      );
      if (inner && IMPL_NODE_TYPES.has(inner.type)) return false;
    }
  }
  return true;
}

/**
 * Get the declared name from any top-level node (exported or not).
 * Used for L1 symbol filtering.
 */
function getDeclarationName(node: Node): string | null {
  let target = node;

  // Unwrap export_statement
  if (node.type === "export_statement") {
    const inner = node.namedChildren.find(c =>
      c.type === "function_declaration" ||
      c.type === "generator_function_declaration" ||
      c.type === "class_declaration" ||
      c.type === "interface_declaration" ||
      c.type === "type_alias_declaration" ||
      c.type === "enum_declaration" ||
      c.type === "lexical_declaration"
    );
    if (!inner) return null;
    target = inner;
  }

  const nameNode = target.childForFieldName("name");
  if (nameNode) return nameNode.text;

  if (target.type === "lexical_declaration") {
    const declarator = target.namedChildren.find(c => c.type === "variable_declarator");
    return declarator?.childForFieldName("name")?.text ?? null;
  }

  return null;
}

/** Get the exported name from a top-level declaration node */
function getExportedName(node: Node): string | null {
  // Check if wrapped in export_statement
  const parent = node.parent;
  const isExported = parent?.type === "export_statement" || node.type === "export_statement";
  if (!isExported && parent?.type !== "program") return null;
  if (!isExported) return null;

  const decl = node.type === "export_statement"
    ? node.namedChildren.find(c =>
        c.type === "function_declaration" ||
        c.type === "class_declaration" ||
        c.type === "interface_declaration" ||
        c.type === "type_alias_declaration" ||
        c.type === "enum_declaration" ||
        c.type === "lexical_declaration")
    : node;

  if (!decl) return null;

  const nameNode = decl.childForFieldName("name");
  if (nameNode) return nameNode.text;

  // Variable declarations
  if (decl.type === "lexical_declaration") {
    const declarator = decl.namedChildren.find(c => c.type === "variable_declarator");
    return declarator?.childForFieldName("name")?.text ?? null;
  }

  return null;
}

/** Stub a node's body, keeping only the signature */
function stubBody(node: Node, source: string): string {
  const body = node.childForFieldName("body");
  if (!body) return collapseWhitespace(node.text);
  return collapseWhitespace(source.slice(node.startIndex, body.startIndex).trimEnd()) + " {…}";
}

/** Extract function signature */
function extractFunction(node: Node, source: string): string {
  return stubBody(node, source);
}

/** Extract class with member signatures */
function extractClass(node: Node, source: string): string {
  const nameNode = node.childForFieldName("name");
  const name = nameNode?.text ?? "Anonymous";
  const body = node.childForFieldName("body");

  // Heritage (extends/implements)
  let heritage = "";
  const heritageNodes = node.children.filter(c =>
    c.type === "extends_clause" || c.type === "implements_clause" ||
    c.type === "class_heritage");
  if (heritageNodes.length > 0) {
    heritage = " " + heritageNodes.map(h => collapseWhitespace(h.text)).join(" ");
  }

  // Prefix (export, abstract, etc.)
  const prefix = collapseWhitespace(
    source.slice(node.startIndex, (nameNode ?? body ?? node).startIndex).trimEnd()
  ).replace(name, "").trimEnd();
  const classPrefix = prefix ? `${prefix} ${name}` : `class ${name}`;

  if (!body) return `${classPrefix}${heritage} {}`;

  const members: string[] = [];
  for (const member of body.namedChildren) {
    switch (member.type) {
      case "public_field_definition":
      case "property_definition": {
        members.push("  " + collapseWhitespace(member.text).replace(/;$/, "") + ";");
        break;
      }
      case "method_definition": {
        const methodBody = member.childForFieldName("body");
        if (methodBody) {
          const sig = collapseWhitespace(source.slice(member.startIndex, methodBody.startIndex).trimEnd());
          members.push("  " + sig + ";");
        } else {
          members.push("  " + collapseWhitespace(member.text) + ";");
        }
        break;
      }
    }
  }

  return `${classPrefix}${heritage} {\n${members.join("\n")}\n}`;
}

/** Extract interface with all members */
function extractInterface(node: Node, source: string): string {
  const nameNode = node.childForFieldName("name");
  const name = nameNode?.text ?? "Anonymous";
  const body = node.childForFieldName("body");

  // Heritage (extends)
  const extendsClause = node.children.find(c => c.type === "extends_type_clause");
  const ext = extendsClause ? " " + collapseWhitespace(extendsClause.text) : "";

  // Prefix
  const prefixEnd = (nameNode ?? body ?? node).startIndex;
  const rawPrefix = source.slice(node.startIndex, prefixEnd).trimEnd();
  const prefix = collapseWhitespace(rawPrefix).replace(name, "").trimEnd();
  const ifacePrefix = prefix ? `${prefix} ${name}` : `interface ${name}`;

  if (!body) return `${ifacePrefix}${ext} {}`;

  const members = body.namedChildren.map(m => {
    const text = collapseWhitespace(m.text).replace(/;$/, "");
    return "  " + text + ";";
  });

  return `${ifacePrefix}${ext} {\n${members.join("\n")}\n}`;
}

/** Extract enum */
function extractEnum(node: Node): string {
  const nameNode = node.childForFieldName("name");
  const name = nameNode?.text ?? "Anonymous";
  const body = node.childForFieldName("body");

  const isExport = node.parent?.type === "export_statement" ? "export " : "";
  const isConst = node.children.some(c => c.text === "const") ? "const " : "";

  if (!body) return `${isExport}${isConst}enum ${name} {}`;

  const members = body.namedChildren
    .filter(m => m.type === "enum_member" || m.type === "property_identifier")
    .map(m => collapseWhitespace(m.text));

  return `${isExport}${isConst}enum ${name} { ${members.join(", ")} }`;
}

/** Extract variable statement (const/let/var with possible arrow functions) */
function extractVariable(node: Node, source: string): string {
  const keyword = node.children[0]?.text ?? "const";
  const isExport = node.parent?.type === "export_statement" ? "export " : "";

  const declarators = node.namedChildren.filter(c => c.type === "variable_declarator");
  const parts = declarators.map(d => {
    const name = d.childForFieldName("name")?.text ?? "?";
    const typeAnn = d.childForFieldName("type")
      ? ": " + collapseWhitespace(d.childForFieldName("type")!.text)
      : "";
    const value = d.childForFieldName("value");

    if (value && (value.type === "arrow_function" || value.type === "function_expression" || value.type === "function")) {
      return `${name} = ${stubBody(value, source)}`;
    }
    if (typeAnn) return `${name}${typeAnn}`;
    if (value) return `${name} = …`;
    return name;
  });

  return `${isExport}${keyword} ${parts.join(", ")};`;
}

/** Extract type alias */
function extractTypeAlias(node: Node): string {
  const isExport = node.parent?.type === "export_statement" ? "export " : "";
  return isExport + collapseWhitespace(node.text);
}


/** Process a single top-level statement */
function extractTopLevel(node: Node, source: string): string | null {
  // Unwrap export_statement to get the inner declaration
  if (node.type === "export_statement") {
    // Re-export: export { ... } from "..."
    const exportClause = node.namedChildren.find(c => c.type === "export_clause");
    if (exportClause) return collapseWhitespace(node.text);

    // export default expression
    const defaultKw = node.children.find(c => c.text === "default");
    if (defaultKw) {
      const inner = node.namedChildren.find(c => c.type !== "export_clause");
      if (inner && (inner.type === "function_declaration" || inner.type === "class_declaration")) {
        return "export default " + extractTopLevel(inner, source);
      }
      return `export default …;`;
    }

    // export <declaration>
    const inner = node.namedChildren[0];
    if (inner) {
      const result = extractTopLevel(inner, source);
      if (result) {
        const alreadyHasExport = result.startsWith("export ");
        return alreadyHasExport ? result : "export " + result;
      }
    }
    return collapseWhitespace(node.text);
  }

  switch (node.type) {
    case "import_statement":
      return collapseWhitespace(node.text);
    case "function_declaration":
    case "generator_function_declaration":
      return extractFunction(node, source);
    case "class_declaration":
      return extractClass(node, source);
    case "interface_declaration":
      return extractInterface(node, source);
    case "type_alias_declaration":
      return extractTypeAlias(node);
    case "enum_declaration":
      return extractEnum(node);
    case "lexical_declaration":
    case "variable_declaration":
      return extractVariable(node, source);
    case "export_statement":
      return collapseWhitespace(node.text);
    default:
      return null;
  }
}

export const tsExtractor: LanguageExtractor = {
  extensions: ["ts", "tsx", "js", "jsx", "mts", "cts"],
  grammarName: "typescript", // base grammar; tsx files use resolveGrammar() override

  extract(tree: Tree, source: string, options?: HologramOptions): string[] {
    const rootChildren = tree.rootNode.namedChildren;

    // === Pure Type File Bypass ===
    // If all top-level nodes are type declarations (no implementation bodies),
    // skip extraction entirely and return the original source as-is.
    if (!options?.symbols && !options?.contextFile && isPureTypeFile(rootChildren)) {
      return [source];
    }

    // === L1 Symbol Extraction ===
    // If specific symbols are requested, pinpoint-extract only those nodes.
    if (options?.symbols && options.symbols.length > 0) {
      const symbolSet = new Set(options.symbols);
      const matched: string[] = [];
      for (const stmt of rootChildren) {
        const name = getDeclarationName(stmt);
        if (name && symbolSet.has(name)) {
          const line = extractTopLevel(stmt, source);
          if (line) matched.push(line);
        }
      }
      return matched;
    }

    const lines: string[] = [];

    // L1 filtering setup
    let importedSymbols: Set<string> | "all" | null = null;
    if (options?.contextFile) {
      try {
        const contextSource = readFileSync(options.contextFile, "utf-8");
        importedSymbols = extractImportedSymbols(contextSource, "");
        if (importedSymbols !== "all" && importedSymbols.size === 0) importedSymbols = null;
      } catch {
        importedSymbols = null;
      }
    }

    for (const stmt of rootChildren) {
      // L1: filter non-imported exports
      if (importedSymbols && importedSymbols !== "all") {
        const exportedName = getExportedName(stmt);
        if (exportedName !== null && !importedSymbols.has(exportedName)) {
          const line = extractTopLevel(stmt, source);
          if (line) {
            const stub = line.split("\n")[0].replace(/\{[^}]*\}?\s*$/, "").trimEnd();
            lines.push(`${stub} // details omitted — read directly if needed`);
          }
          continue;
        }
      }

      const line = extractTopLevel(stmt, source);
      if (line) lines.push(line);
    }

    if (importedSymbols && importedSymbols !== "all") {
      lines.push("\n// [afd L1] Non-imported exports are shown as stubs. Use afd_read for full details.");
    }

    return lines;
  },
};
