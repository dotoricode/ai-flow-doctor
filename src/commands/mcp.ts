/**
 * afd mcp — MCP server management
 *
 * Subcommands:
 *   install  — Register afd as an MCP server in project and global Claude config
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, resolve, dirname } from "path";
import { homedir } from "os";
import { getSystemLanguage } from "../core/locale";

const msgs = {
  en: {
    usage: "Usage: afd mcp install",
    unknownSub: (s: string) => `Unknown subcommand: ${s}. Use: afd mcp install`,
    installing: "Registering afd MCP server...",
    projectDone: (p: string) => `  [project] Registered in ${p}`,
    projectSkip: (p: string) => `  [project] Already registered in ${p}`,
    globalDone: (p: string) => `  [global]  Registered in ${p}`,
    globalSkip: (p: string) => `  [global]  Already registered in ${p}`,
    success: "afd MCP server registration complete. Restart Claude Code to activate.",
    hintRestart: "  Hint: Run 'claude --reload-plugins' or restart the IDE to pick up the new MCP server.",
  },
  ko: {
    usage: "사용법: afd mcp install",
    unknownSub: (s: string) => `알 수 없는 하위 명령: ${s}. 사용: afd mcp install`,
    installing: "afd MCP 서버 등록 중...",
    projectDone: (p: string) => `  [project] ${p}에 등록 완료`,
    projectSkip: (p: string) => `  [project] ${p}에 이미 등록됨`,
    globalDone: (p: string) => `  [global]  ${p}에 등록 완료`,
    globalSkip: (p: string) => `  [global]  ${p}에 이미 등록됨`,
    success: "afd MCP 서버 등록 완료. Claude Code를 재시작하면 활성화됩니다.",
    hintRestart: "  힌트: 'claude --reload-plugins' 또는 IDE를 재시작하여 MCP 서버를 인식시키세요.",
  },
};

interface McpServerEntry {
  command: string;
  args: string[];
  [key: string]: unknown;
}

interface McpConfig {
  mcpServers?: Record<string, McpServerEntry>;
  [key: string]: unknown;
}

/** The canonical MCP server definition for afd */
function afdMcpEntry(): McpServerEntry {
  return {
    command: "bun",
    args: ["run", "src/daemon/server.ts", "--mcp"],
  };
}

/** Register afd in a JSON config file's mcpServers section */
function registerInFile(filePath: string, entry: McpServerEntry): "done" | "skip" {
  let config: McpConfig = {};
  if (existsSync(filePath)) {
    try {
      config = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      config = {};
    }
  } else {
    mkdirSync(dirname(filePath), { recursive: true });
  }

  const servers = (config.mcpServers ?? {}) as Record<string, McpServerEntry>;
  const existing = servers.afd;

  if (existing?.command === entry.command &&
      JSON.stringify(existing.args) === JSON.stringify(entry.args)) {
    return "skip";
  }

  servers.afd = entry;
  config.mcpServers = servers;
  writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  return "done";
}

/** Resolve the global Claude Code settings path (cross-platform) */
function globalClaudeConfigPath(): string {
  return join(homedir(), ".claude.json");
}

export async function mcpCommand(subcommand?: string) {
  const lang = getSystemLanguage();
  const m = msgs[lang];

  if (!subcommand) {
    console.log(m.usage);
    return;
  }

  if (subcommand !== "install") {
    console.error(m.unknownSub(subcommand));
    process.exit(1);
  }

  console.log(m.installing);

  const entry = afdMcpEntry();

  // 1. Project-level: .mcp.json
  const projectPath = resolve(".mcp.json");
  const projectResult = registerInFile(projectPath, entry);
  console.log(projectResult === "done" ? m.projectDone(projectPath) : m.projectSkip(projectPath));

  // 2. Global-level: ~/.claude.json — mcpServers section
  const globalPath = globalClaudeConfigPath();
  const globalResult = registerInFile(globalPath, entry);
  console.log(globalResult === "done" ? m.globalDone(globalPath) : m.globalSkip(globalPath));

  console.log("");
  console.log(m.success);
  console.log(m.hintRestart);
}
