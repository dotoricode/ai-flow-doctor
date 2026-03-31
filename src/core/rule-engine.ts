/**
 * Custom Diagnostic Rule Engine
 *
 * Loads diagnostic rules from:
 *   1. Built-in rules (hardcoded IMM-001~003 equivalents)
 *   2. Project rules: .afd/rules/*.yml
 *
 * Each rule defines a condition + severity + auto-heal patches.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";
import { parse as parseYaml } from "./yaml-minimal";

// Re-declare types locally to avoid circular import with immune.ts
interface Symptom {
  id: string;
  patternType: string;
  fileTarget: string;
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
  patches: PatchOp[];
}

interface PatchOp {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: string;
}

// ── Rule Definition ──

export interface DiagnosticRule {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
  condition: RuleCondition;
  patches: PatchOp[];
}

export type RuleCondition =
  | { type: "file-missing"; path: string }
  | { type: "file-empty"; path: string; minLength?: number }
  | { type: "file-invalid-json"; path: string }
  | { type: "file-missing-line"; path: string; pattern: string }
  | { type: "file-contains"; path: string; pattern: string }; // inverse: triggers when pattern IS found

// ── Built-in Rules (IMM-001~003) ──

const CLAUDEIGNORE_DEFAULT = `# Autonomous Flow Daemon defaults
node_modules/
dist/
.afd/
*.log
.env
`;

const HOOKS_DEFAULT = `{
  "hooks": []
}
`;

const BUILTIN_RULES: DiagnosticRule[] = [
  {
    id: "IMM-001",
    title: "Missing .claudeignore",
    description:
      "No .claudeignore found. Without it, AI agents ingest node_modules, build artifacts, and other noise — wasting tokens and degrading context quality.",
    severity: "critical",
    condition: { type: "file-missing", path: ".claudeignore" },
    patches: [{ op: "add", path: "/.claudeignore", value: CLAUDEIGNORE_DEFAULT }],
  },
  {
    id: "IMM-002",
    title: "Missing or invalid hooks.json",
    description:
      "No valid .claude/hooks.json found. Without a hooks file, pre/post-command automation cannot be configured.",
    severity: "warning",
    condition: { type: "file-invalid-json", path: ".claude/hooks.json" },
    patches: [{ op: "add", path: "/.claude/hooks.json", value: HOOKS_DEFAULT }],
  },
  {
    id: "IMM-003",
    title: "Missing or empty CLAUDE.md",
    description:
      "No CLAUDE.md found or content is too short. AI agents have no project constitution to follow.",
    severity: "critical",
    condition: { type: "file-empty", path: "CLAUDE.md", minLength: 20 },
    patches: [{ op: "add", path: "/CLAUDE.md", value: "# Project Constitution\n\n<!-- Add project rules here -->\n" }],
  },
];

// ── Condition Evaluator ──

function evaluateCondition(cond: RuleCondition): { triggered: boolean; detail?: string } {
  switch (cond.type) {
    case "file-missing":
      return { triggered: !existsSync(cond.path) };

    case "file-empty": {
      if (!existsSync(cond.path)) return { triggered: true, detail: "file not found" };
      try {
        const content = readFileSync(cond.path, "utf-8").trim();
        const min = cond.minLength ?? 1;
        return {
          triggered: content.length < min,
          detail: `${content.length} chars (min: ${min})`,
        };
      } catch {
        return { triggered: true, detail: "unreadable" };
      }
    }

    case "file-invalid-json": {
      if (!existsSync(cond.path)) return { triggered: true, detail: "file not found" };
      try {
        JSON.parse(readFileSync(cond.path, "utf-8"));
        return { triggered: false };
      } catch {
        return { triggered: true, detail: "invalid JSON" };
      }
    }

    case "file-missing-line": {
      if (!existsSync(cond.path)) return { triggered: true, detail: "file not found" };
      try {
        const content = readFileSync(cond.path, "utf-8");
        const regex = new RegExp(cond.pattern);
        return { triggered: !regex.test(content), detail: `pattern /${cond.pattern}/ not found` };
      } catch {
        return { triggered: true, detail: "unreadable" };
      }
    }

    case "file-contains": {
      if (!existsSync(cond.path)) return { triggered: false }; // file doesn't exist → pattern can't be found
      try {
        const content = readFileSync(cond.path, "utf-8");
        const regex = new RegExp(cond.pattern);
        return { triggered: regex.test(content), detail: `pattern /${cond.pattern}/ found` };
      } catch {
        return { triggered: false };
      }
    }

    default:
      return { triggered: false };
  }
}

// ── Rule Loader ──

function loadYamlRules(rulesDir: string): DiagnosticRule[] {
  if (!existsSync(rulesDir)) return [];

  const rules: DiagnosticRule[] = [];

  let files: string[];
  try {
    files = readdirSync(rulesDir).filter(f => extname(f) === ".yml" || extname(f) === ".yaml");
  } catch {
    return [];
  }

  for (const file of files) {
    const filePath = join(rulesDir, file);
    try {
      if (!statSync(filePath).isFile()) continue;
      const content = readFileSync(filePath, "utf-8");
      const parsed = parseYaml(content);
      if (!parsed || !parsed.id || !parsed.condition) continue;

      const rule: DiagnosticRule = {
        id: String(parsed.id),
        title: String(parsed.title ?? parsed.id),
        description: String(parsed.description ?? ""),
        severity: validateSeverity(parsed.severity),
        condition: parseCondition(parsed.condition),
        patches: parsePatchOps(parsed.patches),
      };
      rules.push(rule);
    } catch {
      // Skip malformed rule files — crash-only design
    }
  }

  return rules;
}

function validateSeverity(val: unknown): "critical" | "warning" | "info" {
  if (val === "critical" || val === "warning" || val === "info") return val;
  return "warning";
}

function parseCondition(raw: unknown): RuleCondition {
  if (!raw || typeof raw !== "object") return { type: "file-missing", path: "" };
  const obj = raw as Record<string, unknown>;
  const type = String(obj.type ?? "file-missing");
  const path = String(obj.path ?? "");

  switch (type) {
    case "file-missing":
      return { type: "file-missing", path };
    case "file-empty":
      return { type: "file-empty", path, minLength: Number(obj.minLength ?? 1) };
    case "file-invalid-json":
      return { type: "file-invalid-json", path };
    case "file-missing-line":
      return { type: "file-missing-line", path, pattern: String(obj.pattern ?? "") };
    case "file-contains":
      return { type: "file-contains", path, pattern: String(obj.pattern ?? "") };
    default:
      return { type: "file-missing", path };
  }
}

function parsePatchOps(raw: unknown): PatchOp[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Record<string, unknown> => p && typeof p === "object")
    .map(p => ({
      op: (String(p.op ?? "add")) as PatchOp["op"],
      path: String(p.path ?? ""),
      value: p.value !== undefined ? String(p.value) : undefined,
    }));
}

// ── Public API ──

const RULES_DIR = join(".afd", "rules");

export function loadAllRules(): DiagnosticRule[] {
  const custom = loadYamlRules(RULES_DIR);
  // Custom rules can override built-in by ID
  const customIds = new Set(custom.map(r => r.id));
  const builtins = BUILTIN_RULES.filter(r => !customIds.has(r.id));
  return [...builtins, ...custom];
}

export function evaluateRules(
  rules: DiagnosticRule[],
  knownAntibodies: string[],
  opts?: { raw?: boolean },
): { symptoms: Symptom[]; healthy: string[] } {
  const symptoms: Symptom[] = [];
  const healthy: string[] = [];

  for (const rule of rules) {
    const result = evaluateCondition(rule.condition);

    if (!result.triggered) {
      healthy.push("OK");
      continue;
    }

    // In raw mode, report all symptoms regardless of antibodies
    if (!opts?.raw && knownAntibodies.includes(rule.id)) {
      healthy.push(`${rule.id} (immunized)`);
      continue;
    }

    symptoms.push({
      id: rule.id,
      patternType: rule.condition.type,
      fileTarget: "path" in rule.condition ? rule.condition.path : "",
      title: rule.title,
      description: result.detail
        ? `${rule.description} (${result.detail})`
        : rule.description,
      severity: rule.severity,
      patches: rule.patches,
    });
  }

  return { symptoms, healthy };
}

/** Convenience: load rules + evaluate in one call (replaces old diagnose()) */
export function diagnoseWithRules(
  knownAntibodies: string[],
  opts?: { raw?: boolean },
): { symptoms: Symptom[]; healthy: string[] } {
  const rules = loadAllRules();
  return evaluateRules(rules, knownAntibodies, opts);
}
