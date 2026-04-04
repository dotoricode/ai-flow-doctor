/** Map file extensions to Tree-sitter grammar names */
const EXT_TO_GRAMMAR: Record<string, string> = {
  ts:   "typescript",
  tsx:  "tsx",
  js:   "typescript",
  jsx:  "tsx",
  py:   "python",
  pyi:  "python",
  go:   "go",
  rs:   "rust",
};

/**
 * Resolve the Tree-sitter grammar name for a file.
 * Falls back to the provided baseGrammar for unknown extensions.
 */
export function resolveGrammar(filePath: string, baseGrammar?: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_GRAMMAR[ext] ?? baseGrammar ?? "typescript";
}

/** Detect language family from file extension */
export type LangFamily = "typescript" | "python" | "go" | "rust" | "unknown";

export function detectLang(filePath: string): LangFamily {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts": case "tsx": case "js": case "jsx": return "typescript";
    case "py": case "pyi": return "python";
    case "go": return "go";
    case "rs": return "rust";
    default: return "unknown";
  }
}
