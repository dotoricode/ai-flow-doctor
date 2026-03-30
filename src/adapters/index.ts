import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";

export interface HarnessSchema {
  configFiles: string[];
  ignoreFile: string | null;
  rulesFile: string | null;
  hooksFile: string | null;
}

export interface EcosystemAdapter {
  name: string;
  detect(cwd: string): boolean;
  getHarnessSchema(): HarnessSchema;
  injectHooks?(cwd: string): { injected: boolean; message: string };
  configureStatusLine?(cwd: string): { configured: boolean; message: string };
}

const AFD_HOOK_MARKER = "afd-auto-heal";

interface HooksConfig {
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
}

interface HookEntry {
  matcher?: string;
  command: string;
  id?: string;
  [key: string]: unknown;
}

export const ClaudeCodeAdapter: EcosystemAdapter = {
  name: "Claude Code",
  detect(cwd: string): boolean {
    return (
      existsSync(join(cwd, ".claude")) ||
      existsSync(join(cwd, "CLAUDE.md"))
    );
  },
  getHarnessSchema(): HarnessSchema {
    return {
      configFiles: [".claude/settings.json", ".claude/settings.local.json", "CLAUDE.md"],
      ignoreFile: ".claudeignore",
      rulesFile: "CLAUDE.md",
      hooksFile: ".claude/hooks.json",
    };
  },
  injectHooks(cwd: string): { injected: boolean; message: string } {
    const hooksPath = join(cwd, ".claude", "hooks.json");
    const hookCommand = "bun run " + join(cwd, "src", "cli.ts").replace(/\\/g, "/") + " diagnose --format a2a --auto-heal";

    const newHook: HookEntry = {
      id: AFD_HOOK_MARKER,
      matcher: "",
      command: hookCommand,
    };

    let config: HooksConfig;
    if (existsSync(hooksPath)) {
      try {
        config = JSON.parse(readFileSync(hooksPath, "utf-8"));
      } catch {
        config = { hooks: {} };
      }
    } else {
      mkdirSync(dirname(hooksPath), { recursive: true });
      config = { hooks: {} };
    }

    if (!config.hooks || Array.isArray(config.hooks) || typeof config.hooks !== "object") {
      config.hooks = {};
    }
    if (!config.hooks.PreToolUse) config.hooks.PreToolUse = [];

    // Check if already injected
    const existing = config.hooks.PreToolUse.find(
      (h: HookEntry) => h.id === AFD_HOOK_MARKER
    );
    if (existing) {
      // Update command in case path changed
      existing.command = hookCommand;
      writeFileSync(hooksPath, JSON.stringify(config, null, 2), "utf-8");
      return { injected: false, message: "Auto-heal hook already present (updated)" };
    }

    config.hooks.PreToolUse.push(newHook);
    writeFileSync(hooksPath, JSON.stringify(config, null, 2), "utf-8");
    return { injected: true, message: "Auto-heal hook injected into PreToolUse" };
  },
  configureStatusLine(cwd: string): { configured: boolean; message: string } {
    const settingsPath = join(cwd, ".claude", "settings.local.json");
    const statusScript = join(cwd, ".claude", "statusline-command.js").replace(/\\/g, "/");

    // Only configure if the statusline-command.js exists
    if (!existsSync(statusScript)) {
      return { configured: false, message: "No statusline-command.js found" };
    }

    let settings: Record<string, unknown>;
    if (existsSync(settingsPath)) {
      try {
        settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      } catch {
        settings = {};
      }
    } else {
      mkdirSync(dirname(settingsPath), { recursive: true });
      settings = {};
    }

    const expectedCommand = `node ${statusScript}`;
    const current = settings.statusLine as { type?: string; command?: string } | undefined;

    if (current?.type === "command" && current?.command === expectedCommand) {
      return { configured: false, message: "Status line already configured" };
    }

    settings.statusLine = { type: "command", command: expectedCommand };
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
    return { configured: true, message: "Status line configured with afd integration" };
  },
};

export const CursorAdapter: EcosystemAdapter = {
  name: "Cursor",
  detect(cwd: string): boolean {
    return existsSync(join(cwd, ".cursorrules"));
  },
  getHarnessSchema(): HarnessSchema {
    return {
      configFiles: [".cursorrules", ".cursor/settings.json"],
      ignoreFile: ".cursorignore",
      rulesFile: ".cursorrules",
      hooksFile: null,
    };
  },
};

const adapters: EcosystemAdapter[] = [ClaudeCodeAdapter, CursorAdapter];

export interface DetectionResult {
  adapter: EcosystemAdapter;
  confidence: "primary" | "secondary";
}

export function detectEcosystem(cwd: string): DetectionResult[] {
  const results: DetectionResult[] = [];
  for (const adapter of adapters) {
    if (adapter.detect(cwd)) {
      results.push({
        adapter,
        confidence: results.length === 0 ? "primary" : "secondary",
      });
    }
  }
  return results;
}
