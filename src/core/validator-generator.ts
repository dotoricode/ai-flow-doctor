/**
 * Auto-Validator Generator — converts quarantine failure patterns into
 * executable `.js` validator scripts for `.afd/validators/`.
 *
 * Strategy: template-based code generation with heuristic pattern detection.
 * Each quarantine lesson is classified into a failure category, then a
 * category-specific template emits a self-contained validator function.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, extname } from "path";
import { VALIDATORS_DIR } from "../daemon/types";

// ── Header stamped on every generated validator ─────────────────────────────

const AUTO_HEADER = "// [afd auto-generated validator] DO NOT EDIT — regenerate with `afd evolution --generate`\n";

// ── Pattern classification ──────────────────────────────────────────────────

type ValidatorCategory =
  | "prevent-deletion"
  | "prevent-empty"
  | "prevent-truncation"
  | "require-valid-json"
  | "prevent-corruption";

interface ClassifiedPattern {
  category: ValidatorCategory;
  /** The file path or glob that this validator targets */
  target: string;
  /** Extra context for the template (e.g. minimum line count) */
  meta: Record<string, string | number>;
}

interface GeneratorResult {
  filename: string;
  written: boolean;
  reason: string;
}

/**
 * Classify a quarantine lesson into a generator category.
 */
function classify(
  failureType: "corruption" | "deletion",
  originalPath: string,
  corruptedContent: string,
  restoredContent: string | null,
): ClassifiedPattern {
  const target = originalPath;

  if (failureType === "deletion") {
    return { category: "prevent-deletion", target, meta: {} };
  }

  // Empty file
  if (corruptedContent.trim().length === 0) {
    return { category: "prevent-empty", target, meta: {} };
  }

  // Severe truncation (>90% content loss)
  if (restoredContent && corruptedContent.length < restoredContent.length * 0.1) {
    const minLines = restoredContent.split("\n").length;
    return { category: "prevent-truncation", target, meta: { minLines: Math.max(1, Math.floor(minLines * 0.3)) } };
  }

  // JSON syntax error
  if (originalPath.endsWith(".json")) {
    try {
      JSON.parse(corruptedContent);
    } catch {
      return { category: "require-valid-json", target, meta: {} };
    }
  }

  // Generic corruption fallback
  return { category: "prevent-corruption", target, meta: {} };
}

// ── Template emitters ───────────────────────────────────────────────────────

function emitPreventDeletion(target: string): string {
  return `${AUTO_HEADER}
// Prevents deletion or complete emptying of: ${target}
module.exports = function(newContent, filePath) {
  if (!filePath.endsWith(${JSON.stringify(normalizeTarget(target))})) return false;
  // Content marked as DELETED or completely empty → corruption
  if (!newContent || newContent.trim().length === 0) return true;
  if (newContent.trim() === "DELETED") return true;
  return false;
};
`;
}

function emitPreventEmpty(target: string): string {
  return `${AUTO_HEADER}
// Prevents emptying of: ${target}
module.exports = function(newContent, filePath) {
  if (!filePath.endsWith(${JSON.stringify(normalizeTarget(target))})) return false;
  if (!newContent || newContent.trim().length === 0) return true;
  return false;
};
`;
}

function emitPreventTruncation(target: string, minLines: number): string {
  return `${AUTO_HEADER}
// Prevents severe truncation of: ${target} (minimum ${minLines} lines)
module.exports = function(newContent, filePath) {
  if (!filePath.endsWith(${JSON.stringify(normalizeTarget(target))})) return false;
  if (!newContent) return true;
  var lineCount = newContent.split("\\n").length;
  if (lineCount < ${minLines}) return true;
  return false;
};
`;
}

function emitRequireValidJson(target: string): string {
  return `${AUTO_HEADER}
// Ensures valid JSON syntax for: ${target}
module.exports = function(newContent, filePath) {
  if (!filePath.endsWith(${JSON.stringify(normalizeTarget(target))})) return false;
  if (!newContent || newContent.trim().length === 0) return true;
  try {
    JSON.parse(newContent);
    return false;
  } catch (e) {
    return true;
  }
};
`;
}

function emitPreventCorruption(target: string): string {
  return `${AUTO_HEADER}
// Generic corruption guard for: ${target}
module.exports = function(newContent, filePath) {
  if (!filePath.endsWith(${JSON.stringify(normalizeTarget(target))})) return false;
  // Block empty or near-empty overwrites
  if (!newContent || newContent.trim().length < 5) return true;
  return false;
};
`;
}

/** Normalize path to a suffix for endsWith matching (forward slashes) */
function normalizeTarget(p: string): string {
  return p.replace(/\\/g, "/");
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface ValidatorGenInput {
  failureType: "corruption" | "deletion";
  originalPath: string;
  corruptedContent: string;
  restoredContent: string | null;
}

/**
 * Generate a single validator from a quarantine pattern.
 * Returns the filename and whether it was written (skips if user-modified).
 */
export function generateValidator(input: ValidatorGenInput, baseDir?: string): GeneratorResult {
  const dir = baseDir ?? VALIDATORS_DIR;
  mkdirSync(dir, { recursive: true });

  const pattern = classify(input.failureType, input.originalPath, input.corruptedContent, input.restoredContent);
  const filename = buildFilename(pattern);
  const filepath = join(dir, filename);

  // Safety: do not overwrite user-modified validators
  if (existsSync(filepath)) {
    const existing = readFileSync(filepath, "utf-8");
    if (!existing.startsWith(AUTO_HEADER)) {
      return { filename, written: false, reason: "user-modified" };
    }
  }

  let code: string;
  switch (pattern.category) {
    case "prevent-deletion":
      code = emitPreventDeletion(pattern.target);
      break;
    case "prevent-empty":
      code = emitPreventEmpty(pattern.target);
      break;
    case "prevent-truncation":
      code = emitPreventTruncation(pattern.target, (pattern.meta.minLines as number) || 5);
      break;
    case "require-valid-json":
      code = emitRequireValidJson(pattern.target);
      break;
    case "prevent-corruption":
      code = emitPreventCorruption(pattern.target);
      break;
  }

  writeFileSync(filepath, code, "utf-8");
  return { filename, written: true, reason: "generated" };
}

/**
 * Generate validators for all provided quarantine lessons.
 * Returns summary of generated files.
 */
export function generateValidators(inputs: ValidatorGenInput[], baseDir?: string): GeneratorResult[] {
  return inputs.map(input => generateValidator(input, baseDir));
}

function buildFilename(pattern: ClassifiedPattern): string {
  // Produce a descriptive filename from the target path
  const ext = extname(pattern.target);
  const base = pattern.target
    .replace(/^\./, "")          // strip leading dot
    .replace(/[/\\]/g, "-")     // path separators to dashes
    .replace(ext, "")            // strip extension
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `auto-${pattern.category}-${base}${ext ? "-" + ext.slice(1) : ""}.js`;
}
