/**
 * Import Resolver — Lightweight multi-language import resolution
 *
 * Parses import statements via regex and resolves relative specifiers
 * to absolute file paths. Supports TS/JS, Python, Go, and Rust.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve, dirname, join, basename } from "path";
import { detectLang } from "./grammar-resolver";

export interface ResolvedImport {
  specifier: string;       // raw specifier from source (e.g., "./utils")
  symbols: string[];       // imported names (["greet"] or ["*"] for namespace)
  resolvedPath: string;    // absolute file path
}

const TS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

/** Try to resolve a relative specifier to an actual file path */
function resolveSpecifier(specifier: string, fromFile: string): string | null {
  if (!specifier.startsWith(".")) return null; // skip bare specifiers (fs, express, etc.)

  const dir = dirname(fromFile);
  const base = resolve(dir, specifier);

  // Direct file match
  for (const ext of TS_EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate)) return candidate;
  }

  // Index file in directory
  for (const ext of TS_EXTENSIONS) {
    const candidate = join(base, `index${ext}`);
    if (existsSync(candidate)) return candidate;
  }

  // Already has extension
  if (existsSync(base)) return base;

  return null;
}

/**
 * Parse import statements from source and resolve relative ones to file paths.
 * Returns only imports that resolve to actual files.
 * Dispatches to language-specific resolver based on file extension.
 */
export function resolveImports(source: string, fromFile: string): ResolvedImport[] {
  const lang = detectLang(fromFile);
  switch (lang) {
    case "python": return resolvePythonImports(source, fromFile);
    case "go":     return resolveGoImports(source, fromFile);
    case "rust":   return resolveRustImports(source, fromFile);
    default:       return resolveTsImports(source, fromFile);
  }
}

/** TS/JS import resolution (original logic) */
function resolveTsImports(source: string, fromFile: string): ResolvedImport[] {
  const results: ResolvedImport[] = [];

  // Named: import { A, B } from "./module"
  const namedRe = /import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;
  for (const m of source.matchAll(namedRe)) {
    const symbols = m[1].split(",").map(s => s.replace(/\s+as\s+\w+/, "").trim()).filter(Boolean);
    const specifier = m[2];
    const resolved = resolveSpecifier(specifier, fromFile);
    if (resolved) results.push({ specifier, symbols, resolvedPath: resolved });
  }

  // Namespace: import * as X from "./module"
  const nsRe = /import\s+\*\s+as\s+\w+\s+from\s+["']([^"']+)["']/g;
  for (const m of source.matchAll(nsRe)) {
    const specifier = m[1];
    const resolved = resolveSpecifier(specifier, fromFile);
    if (resolved) results.push({ specifier, symbols: ["*"], resolvedPath: resolved });
  }

  // Default: import X from "./module" (not already captured by named/namespace)
  const defaultRe = /import\s+(\w+)\s+from\s+["']([^"']+)["']/g;
  for (const m of source.matchAll(defaultRe)) {
    const symbol = m[1];
    const specifier = m[2];
    // Skip if already captured by namespace regex
    if (results.some(r => r.specifier === specifier)) continue;
    const resolved = resolveSpecifier(specifier, fromFile);
    if (resolved) results.push({ specifier, symbols: [symbol], resolvedPath: resolved });
  }

  // Combined: import X, { A, B } from "./module"
  const combinedRe = /import\s+(\w+)\s*,\s*\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;
  for (const m of source.matchAll(combinedRe)) {
    const defaultSymbol = m[1];
    const named = m[2].split(",").map(s => s.replace(/\s+as\s+\w+/, "").trim()).filter(Boolean);
    const specifier = m[3];
    // Avoid duplicates from named regex
    const existing = results.find(r => r.specifier === specifier);
    if (existing) {
      if (!existing.symbols.includes(defaultSymbol)) existing.symbols.push(defaultSymbol);
    } else {
      const resolved = resolveSpecifier(specifier, fromFile);
      if (resolved) results.push({ specifier, symbols: [defaultSymbol, ...named], resolvedPath: resolved });
    }
  }

  // Barrel file resolution: if resolved path is an index.ts barrel,
  // trace re-exports to find the actual source files for each symbol.
  const expanded: ResolvedImport[] = [];
  for (const r of results) {
    const resolved = resolveBarrelExports(r.resolvedPath, r.symbols, r.specifier);
    if (resolved.length > 0) {
      expanded.push(...resolved);
    } else {
      expanded.push(r);
    }
  }

  // De-duplicate by resolvedPath
  const seen = new Map<string, ResolvedImport>();
  for (const r of expanded) {
    const existing = seen.get(r.resolvedPath);
    if (existing) {
      for (const s of r.symbols) {
        if (!existing.symbols.includes(s)) existing.symbols.push(s);
      }
    } else {
      seen.set(r.resolvedPath, r);
    }
  }

  return [...seen.values()];
}

