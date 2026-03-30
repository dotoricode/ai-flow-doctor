import { existsSync, readFileSync } from "fs";

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

type Check = () => Symptom | null;

const checks: Check[] = [
  // Check 1: Missing .claudeignore
  () => {
    if (existsSync(".claudeignore")) return null;
    return {
      id: "IMM-001",
      patternType: "missing-file",
      fileTarget: ".claudeignore",
      title: "Missing .claudeignore",
      description:
        "No .claudeignore found. Without it, AI agents ingest node_modules, build artifacts, and other noise — wasting tokens and degrading context quality.",
      severity: "critical",
      patches: [
        { op: "add", path: "/.claudeignore", value: CLAUDEIGNORE_DEFAULT },
      ],
    };
  },

  // Check 2: Missing .claude/hooks.json fallback
  () => {
    const hooksPath = ".claude/hooks.json";
    if (existsSync(hooksPath)) {
      try {
        const content = readFileSync(hooksPath, "utf-8");
        JSON.parse(content);
        return null;
      } catch {
        return {
          id: "IMM-002",
          patternType: "invalid-json",
          fileTarget: hooksPath,
          title: "Invalid hooks.json",
          description:
            "hooks.json exists but contains invalid JSON. Agents may fail silently when hooks cannot be parsed.",
          severity: "critical",
          patches: [
            { op: "replace", path: "/.claude/hooks.json", value: HOOKS_DEFAULT },
          ],
        };
      }
    }
    return {
      id: "IMM-002",
      patternType: "missing-file",
      fileTarget: hooksPath,
      title: "No fallback in hooks.json",
      description:
        "No .claude/hooks.json found. Without a hooks file, pre/post-command automation cannot be configured.",
      severity: "warning",
      patches: [
        { op: "add", path: "/.claude/hooks.json", value: HOOKS_DEFAULT },
      ],
    };
  },

  // Check 3: CLAUDE.md missing or empty
  () => {
    if (!existsSync("CLAUDE.md")) {
      return {
        id: "IMM-003",
        patternType: "missing-file",
        fileTarget: "CLAUDE.md",
        title: "Missing CLAUDE.md",
        description:
          "No CLAUDE.md found. AI agents have no project constitution to follow.",
        severity: "critical",
        patches: [
          { op: "add", path: "/CLAUDE.md", value: "# Project Constitution\n\n<!-- Add project rules here -->\n" },
        ],
      };
    }
    const content = readFileSync("CLAUDE.md", "utf-8").trim();
    if (content.length < 20) {
      return {
        id: "IMM-003",
        patternType: "insufficient-content",
        fileTarget: "CLAUDE.md",
        title: "CLAUDE.md is nearly empty",
        description:
          `CLAUDE.md has only ${content.length} chars. Agents work better with clear project rules.`,
        severity: "info",
        patches: [],
      };
    }
    return null;
  },
];

export function diagnose(knownAntibodies: string[], opts?: { raw?: boolean }): DiagnosisResult {
  const symptoms: Symptom[] = [];
  const healthy: string[] = [];

  for (const check of checks) {
    const symptom = check();
    if (!symptom) {
      healthy.push("OK");
      continue;
    }
    // In raw mode, report all symptoms regardless of antibodies
    // (used by auto-heal to detect regressions)
    if (!opts?.raw && knownAntibodies.includes(symptom.id)) {
      healthy.push(`${symptom.id} (immunized)`);
      continue;
    }
    symptoms.push(symptom);
  }

  return { symptoms, healthy };
}
