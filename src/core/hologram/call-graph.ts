/**
 * Call Graph Tracer — N-Depth Cross-File Symbol Resolution
 *
 * Uses Tree-sitter AST to trace function calls across files.
 * Extracts only signatures (not bodies) of called functions from external files.
 * Supports L2 (1-depth) and L3 (2-depth) traversal.
 * Multi-language: TypeScript/JS, Python, Go, Rust.
 */

import { readFileSync } from "fs";
import { TreeSitterEngine } from "./engine";
import { resolveImports, type ResolvedImport } from "./import-resolver";
import { resolveGrammar, detectLang, type LangFamily } from "./grammar-resolver";
import type { Tree, SyntaxNode } from "web-tree-sitter";

export interface TraceResult {
  symbol: string;        // function/class/type name
  sourceFile: string;    // absolute path of the defining file
  signature: string;     // extracted type signature line
  depth: number;         // 2 = L2 (direct import), 3 = L3 (transitive)
}

export interface TraceOptions {
  maxDepth?: number;     // default: 2 (L2). max: 3 (L3).
}

// ── Called-symbol extractors (per language) ──────────────────────────────────

/** Extract called function names from TS/JS AST that match imported symbols */
function extractCalledSymbolsTS(tree: Tree, importedSymbols: Set<string>): Set<string> {
  const called = new Set<string>();

  function walk(node: SyntaxNode) {
    if (node.type === "call_expression") {
      const fn = node.firstChild;
      if (fn?.type === "identifier" && importedSymbols.has(fn.text)) {
        called.add(fn.text);
      }
      if (fn?.type === "member_expression") {
        const prop = fn.lastChild;
        if (prop?.type === "property_identifier" && importedSymbols.has(prop.text)) {
          called.add(prop.text);
        }
      }
    }
    if (node.type === "type_identifier" && importedSymbols.has(node.text)) {
      called.add(node.text);
    }
    if (node.type === "jsx_self_closing_element" || node.type === "jsx_opening_element") {
      const tagName = node.child(1);
      if (tagName?.type === "identifier" && importedSymbols.has(tagName.text)) {
        called.add(tagName.text);
      }
    }
    for (let i = 0; i < node.childCount; i++) walk(node.child(i)!);
  }

  walk(tree.rootNode);
  return called;
}

/** Extract called symbols from Python AST */
function extractCalledSymbolsPy(tree: Tree, importedSymbols: Set<string>): Set<string> {
  const called = new Set<string>();

  function walk(node: SyntaxNode) {
    // call: greet(name) → function is identifier
    if (node.type === "call") {
      const fn = node.childForFieldName("function");
      if (fn?.type === "identifier" && importedSymbols.has(fn.text)) {
        called.add(fn.text);
      }
      // attribute: obj.method()
      if (fn?.type === "attribute") {
        const attr = fn.childForFieldName("attribute");
        if (attr && importedSymbols.has(attr.text)) {
          called.add(attr.text);
        }
      }
    }
    // Type annotations: x: SomeType
    if (node.type === "identifier" && importedSymbols.has(node.text)) {
      const parent = node.parent;
      if (parent?.type === "type") {
        called.add(node.text);
      }
    }
    for (let i = 0; i < node.childCount; i++) walk(node.child(i)!);
  }

  walk(tree.rootNode);
  return called;
}

/** Extract called symbols from Go AST */
function extractCalledSymbolsGo(tree: Tree, importedSymbols: Set<string>): Set<string> {
  const called = new Set<string>();

  function walk(node: SyntaxNode) {
    // call_expression → selector_expression → field (exported name)
    if (node.type === "call_expression") {
      const fn = node.childForFieldName("function");
      // pkg.Symbol()
      if (fn?.type === "selector_expression") {
        const field = fn.childForFieldName("field");
        if (field && importedSymbols.has(field.text)) {
          called.add(field.text);
        }
      }
    }
    // Composite literal: models.User{...}
    if (node.type === "composite_literal") {
      const typeNode = node.childForFieldName("type");
      if (typeNode?.type === "qualified_type" || typeNode?.type === "selector_expression") {
        const field = typeNode.childForFieldName("field") ?? typeNode.lastNamedChild;
        if (field && importedSymbols.has(field.text)) {
          called.add(field.text);
        }
      }
    }
    // Type references in var declarations
    if (node.type === "type_identifier" && importedSymbols.has(node.text)) {
      called.add(node.text);
    }
    for (let i = 0; i < node.childCount; i++) walk(node.child(i)!);
  }

  walk(tree.rootNode);
  return called;
}

