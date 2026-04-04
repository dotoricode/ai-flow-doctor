/**
 * Polyglot N-Depth Reachability Tests
 *
 * Validates cross-file call graph tracing for Python, Go, and Rust.
 * Each language tests L2 (1-depth) import resolution and signature extraction.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

import { resolveImports } from "../../src/core/hologram/import-resolver";
import { traceCallGraph } from "../../src/core/hologram/call-graph";

const FIXTURE_BASE = join(import.meta.dir, "..", "fixtures", "polyglot");

// ── Python N-Depth ──────────────────────────────────────────────────────────

describe("Python N-Depth", () => {
  const pyDir = join(FIXTURE_BASE, "python");
  const mainPath = join(pyDir, "main.py");
  const mainSource = readFileSync(mainPath, "utf-8");

  test("resolveImports: parses 'from X import Y' to file paths", () => {
    const imports = resolveImports(mainSource, mainPath);

    // Should resolve at least helpers and math
    expect(imports.length).toBeGreaterThanOrEqual(2);

    const allSymbols = imports.flatMap(i => i.symbols);
    expect(allSymbols).toContain("greet");
    expect(allSymbols).toContain("format_name");
    expect(allSymbols).toContain("add");
  });

  test("traceCallGraph L2: extracts signatures of called functions", async () => {
    const result = await traceCallGraph(mainPath, mainSource, { maxDepth: 2 });

    expect(result.length).toBeGreaterThanOrEqual(2);
    const sigs = result.map(r => r.signature);

    // greet and add should have signatures
    expect(sigs.some(s => s.includes("greet"))).toBe(true);
    expect(sigs.some(s => s.includes("add"))).toBe(true);

    // unused_helper should NOT appear
    expect(sigs.some(s => s.includes("unused_helper"))).toBe(false);
  });

  test("traceCallGraph L3: follows transitive imports", async () => {
    const result = await traceCallGraph(mainPath, mainSource, { maxDepth: 3 });

    const sigs = result.map(r => r.signature);

    // L3: capitalize is imported by helpers.py → used in greet()
    expect(sigs.some(s => s.includes("capitalize"))).toBe(true);
  });
});

// ── Go N-Depth ──────────────────────────────────────────────────────────────

describe("Go N-Depth", () => {
  const goDir = join(FIXTURE_BASE, "go");
  const mainPath = join(goDir, "main.go");
  const mainSource = readFileSync(mainPath, "utf-8");

  test("resolveImports: parses Go import block to file paths", () => {
    const imports = resolveImports(mainSource, mainPath);

    expect(imports.length).toBeGreaterThanOrEqual(2);

    const allSymbols = imports.flatMap(i => i.symbols);
    // Go uses package-level imports: symbols are inferred from usage
    expect(allSymbols).toContain("Greet");
    expect(allSymbols).toContain("NewUser");
  });

  test("traceCallGraph L2: extracts Go function signatures", async () => {
    const result = await traceCallGraph(mainPath, mainSource, { maxDepth: 2 });

    expect(result.length).toBeGreaterThanOrEqual(2);
    const sigs = result.map(r => r.signature);

    expect(sigs.some(s => s.includes("Greet"))).toBe(true);
    expect(sigs.some(s => s.includes("NewUser"))).toBe(true);

    // Unused should NOT appear
    expect(sigs.some(s => s.includes("Unused"))).toBe(false);
  });
});

// ── Rust N-Depth ────────────────────────────────────────────────────────────

describe("Rust N-Depth", () => {
  const rustDir = join(FIXTURE_BASE, "rust");
  const mainPath = join(rustDir, "main.rs");
  const mainSource = readFileSync(mainPath, "utf-8");

  test("resolveImports: parses 'use' declarations to file paths", () => {
    const imports = resolveImports(mainSource, mainPath);

    expect(imports.length).toBeGreaterThanOrEqual(2);

    const allSymbols = imports.flatMap(i => i.symbols);
    expect(allSymbols).toContain("say_hello");
    expect(allSymbols).toContain("User");
  });

  test("traceCallGraph L2: extracts Rust function/struct signatures", async () => {
    const result = await traceCallGraph(mainPath, mainSource, { maxDepth: 2 });

    expect(result.length).toBeGreaterThanOrEqual(2);
    const sigs = result.map(r => r.signature);

    expect(sigs.some(s => s.includes("say_hello"))).toBe(true);
    expect(sigs.some(s => s.includes("User"))).toBe(true);

    // unused_fn should NOT appear
    expect(sigs.some(s => s.includes("unused_fn"))).toBe(false);
  });
});
