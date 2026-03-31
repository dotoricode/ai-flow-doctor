import { writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname } from "path";
import { daemonRequest } from "../daemon/client";
import type { Symptom, PatchOp, DiagnosisResult } from "../core/immune";

const SEVERITY_ICON: Record<string, string> = {
  critical: "[!]",
  warning: "[~]",
  info: "[i]",
};

function applyPatch(patch: PatchOp): boolean {
  // Map JSON-Patch path to filesystem path (strip leading /)
  const filePath = patch.path.replace(/^\//, "");

  if (patch.op === "add") {
    if (existsSync(filePath)) return false; // don't overwrite
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

  // remove, move, copy, test — not needed yet
  return false;
}

async function learnAntibody(symptom: Symptom): Promise<void> {
  await fetch(
    `http://127.0.0.1:${(await getDaemonPort())}/antibodies/learn`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: symptom.id,
        patternType: symptom.patternType,
        fileTarget: symptom.fileTarget,
        patches: symptom.patches,
      }),
    }
  );
}

async function getDaemonPort(): Promise<number> {
  const { readFileSync } = await import("fs");
  const { PORT_FILE } = await import("../constants");
  return parseInt(readFileSync(PORT_FILE, "utf-8").trim(), 10);
}

export async function fixCommand() {
  let diagnosis: DiagnosisResult;
  try {
    diagnosis = await daemonRequest<DiagnosisResult>("/diagnose");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[afd fix] ${msg}`);
    process.exit(1);
  }

  if (diagnosis.symptoms.length === 0) {
    console.log("[afd fix] No symptoms detected. System is healthy.");
    if (diagnosis.healthy.length > 0) {
      console.log(`[afd fix] Passed checks: ${diagnosis.healthy.join(", ")}`);
    }
    return;
  }

  // Display symptoms
  console.log(`\n[afd fix] Found ${diagnosis.symptoms.length} symptom(s):\n`);

  for (const s of diagnosis.symptoms) {
    const icon = SEVERITY_ICON[s.severity] ?? "[?]";
    console.log(`  ${icon} ${s.id}: ${s.title} (${s.severity})`);
    console.log(`      ${s.description}`);
    if (s.patches.length > 0) {
      console.log(`      Patch: ${s.patches.map(p => `${p.op} ${p.path}`).join(", ")}`);
    }
    console.log();
  }

  // Extract phase: inject hologram context for AI consumers
  const symptomsWithHologram = diagnosis.symptoms as (Symptom & { hologram?: string })[];
  const holograms = symptomsWithHologram.filter(s => s.hologram);
  if (holograms.length > 0) {
    console.log("[afd fix] Hologram Context (Extract phase — token-optimized file structures):\n");
    for (const s of holograms) {
      console.log(`  --- ${s.fileTarget} ---`);
      console.log(`  Here is the structural hologram of the file to help you understand`);
      console.log(`  its interfaces without consuming too many tokens:\n`);
      for (const line of s.hologram!.split("\n")) {
        console.log(`    ${line}`);
      }
      console.log(`\n  Now, generate the JSON-Patch based on the structure above.\n`);
    }
  }

  // Back-stage: dump full JSON-Patch for AI consumers
  const allPatches = diagnosis.symptoms.flatMap(s =>
    s.patches.map(p => ({ symptomId: s.id, ...p }))
  );
  console.log("[afd fix] JSON-Patch (back-stage):");
  console.log(JSON.stringify(allPatches, null, 2));
  console.log();

  // Prompt user
  process.stdout.write("Apply these fixes? [Y/n] ");
  const answer = await readLine();

  if (answer.toLowerCase() === "n") {
    console.log("[afd fix] Aborted.");
    return;
  }

  // Apply patches and learn antibodies
  let applied = 0;
  for (const symptom of diagnosis.symptoms) {
    if (symptom.patches.length === 0) continue;
    let success = true;
    for (const patch of symptom.patches) {
      if (!applyPatch(patch)) {
        console.log(`  [skip] ${patch.op} ${patch.path} (already exists or unsupported)`);
        success = false;
      } else {
        console.log(`  [done] ${patch.op} ${patch.path}`);
        applied++;
      }
    }
    if (success) {
      await learnAntibody(symptom);
      console.log(`  [immune] Learned antibody: ${symptom.id}`);
    }
  }

  console.log(`\n[afd fix] Applied ${applied} patch(es). Immune system updated.`);
}

function readLine(): Promise<string> {
  return new Promise((resolve) => {
    const buf: Buffer[] = [];
    process.stdin.setEncoding("utf-8");
    process.stdin.resume();
    process.stdin.once("data", (chunk: string) => {
      process.stdin.pause();
      resolve(chunk.toString().trim());
    });
  });
}