/**
 * If resolvedPath is a barrel file (index.ts), trace re-exports to find
 * the actual source file for each requested symbol.
 * Returns empty array if not a barrel or no re-exports matched.
 */
function resolveBarrelExports(
  barrelPath: string,
  symbols: string[],
  originalSpecifier: string,
): ResolvedImport[] {
  // Only process index files
  const name = basename(barrelPath).replace(/\.[tj]sx?$/, "");
  if (name !== "index") return [];

  let barrelSource: string;
  try { barrelSource = readFileSync(barrelPath, "utf-8"); } catch { return []; }

  // Parse re-export statements from barrel
  // Pattern A: export { X, Y } from './module'
  const namedReexport = /export\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;
  // Pattern B: export * from './module'
  const wildcardReexport = /export\s+\*\s+from\s+["']([^"']+)["']/g;

  // Build symbol → source file mapping
  const symbolMap = new Map<string, string>(); // symbol → resolved path

  for (const m of barrelSource.matchAll(namedReexport)) {
    const exported = m[1].split(",").map(s => s.replace(/\s+as\s+\w+/, "").trim()).filter(Boolean);
    const specifier = m[2];
    const resolved = resolveSpecifier(specifier, barrelPath);
    if (resolved) {
      for (const sym of exported) symbolMap.set(sym, resolved);
    }
  }

  for (const m of barrelSource.matchAll(wildcardReexport)) {
    const specifier = m[1];
    const resolved = resolveSpecifier(specifier, barrelPath);
    if (!resolved) continue;
    // For wildcard, we need to check if any requested symbol exists in this file
    let depSource: string;
    try { depSource = readFileSync(resolved, "utf-8"); } catch { continue; }
    for (const sym of symbols) {
      if (symbolMap.has(sym)) continue; // already found via named re-export
      // Quick check: does this file export the symbol?
      const exportPattern = new RegExp(`export\\s+(?:async\\s+)?(?:function|const|class|interface|type|enum|let|var)\\s+${sym}\\b`);
      if (exportPattern.test(depSource)) {
        symbolMap.set(sym, resolved);
      }
    }
  }

  if (symbolMap.size === 0) return [];

  // Group symbols by resolved file
  const byFile = new Map<string, string[]>();
  for (const [sym, path] of symbolMap) {
    if (!symbols.includes(sym)) continue; // only requested symbols
    const arr = byFile.get(path) ?? [];
    arr.push(sym);
    byFile.set(path, arr);
  }

  return [...byFile.entries()].map(([resolvedPath, syms]) => ({
    specifier: originalSpecifier,
    symbols: syms,
    resolvedPath,
  }));
}

// ── Python Import Resolution ────────────────────────────────────────────────

