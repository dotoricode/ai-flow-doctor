import type { Node, Tree } from "web-tree-sitter";
import type { LanguageExtractor, HologramOptions } from "./types";
import { collapse } from "./utils";

/**
 * Stub a function body: slice source up to (but not including) the `block` node.
 * Returns `fn signature(…) -> ReturnType {…}`.
 */
function stubFnBody(node: Node, source: string): string {
  const block = node.childForFieldName("body") ?? node.namedChildren.find(c => c.type === "block");
  if (!block) return collapse(node.text);
  return collapse(source.slice(node.startIndex, block.startIndex).trimEnd()) + " {…}";
}

/**
 * Extract a `use_declaration`:
 *   use std::collections::HashMap;
 */
function extractUse(node: Node): string {
  return collapse(node.text);
}

/**
 * Extract a `mod_item`:
 *   mod utils;                          (external module declaration)
 *   mod config { pub fn default() {} }  (inline module — show header + {…})
 */
function extractMod(node: Node, source: string): string {
  const body = node.namedChildren.find(c => c.type === "declaration_list");
  if (!body) return collapse(node.text); // `mod utils;` — preserve as-is
  // Inline mod: show header only
  return collapse(source.slice(node.startIndex, body.startIndex).trimEnd()) + " {…}";
}

/**
 * Extract a `struct_item` with all field declarations.
 *
 * Example output:
 *   pub struct Config {
 *     pub host: String,
 *     pub port: u16,
 *     enabled: bool,
 *   }
 */
function extractStruct(node: Node, source: string): string {
  const fieldList = node.namedChildren.find(c => c.type === "field_declaration_list");

  // Tuple struct or unit struct — no braced field list
  if (!fieldList) return collapse(node.text);

  // Build header: everything before the field list
  const header = collapse(source.slice(node.startIndex, fieldList.startIndex).trimEnd());

  const fields = fieldList.namedChildren
    .filter(c => c.type === "field_declaration")
    .map(f => "  " + collapse(f.text) + ",");

  if (fields.length === 0) return `${header} {}`;
  return `${header} {\n${fields.join("\n")}\n}`;
}

/**
 * Extract an `enum_item` with all variants.
 *
 * Example output:
 *   pub enum Status {
 *     Active,
 *     Inactive,
 *     Error(String),
 *   }
 */
function extractEnum(node: Node, source: string): string {
  const variantList = node.namedChildren.find(c => c.type === "enum_variant_list");
  if (!variantList) return collapse(node.text);

  const header = collapse(source.slice(node.startIndex, variantList.startIndex).trimEnd());

  const variants = variantList.namedChildren
    .filter(c => c.type === "enum_variant")
    .map(v => "  " + collapse(v.text) + ",");

  if (variants.length === 0) return `${header} {}`;
  return `${header} {\n${variants.join("\n")}\n}`;
}

/**
 * Extract a `trait_item` with method signatures (no bodies — traits only contain signatures).
 *
 * Example output:
 *   pub trait Handler {
 *     fn handle(&self, req: &Request) -> Response;
 *     fn name(&self) -> &str;
 *   }
 */
function extractTrait(node: Node, source: string): string {
  const body = node.namedChildren.find(c => c.type === "declaration_list");
  if (!body) return collapse(node.text);

  const header = collapse(source.slice(node.startIndex, body.startIndex).trimEnd());

  const members: string[] = [];
  for (const child of body.namedChildren) {
    switch (child.type) {
      case "function_signature_item":
        // Already a pure signature (no body)
        members.push("  " + collapse(child.text));
        break;
      case "function_item":
        // Default implementation — stub body
        members.push("  " + stubFnBody(child, source));
        break;
      case "type_item":
        // Associated type: `type Output;`
        members.push("  " + collapse(child.text));
        break;
      case "const_item":
        // Associated const: `const N: usize;`
        members.push("  " + collapse(child.text));
        break;
      case "comment":
        break;
      default:
        members.push("  " + collapse(child.text));
    }
  }

  if (members.length === 0) return `${header} {}`;
  return `${header} {\n${members.join("\n")}\n}`;
}

/**
 * Extract a `type_item` (type alias).
 *   pub type Result<T> = std::result::Result<T, Box<dyn Error>>;
 */
function extractTypeAlias(node: Node): string {
  return collapse(node.text);
}

/**
 * Extract an `impl_item` with stubbed method bodies.
 *
 * Handles:
 *   impl Config { ... }
 *   impl Handler for MyHandler { ... }
 *   impl<T: Trait> OtherTrait for Wrapper<T> { ... }
 *
 * Example output:
 *   impl Config {
 *     pub fn new(host: String, port: u16) -> Self {…}
 *     pub fn is_enabled(&self) -> bool {…}
 *   }
 */
function extractImpl(node: Node, source: string): string {
  const body = node.namedChildren.find(c => c.type === "declaration_list");
  if (!body) return collapse(node.text);

  const header = collapse(source.slice(node.startIndex, body.startIndex).trimEnd());

  const methods: string[] = [];
  for (const child of body.namedChildren) {
    switch (child.type) {
      case "function_item":
        methods.push("  " + stubFnBody(child, source));
        break;
      case "type_item":
        // Associated type implementation: `type Output = i32;`
        methods.push("  " + collapse(child.text));
        break;
      case "const_item":
        // Associated const implementation
        methods.push("  " + collapse(child.text));
        break;
      case "comment":
        break;
      default:
        methods.push("  " + collapse(child.text));
    }
  }

  if (methods.length === 0) return `${header} {}`;
  return `${header} {\n${methods.join("\n")}\n}`;
}

/**
 * Extract a standalone `function_item` with stubbed body.
 *   pub fn parse_args(args: &[String]) -> Result<Config> {…}
 */
function extractFn(node: Node, source: string): string {
  return stubFnBody(node, source);
}

/**
 * Process a single top-level item node.
 */
function extractTopLevel(node: Node, source: string): string | null {
  switch (node.type) {
    case "use_declaration":
      return extractUse(node);
    case "mod_item":
      return extractMod(node, source);
    case "struct_item":
      return extractStruct(node, source);
    case "enum_item":
      return extractEnum(node, source);
    case "trait_item":
      return extractTrait(node, source);
    case "type_item":
      return extractTypeAlias(node);
    case "impl_item":
      return extractImpl(node, source);
    case "function_item":
      return extractFn(node, source);
    case "comment":
    case "line_comment":
    case "block_comment":
      // Skip top-level comments for compression
      return null;
    default:
      // const_item, static_item, macro_definition, attribute_item, etc. — skip
      return null;
  }
}

export const rustExtractor: LanguageExtractor = {
  extensions: ["rs"],
  grammarName: "rust",

  extract(tree: Tree, source: string, _options?: HologramOptions): string[] {
    const lines: string[] = [];

    for (const node of tree.rootNode.namedChildren) {
      const extracted = extractTopLevel(node, source);
      if (extracted) lines.push(extracted);
    }

    return lines;
  },
};
