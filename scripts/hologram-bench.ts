/**
 * Hologram AST compression benchmark
 * Usage: bun run scripts/hologram-bench.ts
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { generateHologram } from "../src/core/hologram";

const SRC_DIR = join(import.meta.dir, "..", "src");

interface FileResult {
  path: string;
  originalChars: number;
  hologramChars: number;
  savings: number;
  lines: number;
  hologramLines: number;
}

function walkTs(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkTs(full));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) results.push(full);
  }
  return results;
}

const files = walkTs(SRC_DIR).sort();
const results: FileResult[] = [];

for (const file of files) {
  const source = readFileSync(file, "utf-8");
  const result = generateHologram(file, source);
  results.push({
    path: relative(join(import.meta.dir, ".."), file),
    originalChars: result.originalLength,
    hologramChars: result.hologramLength,
    savings: result.savings,
    lines: source.split("\n").length,
    hologramLines: result.hologram.split("\n").length,
  });
}

// Sort by savings descending
results.sort((a, b) => b.savings - a.savings);

// Header
console.log("\n╔══════════════════════════════════════════════════════════════════════╗");
console.log("║            Hologram AST Compression Benchmark                      ║");
console.log("╚══════════════════════════════════════════════════════════════════════╝\n");

// Table header
console.log(
  "File".padEnd(45) +
  "Lines".padStart(7) +
  "→Holo".padStart(7) +
  "Chars".padStart(8) +
  "→Holo".padStart(8) +
  "Save%".padStart(7)
);
console.log("─".repeat(82));

let totalOriginal = 0;
let totalHologram = 0;

for (const r of results) {
  totalOriginal += r.originalChars;
  totalHologram += r.hologramChars;

  const bar = r.savings >= 70 ? "███" : r.savings >= 50 ? "██░" : r.savings >= 30 ? "█░░" : "░░░";

  console.log(
    r.path.padEnd(45) +
    String(r.lines).padStart(7) +
    String(r.hologramLines).padStart(7) +
    String(r.originalChars).padStart(8) +
    String(r.hologramChars).padStart(8) +
    `${r.savings.toFixed(1)}%`.padStart(7) +
    ` ${bar}`
  );
}

console.log("─".repeat(82));

const totalSavings = totalOriginal > 0
  ? ((totalOriginal - totalHologram) / totalOriginal * 100).toFixed(1)
  : "0";

console.log(
  "TOTAL".padEnd(45) +
  "".padStart(7) +
  "".padStart(7) +
  String(totalOriginal).padStart(8) +
  String(totalHologram).padStart(8) +
  `${totalSavings}%`.padStart(7)
);

// Summary
console.log("\n── Summary ──────────────────────────────────────");
console.log(`  Files analyzed:    ${results.length}`);
console.log(`  Total original:    ${(totalOriginal / 1024).toFixed(1)} KB`);
console.log(`  Total hologram:    ${(totalHologram / 1024).toFixed(1)} KB`);
console.log(`  Overall savings:   ${totalSavings}%`);
console.log(`  Est. token saving: ~${Math.round((totalOriginal - totalHologram) / 4)} tokens`);
console.log("");

// Breakdown by savings tier
const tiers = [
  { label: "70%+ (high)", files: results.filter(r => r.savings >= 70) },
  { label: "50-69% (medium)", files: results.filter(r => r.savings >= 50 && r.savings < 70) },
  { label: "30-49% (low)", files: results.filter(r => r.savings >= 30 && r.savings < 50) },
  { label: "<30% (minimal)", files: results.filter(r => r.savings < 30) },
];

console.log("── Savings Distribution ─────────────────────────");
for (const t of tiers) {
  const pct = results.length > 0 ? ((t.files.length / results.length) * 100).toFixed(0) : "0";
  const bar = "█".repeat(Math.round(t.files.length / results.length * 30));
  console.log(`  ${t.label.padEnd(20)} ${String(t.files.length).padStart(3)} files (${pct}%) ${bar}`);
}
console.log("");