/** Resolve a dotted Python module path to a file */
function resolvePyModule(modulePath: string, fromFile: string): string | null {
  const dir = dirname(fromFile);
  const parts = modulePath.split(".");

  // Try relative to current file's directory
  // e.g., "utils.helpers" → utils/helpers.py or utils/helpers/__init__.py
  const relPath = join(dir, ...parts);

  // Direct .py file
  if (existsSync(relPath + ".py")) return relPath + ".py";
  // Package with __init__.py
  if (existsSync(join(relPath, "__init__.py"))) return join(relPath, "__init__.py");

  // Try from project root (walk up to find the containing package)
  // For "from utils.helpers import X", search upward
  let searchDir = dir;
  for (let i = 0; i < 5; i++) {
    const candidate = join(searchDir, ...parts);
    if (existsSync(candidate + ".py")) return candidate + ".py";
    if (existsSync(join(candidate, "__init__.py"))) return join(candidate, "__init__.py");
    searchDir = dirname(searchDir);
  }

  return null;
}

function resolvePythonImports(source: string, fromFile: string): ResolvedImport[] {
  const results: ResolvedImport[] = [];

  // Pattern: from X.Y import A, B, C
  const fromImportRe = /from\s+([\w.]+)\s+import\s+([^#\n]+)/g;
  for (const m of source.matchAll(fromImportRe)) {
    const modulePath = m[1];
    const symbolsPart = m[2];
    const symbols = symbolsPart.split(",").map(s => s.replace(/\s+as\s+\w+/, "").trim()).filter(Boolean);
    const resolved = resolvePyModule(modulePath, fromFile);
    if (resolved) {
      results.push({ specifier: modulePath, symbols, resolvedPath: resolved });
    }
  }

  // Pattern: import X.Y (no symbols — resolve to module file)
  const importRe = /^import\s+([\w.]+)/gm;
  for (const m of source.matchAll(importRe)) {
    const modulePath = m[1];
    // Skip if already captured by from...import
    if (results.some(r => r.specifier === modulePath)) continue;
    const resolved = resolvePyModule(modulePath, fromFile);
    if (resolved) {
      results.push({ specifier: modulePath, symbols: ["*"], resolvedPath: resolved });
    }
  }

  return results;
}

// ── Go Import Resolution ────────────────────────────────────────────────────

function resolveGoImports(source: string, fromFile: string): ResolvedImport[] {
  const results: ResolvedImport[] = [];
  const dir = dirname(fromFile);

  // Extract import paths from single or grouped imports
  const paths: string[] = [];
  // Group: import ( "..." \n "..." )
  const groupRe = /import\s*\(([\s\S]*?)\)/g;
  for (const m of source.matchAll(groupRe)) {
    const block = m[1];
    const lineRe = /["']([^"']+)["']/g;
    for (const lm of block.matchAll(lineRe)) {
      paths.push(lm[1]);
    }
  }
  // Single: import "..."
  const singleRe = /import\s+["']([^"']+)["']/g;
  for (const m of source.matchAll(singleRe)) {
    paths.push(m[1]);
  }

  for (const importPath of paths) {
    // Only resolve relative imports (./xxx)
    if (!importPath.startsWith("./") && !importPath.startsWith("../")) continue;

    const pkgDir = resolve(dir, importPath);
    if (!existsSync(pkgDir)) continue;

    // Go package = directory. Find all .go files in the directory.
    // Extract exported symbols (capitalized function/type names) and resolve to files.
    const goFiles = listGoFiles(pkgDir);

    // Extract exported symbols used in the source to narrow down
    const usedSymbols = extractGoUsedSymbols(source, importPath);

    for (const goFile of goFiles) {
      const filePath = join(pkgDir, goFile);
      const matchedSymbols = matchGoExports(filePath, usedSymbols);
      if (matchedSymbols.length > 0) {
        results.push({
          specifier: importPath,
          symbols: matchedSymbols,
          resolvedPath: filePath,
        });
      }
    }
  }

  return results;
}

/** List .go files in a directory */
function listGoFiles(dir: string): string[] {
  try {
    return readdirSync(dir).filter(f => f.endsWith(".go") && !f.endsWith("_test.go"));
  } catch { return []; }
}

/** Extract capitalized identifiers prefixed with package alias from source */
function extractGoUsedSymbols(source: string, importPath: string): Set<string> {
  // Package name is the last segment of the import path
  const pkgName = importPath.split("/").pop()!;
  const symbols = new Set<string>();
  // Match pkgName.Symbol patterns
  const re = new RegExp(`${pkgName}\\.([A-Z]\\w*)`, "g");
  for (const m of source.matchAll(re)) {
    symbols.add(m[1]);
  }
  return symbols;
}

/** Check which exported symbols exist in a Go file */
function matchGoExports(filePath: string, wanted: Set<string>): string[] {
  if (wanted.size === 0) return [];
  let content: string;
  try { content = readFileSync(filePath, "utf-8"); } catch { return []; }

  const found: string[] = [];
  for (const sym of wanted) {
    // Match func Symbol or type Symbol
    const re = new RegExp(`\\b(?:func|type)\\s+${sym}\\b`);
    if (re.test(content)) found.push(sym);
  }
  return found;
}

// ── Rust Import Resolution ──────────────────────────────────────────────────

function resolveRustImports(source: string, fromFile: string): ResolvedImport[] {
  const results: ResolvedImport[] = [];
  const dir = dirname(fromFile);

  // Pattern: use path::to::symbol;
  // Pattern: use path::to::{A, B};
  const useRe = /use\s+([\w:]+?)::(?:(\w+)|(?:\{([^}]+)\}))\s*;/g;
  for (const m of source.matchAll(useRe)) {
    const basePath = m[1];
    const singleSymbol = m[2];
    const groupSymbols = m[3];

    const symbols = singleSymbol
      ? [singleSymbol]
      : (groupSymbols?.split(",").map(s => s.replace(/\s+as\s+\w+/, "").trim()).filter(Boolean) ?? []);

    const resolved = resolveRustPath(basePath, dir, fromFile);
    if (resolved) {
      results.push({ specifier: `${basePath}`, symbols, resolvedPath: resolved });
    }
  }

  // Pattern: mod name; (declares submodule)
  // These establish module tree — resolve to name.rs or name/mod.rs
  const modRe = /^mod\s+(\w+)\s*;/gm;
  for (const m of source.matchAll(modRe)) {
    const modName = m[1];
    const resolved = resolveRustModFile(modName, dir);
    if (resolved) {
      // Mod declarations don't import symbols directly, but they
      // establish the path for `use` statements. Skip adding unless
      // there's a matching `use` already.
    }
  }

  return results;
}

/** Resolve a Rust use-path to a file, respecting mod.rs conventions */
function resolveRustPath(usePath: string, fromDir: string, fromFile: string): string | null {
  // "super::strings" → go up one directory, then strings.rs
  // "utils::greet" → utils/greet.rs or utils/greet/mod.rs
  // "crate::utils" → from crate root
  // "self::sub" → current module directory

  const parts = usePath.split("::");
  let searchDir = fromDir;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === "super") {
      searchDir = dirname(searchDir);
    } else if (part === "crate") {
      // Walk up to find Cargo.toml or use fromDir as fallback
      searchDir = findCrateRoot(fromDir) ?? fromDir;
    } else if (part === "self") {
      // Stay in current module directory
    } else {
      // This is a module name — resolve to file
      const resolved = resolveRustModFile(part, searchDir);
      if (resolved) {
        if (i === parts.length - 1) {
          // Last segment: this is the target file
          return resolved;
        }
        // Intermediate segment: if it's a directory (mod.rs), enter it
        const modDir = join(searchDir, part);
        if (existsSync(modDir)) {
          searchDir = modDir;
        } else {
          return resolved; // Can't go deeper, return what we have
        }
      } else {
        return null;
      }
    }
  }

  return null;
}

/** Resolve a module name to name.rs or name/mod.rs */
function resolveRustModFile(name: string, dir: string): string | null {
  const directFile = join(dir, name + ".rs");
  if (existsSync(directFile)) return directFile;

  const modFile = join(dir, name, "mod.rs");
  if (existsSync(modFile)) return modFile;

  return null;
}

/** Walk up directories to find crate root (has Cargo.toml or src/) */
function findCrateRoot(fromDir: string): string | null {
  let dir = fromDir;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, "Cargo.toml"))) {
      return existsSync(join(dir, "src")) ? join(dir, "src") : dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
