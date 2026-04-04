import type { Node, Tree } from "web-tree-sitter";
import type { LanguageExtractor, HologramOptions } from "./types";
import { collapse } from "./utils";

/**
 * Extract the text of a field, collapsing whitespace.
 */
function fieldText(node: Node, field: string): string {
  return collapse(node.childForFieldName(field)?.text ?? "");
}

/**
 * Format a Go function/method signature with stubbed body.
 * Slices source up to (but not including) the body block.
 */
function stubGoBody(node: Node, source: string): string {
  const body = node.childForFieldName("body");
  if (!body) return collapse(node.text);
  return collapse(source.slice(node.startIndex, body.startIndex).trimEnd()) + " {…}";
}

/**
 * Extract a `function_declaration`:
 *   func Name(params) ReturnType {…}
 */
function extractFunction(node: Node, source: string): string {
  return stubGoBody(node, source);
}

/**
 * Extract a `method_declaration`:
 *   func (r ReceiverType) Name(params) ReturnType {…}
 */
function extractMethod(node: Node, source: string): string {
  return stubGoBody(node, source);
}

/**
 * Extract a `type_spec` node (the individual name+type inside a type declaration).
 * Handles struct, interface, and other type aliases/definitions.
 */
function extractTypeSpec(node: Node): string {
  const name = fieldText(node, "name");
  const typeNode = node.childForFieldName("type");
  if (!typeNode) return `type ${name}`;

  switch (typeNode.type) {
    case "struct_type":
      return extractStructType(name, typeNode);
    case "interface_type":
      return extractInterfaceType(name, typeNode);
    default:
      // type alias or other: e.g. `type MyInt int`, `type Handler func(...)`
      return `type ${name} ${collapse(typeNode.text)}`;
  }
}

/**
 * Extract a struct type with all field declarations.
 *
 * Example output:
 *   type DaemonState struct {
 *     Running bool
 *     Pid int
 *   }
 */
function extractStructType(name: string, structNode: Node): string {
  const fieldList = structNode.namedChildren.find(c => c.type === "field_declaration_list");
  if (!fieldList || fieldList.namedChildCount === 0) {
    return `type ${name} struct {}`;
  }

  const fields: string[] = [];
  for (const field of fieldList.namedChildren) {
    if (field.type === "field_declaration") {
      // Collect field names (may be multiple: `X, Y int`)
      const names: string[] = [];
      let typeNode: Node | null = null;
      for (const child of field.namedChildren) {
        if (child.type === "field_identifier" || child.type === "identifier") {
          names.push(child.text);
        } else {
          typeNode = child;
        }
      }
      const typeStr = typeNode ? collapse(typeNode.text) : "?";
      if (names.length > 0) {
        fields.push(`  ${names.join(", ")} ${typeStr}`);
      } else {
        // Embedded field: just the type
        fields.push(`  ${typeStr}`);
      }
    } else if (field.type === "comment") {
      // Skip comments inside struct
    }
  }

  return `type ${name} struct {\n${fields.join("\n")}\n}`;
}

/**
 * Extract an interface type with method/embedded type signatures.
 *
 * Example output:
 *   type Reader interface {
 *     Read(p []byte) (n int, err error)
 *   }
 */
function extractInterfaceType(name: string, ifaceNode: Node): string {
  // In tree-sitter-go, method_elem nodes are direct named children of interface_type
  // (there is no intermediate interface_body wrapper node)
  const members: string[] = [];
  for (const child of ifaceNode.namedChildren) {
    switch (child.type) {
      case "method_elem":
      case "interface_type_name":
      case "type_constraint":
      case "type_elem":
        members.push("  " + collapse(child.text));
        break;
      case "comment":
        break;
      default:
        members.push("  " + collapse(child.text));
    }
  }

  if (members.length === 0) return `type ${name} interface {}`;
  return `type ${name} interface {\n${members.join("\n")}\n}`;
}

/**
 * Extract a `type_declaration` node.
 * A single `type_declaration` may contain one or more `type_spec` nodes
 * (the grouped `type (...)` form).
 */
function extractTypeDeclaration(node: Node): string[] {
  const specs = node.namedChildren.filter(c => c.type === "type_spec");
  return specs.map(extractTypeSpec);
}

/**
 * Extract an `import_declaration`.
 * Handles both single-spec (`import "fmt"`) and grouped (`import (...)`).
 */
function extractImport(node: Node): string {
  return collapse(node.text);
}

/**
 * Extract a `package_clause`.
 */
function extractPackage(node: Node): string {
  return collapse(node.text);
}

/**
 * Process a single top-level declaration node.
 * Returns one or more lines (type declarations may emit multiple lines).
 */
function extractTopLevel(node: Node, source: string): string[] {
  switch (node.type) {
    case "package_clause":
      return [extractPackage(node)];
    case "import_declaration":
      return [extractImport(node)];
    case "function_declaration":
      return [extractFunction(node, source)];
    case "method_declaration":
      return [extractMethod(node, source)];
    case "type_declaration":
      return extractTypeDeclaration(node);
    case "comment":
      // Skip top-level comments (doc comments) for compression
      return [];
    default:
      // Variables, constants, and other top-level declarations: skip bodies,
      // emit a stub if meaningful.
      return [];
  }
}

export const goExtractor: LanguageExtractor = {
  extensions: ["go"],
  grammarName: "go",

  extract(tree: Tree, source: string, _options?: HologramOptions): string[] {
    const lines: string[] = [];

    for (const node of tree.rootNode.namedChildren) {
      const extracted = extractTopLevel(node, source);
      lines.push(...extracted);
    }

    return lines;
  },
};