/** Extract called symbols from Rust AST */
function extractCalledSymbolsRust(tree: Tree, importedSymbols: Set<string>): Set<string> {
  const called = new Set<string>();

  function walk(node: SyntaxNode) {
    // call_expression: say_hello("world")
    if (node.type === "call_expression") {
      const fn = node.childForFieldName("function");
      if (fn?.type === "identifier" && importedSymbols.has(fn.text)) {
        called.add(fn.text);
      }
      // Scoped: Module::func()
      if (fn?.type === "scoped_identifier") {
        const name = fn.lastNamedChild;
        if (name && importedSymbols.has(name.text)) {
          called.add(name.text);
        }
      }
    }
    // Type references: User::new(), let x: User
    if (node.type === "type_identifier" && importedSymbols.has(node.text)) {
      called.add(node.text);
    }
    // Scoped identifier in expressions: User::new
    if (node.type === "scoped_identifier") {
      const name = node.childForFieldName("name");
      const path = node.childForFieldName("path");
      if (path?.type === "identifier" && importedSymbols.has(path.text)) {
        called.add(path.text);
      }
      if (name?.type === "identifier" && importedSymbols.has(name.text)) {
        called.add(name.text);
      }
    }
    for (let i = 0; i < node.childCount; i++) walk(node.child(i)!);
  }

  walk(tree.rootNode);
  return called;
}

function extractCalledSymbols(tree: Tree, importedSymbols: Set<string>, lang: LangFamily): Set<string> {
  switch (lang) {
    case "python":    return extractCalledSymbolsPy(tree, importedSymbols);
    case "go":        return extractCalledSymbolsGo(tree, importedSymbols);
    case "rust":      return extractCalledSymbolsRust(tree, importedSymbols);
    default:          return extractCalledSymbolsTS(tree, importedSymbols);
  }
}

// ── Signature extractors (per language) ─────────────────────────────────────

