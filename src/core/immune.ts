import { diagnoseWithRules, loadAllRules, evaluateRules } from "./rule-engine";
export type { DiagnosticRule } from "./rule-engine";
export { loadAllRules, evaluateRules };

// RFC 6902 JSON-Patch operation
export interface PatchOp {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: string;
}

export interface Symptom {
  id: string;
  patternType: string;
  fileTarget: string;
  // Front-stage: human-readable
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
  // Back-stage: AI-optimized
  patches: PatchOp[];
}

export interface DiagnosisResult {
  symptoms: Symptom[];
  healthy: string[];
}

/**
 * Run diagnosis using the rule engine.
 * Loads built-in rules + custom .afd/rules/*.yml rules.
 */
export function diagnose(knownAntibodies: string[], opts?: { raw?: boolean }): DiagnosisResult {
  return diagnoseWithRules(knownAntibodies, opts);
}
