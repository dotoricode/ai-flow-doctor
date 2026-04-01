/**
 * afd watch — Security Command Center
 *
 * Split-pane TUI: left=vital stats, right=live event stream.
 * Connects to daemon SSE + polls /score and /shift-summary.
 */

import { daemonRequest, getDaemonInfo } from "../daemon/client";
import { getSystemLanguage } from "../core/locale";
import type { ShiftSummary } from "../core/boast";

// ── ANSI ──
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  white: "\x1b[37m",
};

const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";

// ── i18n ──
const msgs = {
  en: {
    title: "afd Command Center",
    connecting: "Connecting to daemon...",
    notRunning: "Daemon not running. Start with: afd start",
    noEvents: "Watching for threats...",
    noise: "noise filtered",
  },
  ko: {
    title: "afd 커맨드 센터",
    connecting: "데몬에 연결 중...",
    notRunning: "데몬이 실행 중이 아닙니다. afd start로 시작하세요.",
    noEvents: "위협을 감시 중...",
    noise: "노이즈 필터링",
  },
};

// ── Visual width (CJK/emoji aware) ──
function vw(s: string): number {
  const stripped = s.replace(/\x1b\[[0-9;]*m/g, "");
  let w = 0;
  for (const ch of stripped) {
    const cp = ch.codePointAt(0)!;
    if ((cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x2e80 && cp <= 0x9fff) ||
        (cp >= 0xac00 && cp <= 0xd7af) || (cp >= 0xf900 && cp <= 0xfaff) ||
        (cp >= 0x1f000 && cp <= 0x1faff) || (cp >= 0x20000 && cp <= 0x2fa1f)) w += 2;
    else w += 1;
  }
  return w;
}

/** Pad/truncate content to exact visual width */
function fit(s: string, width: number): string {
  const w = vw(s);
  if (w >= width) {
    // Truncate
    let len = 0; let cut = 0;
    for (const ch of s) {
      // Skip ANSI sequences
      if (ch === "\x1b") { cut += ch.length; continue; }
      const cp = ch.codePointAt(0)!;
      const cw = ((cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x2e80 && cp <= 0x9fff) ||
        (cp >= 0xac00 && cp <= 0xd7af) || (cp >= 0xf900 && cp <= 0xfaff) ||
        (cp >= 0x1f000 && cp <= 0x1faff) || (cp >= 0x20000 && cp <= 0x2fa1f)) ? 2 : 1;
      if (len + cw > width - 1) break;
      len += cw;
      cut += ch.length;
    }
    return s.slice(0, cut) + "…" + " ".repeat(Math.max(0, width - len - 1));
  }
  return s + " ".repeat(width - w);
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function fmtNum(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

// ── Noise filter ──
const NOISE_PATTERNS = [/\.tmp$/, /\.swp$/, /~$/, /\.DS_Store/, /thumbs\.db/i];
function isNoise(msg: string): boolean {
  return NOISE_PATTERNS.some(p => p.test(msg));
}

// ── Narrative ──
function extractFileName(msg: string): string {
  const match = msg.match(/→\s*(\S+)/) || msg.match(/(?:in|on|for)\s+(\S+)/);
  if (match) {
    const name = match[1].replace(/[().,;]+$/, "");
    return name.length > 25 ? "…" + name.slice(-22) : name;
  }
  return "file";
}

function narrativeEvent(phase: string, msg: string, lang: "en" | "ko"): { icon: string; text: string; color: string } {
  const f = extractFileName(msg);
  if (phase === "Mutate") {
    if (msg.includes("Restoring") || msg.includes("Restored") || msg.includes("corruption"))
      return { icon: "🚨", text: lang === "ko" ? `차단: ${f} 손상 복구 완료` : `BLOCKED: ${f} corruption reverted`, color: C.red };
    return { icon: "🩹", text: lang === "ko" ? `복구 완료: ${f}` : `Restored: ${f}`, color: C.yellow };
  }
  if (phase === "Adapt") {
    if (msg.includes("seeded") || msg.includes("updated"))
      return { icon: "🧬", text: lang === "ko" ? `${f} 메모리 업데이트` : `Memory updated: ${f}`, color: C.cyan };
    if (msg.includes("Double-tap") || msg.includes("dormant"))
      return { icon: "🤝", text: lang === "ko" ? `${f} 보호 해제` : `Standing down: ${f}`, color: C.dim };
    if (msg.includes("Validator"))
      return { icon: "🧬", text: msg.slice(0, 45), color: C.cyan };
    return { icon: "🧪", text: msg.slice(0, 45), color: C.yellow };
  }
  if (phase === "Quarantine")
    return { icon: "🔒", text: lang === "ko" ? `${f} 격리 저장` : `Quarantined: ${f}`, color: C.magenta };
  if (phase === "Sense") {
    if (msg.includes("unlink"))
      return { icon: "⚠️", text: lang === "ko" ? `삭제 감지: ${f}` : `Deletion: ${f}`, color: C.red };
    if (msg.includes("change"))
      return { icon: "👀", text: lang === "ko" ? `AI가 ${f} 접근 중...` : `AI accessing ${f}...`, color: C.dim };
    return { icon: "🔍", text: msg.slice(0, 45), color: C.dim };
  }
  if (phase === "Extract")
    return { icon: "☁️", text: lang === "ko" ? `토큰 압축: ${f}` : `Token compress: ${f}`, color: C.cyan };
  return { icon: "📌", text: msg.slice(0, 45), color: C.dim };
}

// ── Sparkline ──
const SPARK_CHARS = " ▁▂▃▄▅▆▇";
function sparkline(buckets: number[]): string {
  const max = Math.max(...buckets, 1);
  return buckets.map(v => SPARK_CHARS[Math.min(Math.round(v / max * 7), 7)]).join("");
}

// ── Types ──
interface ScoreData {
  uptime: number;
  filesDetected: number;
  totalEvents: number;
  watchedFiles: string[];
  immune: { antibodies: number; autoHealed: number };
  hologram: { lifetime: { requests: number; savings: number } };
  ecosystem: { primary: string };
  evolution?: { totalQuarantined: number; totalLearned: number; pending: number };
  dynamicImmune?: { activeValidators: number; validatorNames: string[] };
}

interface LiveEvent { phase: string; msg: string; ts: number; }
interface DisplayEvent { icon: string; text: string; color: string; time: string; }

// ══════════════════════════════════════════════════════════
export async function watchCommand() {
  const lang = getSystemLanguage();
  const m = msgs[lang];

  const info = getDaemonInfo();
  if (!info) {
    console.error(`${C.red}${m.notRunning}${C.reset}`);
    process.exit(1);
  }

  console.log(`${C.dim}${m.connecting}${C.reset}`);

  // ── State ──
  let score: ScoreData | null = null;
  let roi: ShiftSummary | null = null;
  const displayLog: DisplayEvent[] = [];
  const MAX_EVENTS = 20;
  let noiseCount = 0;
  const activityBuckets: number[] = new Array(20).fill(0);
  let bucketIndex = 0;
  let lastRender = "";

  // ── Data fetchers ──
  async function refreshAll() {
    try { score = await daemonRequest<ScoreData>("/score"); } catch {}
    try { roi = await daemonRequest<ShiftSummary>("/shift-summary"); } catch {}
  }

  await refreshAll();
  const scoreInterval = setInterval(refreshAll, 5000);

  // Activity bucket rotation (every 3s)
  const bucketInterval = setInterval(() => {
    bucketIndex = (bucketIndex + 1) % activityBuckets.length;
    activityBuckets[bucketIndex] = 0;
  }, 3000);

  // ── SSE ──
  const sseAbort = new AbortController();
  fetch(`http://127.0.0.1:${info.port}/events`, { signal: sseAbort.signal })
    .then(async (res) => {
      if (!res.body) return;
      const decoder = new TextDecoder();
      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        for (const line of text.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as LiveEvent;
            activityBuckets[bucketIndex]++;
            if (isNoise(evt.msg)) { noiseCount++; continue; }
            const narrative = narrativeEvent(evt.phase, evt.msg, lang);
            const time = new Date(evt.ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
            displayLog.push({ ...narrative, time });
            if (displayLog.length > MAX_EVENTS) displayLog.shift();
            render();
          } catch {}
        }
      }
    }).catch(() => {});

  // ── Layout constants ──
  const LW = 36; // left pane inner width
  const RW = 42; // right pane inner width
  const TW = LW + RW + 3; // total width (│ left │ right │)
  const H_LINE = "─";
  const V = "│";

  function hTop() { return `╭${H_LINE.repeat(LW)}┬${H_LINE.repeat(RW)}╮`; }
  function hMid() { return `├${H_LINE.repeat(LW)}┼${H_LINE.repeat(RW)}┤`; }
  function hMidL() { return `├${H_LINE.repeat(LW)}┤${" ".repeat(RW)}│`; }
  function hBot() { return `╰${H_LINE.repeat(LW)}┴${H_LINE.repeat(RW)}╯`; }
  function dualRow(left: string, right: string): string {
    return `${V}${fit(left, LW)}${V}${fit(right, RW)}${V}`;
  }

  // ── Render ──
  function render() {
    const lines: string[] = [];

    // Title bar
    const titleL = ` 🛡️  ${C.bold}${m.title}${C.reset}`;
    const titleR = ` ${C.bold}⚡ ${lang === "ko" ? "실시간 이벤트" : "Live Events"}${C.reset}`;
    lines.push(hTop());
    lines.push(dualRow(titleL, titleR));
    lines.push(hMid());

    // ── Left: Vital Stats ──
    const up = score ? formatUptime(score.uptime) : "--";
    const eco = score?.ecosystem.primary ?? "?";
    const ab = score?.immune.antibodies ?? 0;
    const healed = score?.immune.autoHealed ?? 0;
    const validators = score?.dynamicImmune?.activeValidators ?? 0;
    const totalTokens = roi ? fmtNum(roi.totalTokensSaved) : "0";
    const totalCost = roi ? `$${roi.totalCostSaved.toFixed(2)}` : "$0.00";

    // Row builder for left pane
    const leftLines: string[] = [];

    // System
    leftLines.push(` ${C.green}●${C.reset} ${C.bold}${eco}${C.reset} ${C.dim}(${up})${C.reset}`);
    leftLines.push("");

    // ROI
    leftLines.push(` ${C.bold}${lang === "ko" ? "💰 누적 ROI" : "💰 Total ROI"}${C.reset}`);
    leftLines.push(` ${C.green}${C.bold}${totalCost}${C.reset} ${C.dim}(${totalTokens} tok)${C.reset}`);
    if (roi && (roi.healCostSaved > 0 || roi.hologramCostSaved > 0)) {
      leftLines.push(` ${C.dim}  🩹 $${roi.healCostSaved.toFixed(2)}  💎 $${roi.hologramCostSaved.toFixed(2)}${C.reset}`);
    }
    leftLines.push("");

    // Defenses
    leftLines.push(` ${C.bold}${lang === "ko" ? "🧬 면역 상태" : "🧬 Immune"}${C.reset}`);
    leftLines.push(` ${C.dim}${lang === "ko" ? "항체" : "Antibodies"}${C.reset}  ${C.bold}${ab}${C.reset}${healed > 0 ? `  ${C.dim}(${healed} ${lang === "ko" ? "치유" : "healed"})${C.reset}` : ""}`);
    if (validators > 0) {
      leftLines.push(` ${C.dim}${lang === "ko" ? "검증기" : "Validators"}${C.reset} ${C.green}${validators}${C.reset} ${C.dim}active${C.reset}`);
    }
    leftLines.push("");

    // Activity sparkline
    leftLines.push(` ${C.bold}${lang === "ko" ? "📈 활동량" : "📈 Activity"}${C.reset}`);
    leftLines.push(` ${C.cyan}${sparkline(activityBuckets)}${C.reset}`);
    leftLines.push("");

    // Active shields
    leftLines.push(` ${C.bold}${lang === "ko" ? "🔒 보호 파일" : "🔒 Active Shields"}${C.reset}`);
    if (score && score.watchedFiles.length > 0) {
      // Show immune-critical files first, then others
      const immuneFiles = score.watchedFiles
        .map(f => f.replace(/\\/g, "/").split("/").pop() ?? f)
        .filter((v, i, a) => a.indexOf(v) === i)
        .slice(0, 4);
      leftLines.push(` ${C.dim}${immuneFiles.join(", ")}${C.reset}`);
    } else {
      leftLines.push(` ${C.dim}--${C.reset}`);
    }

    // ── Right: Event stream ──
    const rightLines: string[] = [];

    if (displayLog.length === 0) {
      rightLines.push(` ${C.dim}🔍 ${m.noEvents}${C.reset}`);
    } else {
      for (const evt of displayLog) {
        const maxTextW = RW - 12; // icon(2) + time(8) + spaces(2)
        const truncText = vw(evt.text) > maxTextW
          ? evt.text.slice(0, maxTextW - 1) + "…"
          : evt.text;
        rightLines.push(` ${evt.icon} ${C.dim}${evt.time}${C.reset} ${evt.color}${truncText}${C.reset}`);
      }
    }

    if (noiseCount > 0) {
      rightLines.push(` ${C.dim}(${noiseCount} ${m.noise})${C.reset}`);
    }

    // Merge left & right into dual rows
    const maxRows = Math.max(leftLines.length, rightLines.length, 12);
    for (let i = 0; i < maxRows; i++) {
      const l = leftLines[i] ?? "";
      const r = rightLines[i] ?? "";
      lines.push(dualRow(l, r));
    }

    // Footer
    lines.push(hBot());
    lines.push(` ${C.dim}💡 [Q]${lang === "ko" ? "종료" : "Quit"}  [C]${lang === "ko" ? "화면정리" : "Clear"}${C.reset}`);

    const frame = lines.join("\n") + "\n";

    // Flicker prevention: only write if content changed
    if (frame !== lastRender) {
      process.stdout.write("\x1b[H\x1b[2J" + frame);
      lastRender = frame;
    }
  }

  // ── Keyboard input ──
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", (key: Buffer) => {
      const ch = key.toString();
      // q / Q / Esc
      if (ch === "q" || ch === "Q" || ch === "\x1b") {
        shutdown();
      }
      // c / C — clear event log
      if (ch === "c" || ch === "C") {
        displayLog.length = 0;
        noiseCount = 0;
        render();
      }
    });
  }

  // ── Initial render + timers ──
  process.stdout.write(HIDE_CURSOR);
  render();

  const renderInterval = setInterval(() => {
    if (score) score.uptime++;
    render();
  }, 1000);

  function shutdown() {
    clearInterval(scoreInterval);
    clearInterval(renderInterval);
    clearInterval(bucketInterval);
    sseAbort.abort();
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdout.write(SHOW_CURSOR + "\n");
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
