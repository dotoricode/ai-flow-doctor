import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { getDaemonInfo, isDaemonAlive, daemonRequest } from "../daemon/client";
import { resolveWorkspacePaths } from "../constants";
import { getSystemLanguage } from "../core/locale";

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

const ko = getSystemLanguage() === "ko";

interface HealthData {
  status: string;
  pid: number;
  workspace: string;
  port: number;
}

interface ScoreData {
  uptime: number;
  immune: { antibodies: number; autoHealed: number };
  ecosystem: { primary: string };
  dynamicImmune?: { activeValidators: number };
}

function checkHooksInjected(): boolean {
  const hooksPath = join(resolveWorkspacePaths().root, ".claude/hooks.json");
  if (!existsSync(hooksPath)) return false;
  try {
    const content = readFileSync(hooksPath, "utf-8");
    return content.includes("afd-auto-heal");
  } catch {
    return false;
  }
}

function checkMcpRegistered(): boolean {
  const mcpPath = join(resolveWorkspacePaths().root, ".mcp.json");
  if (!existsSync(mcpPath)) return false;
  try {
    const content = readFileSync(mcpPath, "utf-8");
    return content.includes('"afd"');
  } catch {
    return false;
  }
}

function getQuarantinedFiles(): string[] {
  const paths = resolveWorkspacePaths();
  if (!existsSync(paths.quarantineDir)) return [];
  try {
    return readdirSync(paths.quarantineDir).sort().reverse();
  } catch {
    return [];
  }
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function indicator(ok: boolean): string {
  return ok ? `${C.green}●${C.reset}` : `${C.red}●${C.reset}`;
}

export async function statusCommand() {
  const out: string[] = [];

  out.push("");
  out.push(`${C.bold}afd status${C.reset}`);
  out.push("");

  // ── 1. Daemon ──
  const info = getDaemonInfo();
  if (!info || !(await isDaemonAlive(info))) {
    out.push(`  ${C.red}●${C.reset} ${C.bold}Daemon${C.reset}       ${C.red}STOPPED${C.reset}`);
    out.push("");
    out.push(`  ${C.dim}${ko ? "→ afd start 를 실행하세요" : "→ Run afd start to activate"}${C.reset}`);
    out.push("");
    console.log(out.join("\n"));
    return;
  }

  // Fetch live data
  let score: ScoreData | null = null;
  try {
    score = await daemonRequest<ScoreData>("/score");
  } catch { /* use fallback */ }

  const uptime = score ? formatUptime(score.uptime) : "?";
  const ecosystem = score?.ecosystem.primary ?? "Unknown";

  out.push(`  ${C.green}●${C.reset} ${C.bold}Daemon${C.reset}       ${C.green}ACTIVE${C.reset} ${C.dim}(pid=${info.pid} port=${info.port})${C.reset}`);
  out.push(`  ${C.dim}  Uptime${C.reset}      ${uptime}  ${C.dim}|${C.reset}  ${ecosystem}`);
  out.push("");

  // ── 2. Connections ──
  out.push(`  ${C.bold}${ko ? "연결 상태" : "Connections"}${C.reset}`);

  const hooksOk = checkHooksInjected();
  out.push(`  ${indicator(hooksOk)} Hook        ${hooksOk ? `${C.green}INJECTED${C.reset}` : `${C.red}MISSING${C.reset} ${C.dim}(afd start로 주입)${C.reset}`}`);

  const mcpOk = checkMcpRegistered();
  out.push(`  ${indicator(mcpOk)} MCP         ${mcpOk ? `${C.green}REGISTERED${C.reset}` : `${C.yellow}NOT SET${C.reset}`}`);

  out.push("");

  // ── 3. Defenses ──
  out.push(`  ${C.bold}${ko ? "방어막" : "Defenses"}${C.reset}`);

  const antibodies = score?.immune.antibodies ?? 0;
  const healed = score?.immune.autoHealed ?? 0;
  const validators = score?.dynamicImmune?.activeValidators ?? 0;

  out.push(`  ${indicator(antibodies > 0)} ${ko ? "항체" : "Antibodies"}   ${C.bold}${antibodies}${C.reset} ${ko ? "활성" : "active"}${healed > 0 ? `  ${C.dim}(${healed}${ko ? "회 치유" : " healed"})${C.reset}` : ""}`);
  out.push(`  ${indicator(validators > 0)} ${ko ? "검증기" : "Validators"}  ${validators > 0 ? `${C.bold}${validators}${C.reset} ${ko ? "로드됨" : "loaded"}` : `${C.dim}${ko ? "없음" : "none"}${C.reset} ${C.dim}(.afd/validators/)${C.reset}`}`);

  out.push("");

  // ── 4. Quarantine ──
  const quarantined = getQuarantinedFiles();

  if (quarantined.length > 0) {
    out.push(`  ${C.yellow}⚠${C.reset}  ${C.bold}${C.yellow}${ko ? "격리 구역" : "Quarantine"}${C.reset} ${C.dim}(${quarantined.length} ${ko ? "파일" : "file"}${quarantined.length !== 1 ? "s" : ""})${C.reset}`);

    const show = quarantined.slice(0, 5);
    for (const file of show) {
      out.push(`     ${C.dim}${file}${C.reset}`);
    }
    if (quarantined.length > 5) {
      out.push(`     ${C.dim}... +${quarantined.length - 5} more${C.reset}`);
    }

    out.push("");
    out.push(`  ${C.dim}💡 ${ko
      ? "격리된 파일에서 코드를 구출하거나 불필요하면 삭제하세요."
      : "Rescue code from quarantined files or delete if unneeded."}${C.reset}`);
    out.push(`  ${C.dim}   ${ko ? "경로" : "Path"}: .afd/quarantine/${C.reset}`);
  } else {
    out.push(`  ${C.green}●${C.reset} ${ko ? "격리 구역" : "Quarantine"}   ${C.dim}${ko ? "비어있음 — 이상 없음" : "empty — all clear"}${C.reset}`);
  }

  out.push("");
  console.log(out.join("\n"));
}
