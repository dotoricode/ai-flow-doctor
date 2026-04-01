import { writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname } from "path";
import { daemonRequest, getDaemonInfo } from "../daemon/client";
import type { Symptom, PatchOp, DiagnosisResult } from "../core/immune";
import { notifyAutoHeal } from "../core/notify";

interface DiagnoseOptions {
  format?: string;
  autoHeal?: boolean;
}

interface AutoHealResponse {
  status: string;
  healed: string[];
  skipped: string[];
}

function applyPatch(patch: PatchOp): boolean {
  const filePath = patch.path.replace(/^\//, "");

  // Guard: reject path traversal attempts
  if (filePath.includes("..") || filePath.startsWith("/") || /^[A-Za-z]:/.test(filePath)) return false;

  if (patch.op === "add") {
    if (existsSync(filePath)) return false;
    const dir = dirname(filePath);
    if (dir !== ".") mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, patch.value ?? "", "utf-8");
    return true;
  }

  if (patch.op === "replace") {
    const dir = dirname(filePath);
    if (dir !== ".") mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, patch.value ?? "", "utf-8");
    return true;
  }

  return false;
}

export async function diagnoseCommand(opts: DiagnoseOptions) {
  const isA2A = opts.format === "a2a";
  const autoHeal = opts.autoHeal === true;

  let diagnosis: DiagnosisResult;
  // In auto-heal mode, use raw diagnosis to detect regressions even for immunized patterns
  const diagnosePath = autoHeal ? "/diagnose?raw=true" : "/diagnose";
  try {
    diagnosis = await daemonRequest<DiagnosisResult>(diagnosePath);
  } catch {
    // Daemon not running — exit silently in auto-heal mode to not block agent
    if (autoHeal) process.exit(0);
    console.error("[afd diagnose] Daemon not running. Run `afd start` first.");
    process.exit(1);
  }

  // Helper: fetch past mistakes for passive defense injection
  async function fetchPastMistakes(): Promise<string[]> {
    if (!isA2A) return [];
    try {
      const info = getDaemonInfo();
      if (!info) return [];
      // Query all recent mistakes (not file-specific in healthy path)
      const resp = await fetch(`http://127.0.0.1:${info.port}/mistake-history?file=*`, {
        signal: AbortSignal.timeout(500),
      });
      // Fall back to empty if the wildcard isn't supported
      return [];
    } catch { return []; }
  }

  async function fetchMistakesForFiles(files: string[]): Promise<string[]> {
    if (!isA2A) return [];
    const warnings: string[] = [];
    try {
      const info = getDaemonInfo();
      if (!info) return [];
      for (const file of files.slice(0, 3)) {
        try {
          const resp = await fetch(`http://127.0.0.1:${info.port}/mistake-history?file=${encodeURIComponent(file)}`, {
            signal: AbortSignal.timeout(500),
          });
          const data = await resp.json() as { mistakes: { mistake_type: string; description: string }[] };
          for (const m of data.mistakes.slice(0, 3)) {
            warnings.push(`Previous mistake on ${file}: '${m.description}'. Be careful.`.slice(0, 200));
          }
        } catch { /* skip this file */ }
      }
    } catch { /* crash-only */ }
    return warnings;
  }

  // No symptoms — nothing to do
  if (diagnosis.symptoms.length === 0) {
    if (isA2A) {
      const output: Record<string, unknown> = { status: "healthy", symptoms: [], healed: [] };
      // Inject past mistakes even when healthy (proactive warning)
      const pastMistakes = await fetchPastMistakes();
      if (pastMistakes.length > 0) output.pastMistakes = pastMistakes;
      console.log(JSON.stringify(output));
    } else {
      console.log("[afd diagnose] System healthy.");
    }
    return;
  }

  if (!autoHeal) {
    // Non-auto mode: just report
    if (isA2A) {
      console.log(JSON.stringify({
        status: "symptomatic",
        symptoms: diagnosis.symptoms.map(s => ({
          id: s.id,
          title: s.title,
          severity: s.severity,
          patches: s.patches,
        })),
      }));
    } else {
      for (const s of diagnosis.symptoms) {
        console.log(`[${s.severity}] ${s.id}: ${s.title}`);
      }
    }
    return;
  }

  // Auto-heal mode: only apply patches for symptoms that have known antibodies
  // Query antibodies to see which patterns we've learned before
  let knownIds: string[];
  try {
    const abData = await daemonRequest<{ antibodies: { id: string }[] }>("/antibodies");
    knownIds = abData.antibodies.map(a => a.id);
  } catch {
    if (isA2A) console.log(JSON.stringify({ status: "error", healed: [], skipped: [] }));
    process.exit(0);
  }

  const healed: string[] = [];
  const skipped: string[] = [];

  for (const symptom of diagnosis.symptoms) {
    // Only auto-heal if we have a known antibody for this pattern
    if (!knownIds.includes(symptom.id)) {
      skipped.push(symptom.id);
      continue;
    }

    if (symptom.patches.length === 0) {
      skipped.push(symptom.id);
      continue;
    }

    let applied = false;
    for (const patch of symptom.patches) {
      if (applyPatch(patch)) applied = true;
    }

    if (applied) {
      // Notify daemon of auto-heal event
      try {
        const info = getDaemonInfo();
        if (info) {
          await fetch(`http://127.0.0.1:${info.port}/auto-heal/record`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: symptom.id }),
            signal: AbortSignal.timeout(1000),
          });
        }
      } catch {
        // Non-critical — don't block
      }
      // Fire OS toast notification (async, non-blocking)
      notifyAutoHeal(symptom.id);
      healed.push(symptom.id);
    } else {
      skipped.push(symptom.id);
    }
  }

  if (isA2A) {
    const output: Record<string, unknown> = { status: healed.length > 0 ? "healed" : "no-action", healed, skipped };
    // Inject past mistakes for healed files (passive defense)
    const affectedFiles = diagnosis.symptoms.map(s => s.fileTarget ?? s.id).filter(Boolean);
    const pastMistakes = await fetchMistakesForFiles(affectedFiles);
    if (pastMistakes.length > 0) output.pastMistakes = pastMistakes;
    console.log(JSON.stringify(output));
  } else {
    if (healed.length > 0) console.log(`[afd diagnose] Auto-healed: ${healed.join(", ")}`);
    if (skipped.length > 0) console.log(`[afd diagnose] Skipped (unknown): ${skipped.join(", ")}`);
  }
}
