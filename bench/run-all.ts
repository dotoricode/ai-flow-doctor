#!/usr/bin/env bun
/**
 * Micro-benchmark suite for Autonomous Flow Daemon
 * Measures: cold-start, hologram, SQLite WAL, all 5 commands
 */
import { spawn, execSync } from "child_process";
import { readFileSync, existsSync, unlinkSync } from "fs";
import { resolve } from "path";

const BUN = process.execPath;
const CWD = resolve(import.meta.dirname, "..");
const CLI = resolve(CWD, "src/cli.ts");

function runCmd(args: string[]): { stdout: string; ms: number } {
  const start = Bun.nanoseconds();
  const result = execSync(`"${BUN}" run ${CLI} ${args.join(" ")}`, {
    cwd: CWD,
    encoding: "utf-8",
    timeout: 15000,
    env: { ...process.env, PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH}` },
  });
  const ms = (Bun.nanoseconds() - start) / 1_000_000;
  return { stdout: result, ms };
}

async function fetchDaemon(path: string): Promise<{ data: any; ms: number }> {
  const port = readFileSync(resolve(CWD, ".afd/daemon.port"), "utf-8").trim();
  const start = Bun.nanoseconds();
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    signal: AbortSignal.timeout(5000),
  });
  const data = await res.json();
  const ms = (Bun.nanoseconds() - start) / 1_000_000;
  return { data, ms };
}

async function fetchDaemonPost(path: string, body: any): Promise<{ data: any; ms: number }> {
  const port = readFileSync(resolve(CWD, ".afd/daemon.port"), "utf-8").trim();
  const start = Bun.nanoseconds();
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  const data = await res.json();
  const ms = (Bun.nanoseconds() - start) / 1_000_000;
  return { data, ms };
}

// ─── Helpers ─────────────────────────────
function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function avg(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function fmt(ms: number): string {
  return ms.toFixed(2) + "ms";
}

// ─── Main ────────────────────────────────
async function main() {
  const results: Record<string, any> = {};

  // Ensure daemon is stopped
  try { runCmd(["stop"]); } catch {}
  try { unlinkSync(resolve(CWD, ".afd/daemon.pid")); } catch {}
  try { unlinkSync(resolve(CWD, ".afd/daemon.port")); } catch {}

  // ── 1. Cold-start benchmark (5 runs) ──
  console.log("▶ Benchmarking cold-start...");
  const coldStarts: number[] = [];
  for (let i = 0; i < 5; i++) {
    try { runCmd(["stop"]); } catch {}
    try { unlinkSync(resolve(CWD, ".afd/daemon.pid")); } catch {}
    try { unlinkSync(resolve(CWD, ".afd/daemon.port")); } catch {}
    await new Promise(r => setTimeout(r, 300));
    const { ms } = runCmd(["start"]);
    coldStarts.push(ms);
  }
  results.coldStart = {
    runs: coldStarts.length,
    values: coldStarts.map(v => +v.toFixed(2)),
    median: +median(coldStarts).toFixed(2),
    avg: +avg(coldStarts).toFixed(2),
  };
  console.log(`  median=${fmt(median(coldStarts))} avg=${fmt(avg(coldStarts))}`);

  // ── 2. Hologram benchmarks ──
  console.log("▶ Benchmarking hologram API...");
  const tsFiles = [
    "src/core/hologram.ts",
    "src/daemon/server.ts",
    "src/core/immune.ts",
    "src/commands/score.ts",
    "src/commands/fix.ts",
    "src/adapters/index.ts",
    "src/cli.ts",
  ];
  const hologramResults: { file: string; ms: number; savings: number; origChars: number; holoChars: number }[] = [];
  for (const file of tsFiles) {
    const { data, ms } = await fetchDaemon(`/hologram?file=${file}`);
    hologramResults.push({
      file,
      ms: +ms.toFixed(2),
      savings: data.savings,
      origChars: data.originalLength,
      holoChars: data.hologramLength,
    });
  }
  const avgSavings = avg(hologramResults.map(r => r.savings));
  const avgLatency = avg(hologramResults.map(r => r.ms));
  const totalOrig = hologramResults.reduce((s, r) => s + r.origChars, 0);
  const totalHolo = hologramResults.reduce((s, r) => s + r.holoChars, 0);
  results.hologram = {
    files: hologramResults,
    avgSavings: +avgSavings.toFixed(1),
    avgLatency: +avgLatency.toFixed(2),
    totalOriginalChars: totalOrig,
    totalHologramChars: totalHolo,
    overallSavings: +((totalOrig - totalHolo) / totalOrig * 100).toFixed(1),
  };
  console.log(`  files=${tsFiles.length} avgSavings=${avgSavings.toFixed(1)}% avgLatency=${fmt(avgLatency)}`);

  // ── 3. SQLite WAL benchmarks ──
  console.log("▶ Benchmarking SQLite WAL...");
  const writeLatencies: number[] = [];
  const readLatencies: number[] = [];
  for (let i = 0; i < 10; i++) {
    const { ms: writeMs } = await fetchDaemonPost("/antibodies/learn", {
      id: `BENCH-${String(i).padStart(3, "0")}`,
      patternType: "benchmark",
      fileTarget: `bench/test-${i}.ts`,
      patches: [{ op: "add", path: `/bench-${i}`, value: "test" }],
    });
    writeLatencies.push(writeMs);
  }
  for (let i = 0; i < 10; i++) {
    const { ms: readMs } = await fetchDaemon("/antibodies");
    readLatencies.push(readMs);
  }
  results.sqlite = {
    writeRuns: writeLatencies.length,
    writeMedian: +median(writeLatencies).toFixed(2),
    writeAvg: +avg(writeLatencies).toFixed(2),
    readRuns: readLatencies.length,
    readMedian: +median(readLatencies).toFixed(2),
    readAvg: +avg(readLatencies).toFixed(2),
  };
  console.log(`  write: median=${fmt(median(writeLatencies))} avg=${fmt(avg(writeLatencies))}`);
  console.log(`  read:  median=${fmt(median(readLatencies))} avg=${fmt(avg(readLatencies))}`);

  // ── 4. Command execution times ──
  console.log("▶ Benchmarking Magic 5 Commands...");
  // score
  const scoreTimings: number[] = [];
  for (let i = 0; i < 3; i++) {
    const { ms } = runCmd(["score"]);
    scoreTimings.push(ms);
  }
  // fix
  const fixTimings: number[] = [];
  for (let i = 0; i < 3; i++) {
    const { ms } = runCmd(["fix"]);
    fixTimings.push(ms);
  }
  // sync
  const syncTimings: number[] = [];
  for (let i = 0; i < 3; i++) {
    const { ms } = runCmd(["sync"]);
    syncTimings.push(ms);
  }
  // stop + start (already measured cold-start)
  const { ms: stopMs } = runCmd(["stop"]);
  await new Promise(r => setTimeout(r, 300));
  try { unlinkSync(resolve(CWD, ".afd/daemon.pid")); } catch {}
  try { unlinkSync(resolve(CWD, ".afd/daemon.port")); } catch {}
  const { ms: startMs } = runCmd(["start"]);

  results.commands = {
    start: { median: +median(coldStarts).toFixed(2) },
    stop: { single: +stopMs.toFixed(2) },
    score: { median: +median(scoreTimings).toFixed(2), avg: +avg(scoreTimings).toFixed(2) },
    fix: { median: +median(fixTimings).toFixed(2), avg: +avg(fixTimings).toFixed(2) },
    sync: { median: +median(syncTimings).toFixed(2), avg: +avg(syncTimings).toFixed(2) },
  };
  console.log(`  start: ${fmt(median(coldStarts))} | stop: ${fmt(stopMs)} | score: ${fmt(median(scoreTimings))} | fix: ${fmt(median(fixTimings))} | sync: ${fmt(median(syncTimings))}`);

  // Cleanup benchmark antibodies
  // (leave real ones, bench ones have "BENCH-" prefix — they'll persist but that's fine)

  // Stop daemon
  try { runCmd(["stop"]); } catch {}

  // ── Output JSON ──
  console.log("\n=== RESULTS_JSON_START ===");
  console.log(JSON.stringify(results, null, 2));
  console.log("=== RESULTS_JSON_END ===");
}

main();
