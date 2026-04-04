/**
 * afd setup — Interactive one-command setup for any project.
 *
 * Steps (each asks for user confirmation):
 *   1. Start daemon
 *   2. Register MCP server (.mcp.json)
 *   3. Inject CLAUDE.md afd instructions
 *   4. Run afd fix (health check)
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import { createInterface } from "readline";
import { getSystemLanguage } from "../core/locale";
import { platform } from "os";

// ── i18n ─────────────────────────────────────────────────────────────────────

const msgs = {
  en: {
    welcome: "afd setup — Interactive project configuration",
    stepDaemon: "Start afd daemon",
    stepMcp: "Register MCP server (.mcp.json)",
    stepClaude: "Add afd instructions to CLAUDE.md",
    stepFix: "Run health check (afd fix)",
    confirm: (step: string) => `  → ${step}? [Y/n] `,
    skip: (step: string) => `  ✗ Skipped: ${step}`,
    done: (step: string) => `  ✓ Done: ${step}`,
    already: (step: string) => `  · Already configured: ${step}`,
    allDone: "\nafd setup complete. Your project is protected.",
    hintDashboard: "  Run 'afd dashboard' to see live token savings.",
    hintRestart: "  Restart Claude Code or run /mcp to connect.",
  },
  ko: {
    welcome: "afd setup — 대화형 프로젝트 설정",
    stepDaemon: "afd 데몬 시작",
    stepMcp: "MCP 서버 등록 (.mcp.json)",
    stepClaude: "CLAUDE.md에 afd 지시 추가",
    stepFix: "상태 점검 실행 (afd fix)",
    confirm: (step: string) => `  → ${step} 진행할까요? [Y/n] `,
    skip: (step: string) => `  ✗ 건너뜀: ${step}`,
    done: (step: string) => `  ✓ 완료: ${step}`,
    already: (step: string) => `  · 이미 설정됨: ${step}`,
    allDone: "\nafd setup 완료. 프로젝트가 보호됩니다.",
    hintDashboard: "  'afd dashboard'로 실시간 토큰 절약량을 확인하세요.",
    hintRestart: "  Claude Code를 재시작하거나 /mcp로 연결하세요.",
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function ask(rl: ReturnType<typeof createInterface>, question: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === "" || trimmed === "y" || trimmed === "yes");
    });
  });
}

// ── MCP registration (inline — no circular import) ──────────────────────────

interface McpConfig {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

function getMcpEntry(): { command: string; args: string[] } {
  if (platform() === "win32") {
    return { command: "cmd", args: ["/c", "npx", "-y", "@dotoricode/afd", "start", "--mcp"] };
  }
  return { command: "npx", args: ["-y", "@dotoricode/afd", "start", "--mcp"] };
}

function registerMcp(filePath: string): "done" | "already" {
  let config: McpConfig = {};
  if (existsSync(filePath)) {
    try { config = JSON.parse(readFileSync(filePath, "utf-8")); } catch { config = {}; }
  }

  const servers = (config.mcpServers ?? {}) as Record<string, unknown>;
  const entry = getMcpEntry();
  const existing = servers.afd as { command?: string; args?: string[] } | undefined;

  if (existing?.command === entry.command &&
      JSON.stringify(existing.args) === JSON.stringify(entry.args)) {
    return "already";
  }

  servers.afd = entry;
  config.mcpServers = servers;
  writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  return "done";
}

// ── CLAUDE.md injection ─────────────────────────────────────────────────────

const AFD_MARKER = "<!-- afd:setup -->";

const AFD_CLAUDE_BLOCK = `${AFD_MARKER}
## afd — AI Token Optimizer & Self-Healing

This project uses [afd](https://www.npmjs.com/package/@dotoricode/afd) for token optimization and file protection.

### File Reading Rules
- **\`afd_read\` MCP 도구를 네이티브 Read 대신 사용하라.** 10KB 이상 파일은 자동으로 홀로그램(구조 스켈레톤)으로 압축되어 반환된다. 특정 구간이 필요하면 \`startLine\`/\`endLine\` 파라미터로 정밀 조회할 수 있다.
- **프로젝트 구조를 파악할 때는 \`afd://workspace-map\` MCP 리소스를 먼저 읽어라.** 파일 트리 + export 시그니처가 한 번에 제공된다.
- **대용량 파일(100줄+)의 구조를 파악할 때는 \`afd_hologram\` MCP 도구를 사용하라.** 타입 시그니처만 추출하여 80%+ 토큰을 절약한다.

### Self-Healing
- afd가 파일을 복구했다는 \`[afd]\` 메시지가 보이면, 해당 파일 편집을 중단하고 \`afd_hologram\`으로 구조를 먼저 파악하라.
${AFD_MARKER}`;

function injectClaudeMd(cwd: string): "done" | "already" {
  const claudePath = resolve(cwd, "CLAUDE.md");

  if (existsSync(claudePath)) {
    const content = readFileSync(claudePath, "utf-8");
    if (content.includes(AFD_MARKER)) return "already";
    writeFileSync(claudePath, content + "\n\n" + AFD_CLAUDE_BLOCK + "\n", "utf-8");
    return "done";
  }

  writeFileSync(claudePath, AFD_CLAUDE_BLOCK + "\n", "utf-8");
  return "done";
}

// ── Main ────────────────────────────────────────────────────────────────────

export async function setupCommand(): Promise<void> {
  const lang = getSystemLanguage();
  const m = msgs[lang];
  const cwd = process.cwd();

  console.log(`\n  ${m.welcome}\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    // Step 1: Start daemon
    if (await ask(rl, m.confirm(m.stepDaemon))) {
      const { isDaemonAlive } = await import("../daemon/client");
      if (isDaemonAlive()) {
        console.log(m.already(m.stepDaemon));
      } else {
        const { startCommand } = await import("./start");
        await startCommand({});
        console.log(m.done(m.stepDaemon));
      }
    } else {
      console.log(m.skip(m.stepDaemon));
    }

    // Step 2: MCP registration
    if (await ask(rl, m.confirm(m.stepMcp))) {
      const mcpPath = resolve(cwd, ".mcp.json");
      const result = registerMcp(mcpPath);
      console.log(result === "already" ? m.already(m.stepMcp) : m.done(m.stepMcp));
    } else {
      console.log(m.skip(m.stepMcp));
    }

    // Step 3: CLAUDE.md injection
    if (await ask(rl, m.confirm(m.stepClaude))) {
      const result = injectClaudeMd(cwd);
      console.log(result === "already" ? m.already(m.stepClaude) : m.done(m.stepClaude));
    } else {
      console.log(m.skip(m.stepClaude));
    }

    // Step 4: Health check
    if (await ask(rl, m.confirm(m.stepFix))) {
      const { fixCommand } = await import("./fix");
      await fixCommand({});
      console.log(m.done(m.stepFix));
    } else {
      console.log(m.skip(m.stepFix));
    }

    console.log(m.allDone);
    console.log(m.hintDashboard);
    console.log(m.hintRestart);
    console.log("");
  } finally {
    rl.close();
  }
}