/** Extract TS/JS signature */
function extractSignatureTS(tree: Tree, source: string, symbolName: string): string | null {
  function walk(node: SyntaxNode): string | null {
    if (
      node.type === "export_statement" ||
      node.type === "function_declaration" ||
      node.type === "class_declaration" ||
      node.type === "type_alias_declaration" ||
      node.type === "interface_declaration" ||
      node.type === "lexical_declaration"
    ) {
      const text = node.text;
      const symRe = new RegExp(`\\b${symbolName}\\b`);
      if (symRe.test(text)) {
        if (text.includes("function " + symbolName) || text.includes("function\n" + symbolName)) {
          const bodyStart = text.indexOf("{");
          if (bodyStart !== -1) return text.slice(0, bodyStart).trim();
          return text.split("\n")[0].trim();
        }
        if (node.type === "interface_declaration" || node.type === "type_alias_declaration" ||
            (node.type === "export_statement" && (text.includes("interface ") || text.includes("type ")))) {
          return text;
        }
        if (text.includes("const " + symbolName) || text.includes("let " + symbolName)) {
          const arrowIdx = text.indexOf("=>");
          const eqIdx = text.indexOf("=");
          if (arrowIdx !== -1) return text.slice(0, arrowIdx + 2).trim();
          if (eqIdx !== -1) return text.slice(0, eqIdx).trim();
        }
        if (text.includes("class " + symbolName)) {
          const bodyStart = text.indexOf("{");
          if (bodyStart !== -1) return text.slice(0, bodyStart).trim();
        }
        return text.split("\n")[0].trim();
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      const result = walk(node.child(i)!);
      if (result) return result;
    }
    return null;
  }
  return walk(tree.rootNode);
}

/** Extract Python signature */
function extractSignaturePy(tree: Tree, source: string, symbolName: string): string | null {
  function walk(node: SyntaxNode): string | null {
    if (node.type === "function_definition" || node.type === "class_definition") {
      const nameNode = node.childForFieldName("name");
      if (nameNode?.text === symbolName) {
        const body = node.childForFieldName("body");
        if (body) return source.slice(node.startIndex, body.startIndex).trimEnd() + " ...";
        return node.text.split("\n")[0];
      }
    }
    if (node.type === "decorated_definition") {
      const inner = node.namedChildren.find(c =>
        c.type === "function_definition" || c.type === "class_definition");
      if (inner) {
        const result = walk(inner);
        if (result) return result;
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      const result = walk(node.child(i)!);
      if (result) return result;
    }
    return null;
  }
  return walk(tree.rootNode);
}

/** Extract Go signature */
function extractSignatureGo(tree: Tree, source: string, symbolName: string): string | null {
  function walk(node: SyntaxNode): string | null {
    if (node.type === "function_declaration") {
      const nameNode = node.childForFieldName("name");
      if (nameNode?.text === symbolName) {
        const body = node.childForFieldName("body");
        if (body) {
          const sig = source.slice(node.startIndex, body.startIndex).trimEnd();
          return sig.replace(/\s+/g, " ") + " {…}";
        }
        return node.text.split("\n")[0];
      }
    }
    if (node.type === "method_declaration") {
      const nameNode = node.childForFieldName("name");
      if (nameNode?.text === symbolName) {
        const body = node.childForFieldName("body");
        if (body) {
          const sig = source.slice(node.startIndex, body.startIndex).trimEnd();
          return sig.replace(/\s+/g, " ") + " {…}";
        }
        return node.text.split("\n")[0];
      }
    }
    if (node.type === "type_declaration") {
      const spec = node.namedChildren.find(c => c.type === "type_spec");
      if (spec) {
        const nameNode = spec.childForFieldName("name");
        if (nameNode?.text === symbolName) {
          return node.text.replace(/\s+/g, " ").trim();
        }
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      const result = walk(node.child(i)!);
      if (result) return result;
    }
    return null;
  }
  return walk(tree.rootNode);
}

/** Extract Rust signature */
function extractSignatureRust(tree: Tree, source: string, symbolName: string): string | null {
  function walk(node: SyntaxNode): string | null {
    if (node.type === "function_item") {
      const nameNode = node.childForFieldName("name");
      if (nameNode?.text === symbolName) {
        const body = node.childForFieldName("body") ?? node.namedChildren.find(c => c.type === "block");
        if (body) {
          const sig = source.slice(node.startIndex, body.startIndex).trimEnd();
          return sig.replace(/\s+/g, " ") + " {…}";
        }
        return node.text.split("\n")[0];
      }
    }
    if (node.type === "struct_item") {
      const nameNode = node.childForFieldName("name");
      if (nameNode?.text === symbolName) {
        return node.text;
      }
    }
    if (node.type === "impl_item") {
      // Look for methods inside impl blocks
      for (const child of node.namedChildren) {
        if (child.type === "declaration_list") {
          for (const item of child.namedChildren) {
            const result = walk(item);
            if (result) return result;
          }
        }
      }
    }
    if (node.type === "trait_item" || node.type === "enum_item" || node.type === "type_item") {
      const nameNode = node.childForFieldName("name");
      if (nameNode?.text === symbolName) {
        return node.text;
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      const result = walk(node.child(i)!);
      if (result) return result;
    }
    return null;
  }
  return walk(tree.rootNode);
}

function extractSignature(tree: Tree, source: string, symbolName: string, lang: LangFamily): string | null {
  switch (lang) {
    case "python":    return extractSignaturePy(tree, source, symbolName);
    case "go":        return extractSignatureGo(tree, source, symbolName);
    case "rust":      return extractSignatureRust(tree, source, symbolName);
    default:          return extractSignatureTS(tree, source, symbolName);
  }
}

// ── Main trace function ─────────────────────────────────────────────────────

/**
 * Trace the call graph from a target file, following imports up to maxDepth.
 *
 * @param targetPath - Absolute path of the target file
 * @param targetSource - Source content of the target file
 * @param options - Trace options (maxDepth: 2 or 3)
 * @returns Array of traced symbols with their signatures
 */
export async function traceCallGraph(
  targetPath: string,
  targetSource: string,
  options?: TraceOptions,
): Promise<TraceResult[]> {
  const maxDepth = Math.min(options?.maxDepth ?? 2, 3);
  const results: TraceResult[] = [];
  const visited = new Set<string>();
  visited.add(targetPath);

  const engine = await TreeSitterEngine.getInstance();
  const targetLang = detectLang(targetPath);

  async function trace(source: string, filePath: string, currentDepth: number) {
    if (currentDepth > maxDepth) return;

    const lang = detectLang(filePath);
    const grammar = resolveGrammar(filePath);

    let tree: Tree;
    try {
      tree = await engine.parse(source, grammar);
    } catch {
      return; // Grammar not available — graceful fallback
    }

    const imports = resolveImports(source, filePath);

    const allImportedSymbols = new Set<string>();
    const symbolToImport = new Map<string, ResolvedImport>();
    for (const imp of imports) {
      for (const sym of imp.symbols) {
        if (sym === "*") {
          allImportedSymbols.add("*:" + imp.resolvedPath);
        } else {
          allImportedSymbols.add(sym);
          symbolToImport.set(sym, imp);
        }
      }
    }

    const calledSymbols = extractCalledSymbols(tree, allImportedSymbols, lang);
    tree.delete();

    for (const sym of calledSymbols) {
      const imp = symbolToImport.get(sym);
      if (!imp) continue;
      if (visited.has(imp.resolvedPath + ":" + sym)) continue;
      visited.add(imp.resolvedPath + ":" + sym);

      let depSource: string;
      try { depSource = readFileSync(imp.resolvedPath, "utf-8"); } catch { continue; }

      const depLang = detectLang(imp.resolvedPath);
      const depGrammar = resolveGrammar(imp.resolvedPath);

      let depTree: Tree;
      try { depTree = await engine.parse(depSource, depGrammar); } catch { continue; }

      const sig = extractSignature(depTree, depSource, sym, depLang);
      if (sig) {
        results.push({ symbol: sym, sourceFile: imp.resolvedPath, signature: sig, depth: currentDepth });
      }

      if (currentDepth < maxDepth && !visited.has(imp.resolvedPath)) {
        visited.add(imp.resolvedPath);
        await trace(depSource, imp.resolvedPath, currentDepth + 1);
      }

      depTree.delete();
    }
  }

  await trace(targetSource, targetPath, 2);
  return results;
}
