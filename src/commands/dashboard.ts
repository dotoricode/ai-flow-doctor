import { getDaemonInfo, daemonRequest } from "../daemon/client";
import { fmtNum, visualWidth } from "../core/boast";
import { execSync } from "child_process";

// ── Types ────────────────────────────────────────────────────────────────────

interface HologramEntry {
  requests: number;
  originalChars: number;
  hologramChars: number;
  savings: number;
}

interface HologramDailyRow {
  date: string;
  requests: number;
  originalChars: number;
  hologramChars: number;
}

interface HologramScore {
  lifetime: HologramEntry;
  today: HologramEntry | null;
  daily: HologramDailyRow[];
}

interface CtxSavingsRow {
  date: string;
  type: string;
  requests: number;
  original_chars: number;
  saved_chars: number;
}

interface CtxSavingsLifetimeRow {
  type: string;
  total_requests: number;
  total_original_chars: number;
  total_saved_chars: number;
}

interface ScoreData {
  uptime: number;
  totalEvents: number;
  hologram: HologramScore;
  ctxSavings: {
    daily: CtxSavingsRow[];
    lifetime: CtxSavingsLifetimeRow[];
  };
}

// ── Locale ───────────────────────────────────────────────────────────────────

function detectKorean(): boolean {
  const lang = process.env.LANG ?? process.env.LC_ALL ?? process.env.LC_MESSAGES ?? "";
  if (/ko[_\-]/i.test(lang)) return true;
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale.startsWith("ko");
  } catch { return false; }
}

const isKo = detectKorean();

const T = isKo ? {
  title:        "afd 토큰 대시보드",
  todaySavings: "오늘의 절약",
  lifetimeRoi:  "누적 ROI & 분류",
  weekHistory:  "최근 7일 내역",
  systemStatus: "시스템 상태",
  startTracking:"afd_read 또는 afd_hologram 사용 시 추적 시작",
  noHistory:    "아직 일별 기록이 없습니다",
  totalSaved:   "총 절약량",
  estValue:     "추정 가치",
  hologram:     "홀로그램",
  wsmap:        "워크스페이스 맵",
  pinpoint:     "핀포인트",
  requests:     "요청",
  uptime:       "가동시간",
  events:       "이벤트",
  updated:      "갱신",
  exitHint:     "Ctrl+C로 종료",
  labelOrig:    "원본   ",
  labelAct:     "실제   ",
  labelSaved:   "절약   ",
  savedSuffix:  "절약됨",
  todayLabel:   "오늘",
  tooNarrow:    "터미널을 넓혀주세요 (최소 50 columns)",
} : {
  title:        "afd token dashboard",
  todaySavings: "TODAY'S SAVINGS",
  lifetimeRoi:  "LIFETIME ROI & BREAKDOWN",
  weekHistory:  "7-DAY HISTORY",
  systemStatus: "SYSTEM STATUS",
  startTracking:"Use afd_read or afd_hologram to start tracking",
  noHistory:    "No daily history yet",
  totalSaved:   "Total Saved",
  estValue:     "Est. Value",
  hologram:     "Hologram",
  wsmap:        "W/S Map",
  pinpoint:     "Pinpoint",
  requests:     "Requests",
  uptime:       "Uptime",
  events:       "Events",
  updated:      "Updated",
  exitHint:     "Press Ctrl+C to exit",
  labelOrig:    "Original ",
  labelAct:     "Actual   ",
  labelSaved:   "Saved    ",
  savedSuffix:  "saved",
  todayLabel:   "Today",
  tooNarrow:    "Please widen terminal (min 50 columns)",
};

// ── ANSI ──────────────────────────────────────────────────────────────────────

const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  red:    "\x1b[31m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
};

const CHARS_PER_TOKEN = 3.5;
const MIN_WIDTH = 50;

// ── Terminal size (cross-platform) ───────────────────────────────────────────

interface TermSize { cols: number; rows: number; }

function queryTermSize(): TermSize {
  // 1. Try process.stdout (works on most Unix terminals)
  const stCols = process.stdout.columns;
  const stRows = process.stdout.rows;
  if (stCols && stRows && stCols > 0 && stRows > 0) {
    return { cols: stCols, rows: stRows };
  }
  // 2. Fallback: shell query (Windows/Warp reliability)
  try {
    const raw = execSync(
      process.platform === "win32"
        ? "powershell -NoProfile -Command \"$Host.UI.RawUI.WindowSize.Width,$Host.UI.RawUI.WindowSize.Height\""
        : "stty size",
      { stdio: ["pipe", "pipe", "ignore"], timeout: 500, encoding: "utf-8" },
    ).trim();
    if (process.platform === "win32") {
      const [w, h] = raw.split(/[\r\n,]+/).map(Number);
      if (w > 0 && h > 0) return { cols: w, rows: h };
    } else {
      const [h, w] = raw.split(/\s+/).map(Number);
      if (w > 0 && h > 0) return { cols: w, rows: h };
    }
  } catch { /* ignore */ }
  return { cols: 80, rows: 24 };
}

let cachedSize: TermSize = { cols: 80, rows: 24 };

function refreshTermSize(): TermSize {
  cachedSize = queryTermSize();
  return cachedSize;
}

// ── Dynamic layout ───────────────────────────────────────────────────────────

function getWidth(): number {
  return Math.max(MIN_WIDTH, Math.min(cachedSize.cols, 120));
}

function vw(s: string): number {
  return visualWidth(s.replace(/\x1b\[[0-9;]*m/g, ""));
}

function row(content: string, w: number): string {
  const inner = w - 2;
  const pad = Math.max(0, inner - vw(content));
  return `│${content}${" ".repeat(pad)}│`;
}

function hbar(w: number): string {
  return "─".repeat(w);
}

function divider(w: number): string {
  return `├${hbar(w)}┤`;
}

function formatK(chars: number): string {
  const tok = chars / CHARS_PER_TOKEN;
  if (tok >= 1_000_000) return `${(tok / 1_000_000).toFixed(1)}M tok`;
  if (tok >= 1_000) return `${(tok / 1_000).toFixed(1)}K tok`;
  return `${Math.round(tok)} tok`;
}

function formatUptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function weekday(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) return T.todayLabel;
  try {
    const locale = isKo ? "ko" : "en";
    return new Date(dateStr + "T12:00:00").toLocaleDateString(locale, { weekday: "short" });
  } catch { return ""; }
}

// ── Bar helpers ───────────────────────────────────────────────────────────────

function barSaved(pct: number, width: number): string {
  const filled = Math.min(width, Math.round((pct / 100) * width));
  const empty = width - filled;
  return `${C.green}${"▓".repeat(filled)}${C.dim}${"░".repeat(empty)}${C.reset}`;
}

function barActual(pct: number, width: number): string {
  const filled = Math.min(width, Math.round((pct / 100) * width));
  const empty = width - filled;
  return `${C.yellow}${"█".repeat(filled)}${C.dim}${"░".repeat(empty)}${C.reset}`;
}

function barOriginal(width: number): string {
  return `${C.dim}${"█".repeat(width)}${C.reset}`;
}

// ── Section builders (each returns lines array) ──────────────────────────────

function buildHeader(W: number, today: string): string[] {
  const liveBadge = `${C.red}[● live]${C.reset}`;
  const dateStr = `${C.dim}${today}${C.reset}`;
  const title = `  ${C.cyan}${C.bold}${T.title}${C.reset}  ${liveBadge}  ${dateStr}`;
  return [`┌${hbar(W)}┐`, row(title, W), divider(W)];
}

function buildTodaySavings(W: number, score: ScoreData, today: string, barW: number): string[] {
  const lines: string[] = [];
  const h = score.hologram;
  const ctx = score.ctxSavings ?? { daily: [], lifetime: [] };

  lines.push(row(`  ${C.cyan}${C.bold}${T.todaySavings}${C.reset}`, W));

  const hToday = h.today ?? (h.daily[0]?.date === today ? h.daily[0] : null);
  const holoOriginal = hToday?.originalChars ?? 0;
  const holoActual   = hToday?.hologramChars ?? 0;
  const holoRequests = hToday?.requests ?? 0;

  const wsmapToday       = ctx.daily.find(r => r.date === today && r.type === "wsmap");
  const pinpointToday    = ctx.daily.find(r => r.date === today && r.type === "pinpoint");
  const wsmapOriginal    = wsmapToday?.original_chars ?? 0;
  const wsmapSavedChars  = wsmapToday?.saved_chars ?? 0;
  const pinpointOriginal    = pinpointToday?.original_chars ?? 0;
  const pinpointSavedChars  = pinpointToday?.saved_chars ?? 0;

  const totalOriginal = holoOriginal + wsmapOriginal + pinpointOriginal;
  const totalActual   = holoActual + (wsmapOriginal - wsmapSavedChars) + (pinpointOriginal - pinpointSavedChars);
  const hasData = holoRequests > 0 || (wsmapToday?.requests ?? 0) > 0 || (pinpointToday?.requests ?? 0) > 0;

  if (hasData && totalOriginal > 0) {
    const savedTok = Math.max(0, totalOriginal - totalActual);
    const savedPct = Math.round((savedTok / totalOriginal) * 100);
    const actPct   = (totalActual / totalOriginal) * 100;
    lines.push(row(`  ${T.labelOrig}${barOriginal(barW)}  ${C.dim}${formatK(totalOriginal)}${C.reset}`, W));
    lines.push(row(`  ${T.labelAct}${barActual(actPct, barW)}  ${C.yellow}${formatK(totalActual)}${C.reset}`, W));
    lines.push(row(`  ${T.labelSaved}${barSaved(savedPct, barW)}  ${C.green}${savedPct}%${C.reset}  ${C.dim}(${formatK(savedTok)} ${T.savedSuffix})${C.reset}`, W));
  } else {
    lines.push(row(`  ${C.dim}${T.startTracking}${C.reset}`, W));
  }
  return lines;
}

function buildLifetime(W: number, score: ScoreData, withBreakdown: boolean): string[] {
  const lines: string[] = [];
  const INNER = W - 2;
  const h = score.hologram;
  const ctx = score.ctxSavings ?? { daily: [], lifetime: [] };

  lines.push(row(`  ${C.cyan}${C.bold}${T.lifetimeRoi}${C.reset}`, W));

  const lt = h.lifetime;
  const hologramSavedChars = Math.max(0, lt.originalChars - lt.hologramChars);
  const wsmapRow     = ctx.lifetime.find(r => r.type === "wsmap");
  const pinpointRow  = ctx.lifetime.find(r => r.type === "pinpoint");
  const wsmapSaved   = wsmapRow?.total_saved_chars ?? 0;
  const pinpointSaved = pinpointRow?.total_saved_chars ?? 0;
  const totalSavedChars = hologramSavedChars + wsmapSaved + pinpointSaved;
  const totalSavedTok = totalSavedChars / CHARS_PER_TOKEN;
  const estValue = Math.round(totalSavedTok / 1000 * 0.003 * 100) / 100;

  lines.push(row(`  ${C.bold}${C.green}${T.totalSaved}    ~${fmtNum(Math.round(totalSavedTok))} tok${C.reset}  ${C.dim}│  ${T.estValue}  $${estValue.toFixed(2)}${C.reset}`, W));

  if (withBreakdown) {
    lines.push(row(`  ${C.dim}${"─".repeat(INNER - 4)}${C.reset}`, W));

    const holoTok = Math.round(hologramSavedChars / CHARS_PER_TOKEN);
    const holoPct = totalSavedChars > 0 ? Math.round((hologramSavedChars / totalSavedChars) * 100) : 0;
    lines.push(row(`  ${holoTok > 0 ? C.green : C.dim}[${holoTok > 0 ? "✓" : "·"}] ${T.hologram.padEnd(12)} ~${formatK(hologramSavedChars).padEnd(9)} (${holoPct}%)${C.reset}`, W));

    const wsmapTok = Math.round(wsmapSaved / CHARS_PER_TOKEN);
    const wsmapPct = totalSavedChars > 0 ? Math.round((wsmapSaved / totalSavedChars) * 100) : 0;
    lines.push(row(`  ${wsmapTok > 0 ? C.green : C.dim}[${wsmapTok > 0 ? "✓" : "·"}] ${T.wsmap.padEnd(12)} ~${formatK(wsmapSaved).padEnd(9)} (${wsmapPct}%)${C.reset}`, W));

    const pinTok = Math.round(pinpointSaved / CHARS_PER_TOKEN);
    const pinPct = totalSavedChars > 0 ? Math.round((pinpointSaved / totalSavedChars) * 100) : 0;
    lines.push(row(`  ${pinTok > 0 ? C.green : C.dim}[${pinTok > 0 ? "✓" : "·"}] ${T.pinpoint.padEnd(12)} ~${formatK(pinpointSaved).padEnd(9)} (${pinPct}%)${C.reset}`, W));
  }
  return lines;
}

function buildHistory(W: number, score: ScoreData, today: string, maxDays: number, histBarW: number): string[] {
  if (maxDays <= 0) return [];
  const lines: string[] = [];
  const h = score.hologram;
  const ctx = score.ctxSavings ?? { daily: [], lifetime: [] };

  lines.push(divider(W));
  lines.push(row(`  ${C.cyan}${C.bold}${T.weekHistory}${C.reset}`, W));

  const dailyMap = new Map<string, { original: number; saved: number }>();
  for (const d of h.daily) {
    dailyMap.set(d.date, { original: d.originalChars, saved: d.originalChars - d.hologramChars });
  }
  for (const r of ctx.daily) {
    const entry = dailyMap.get(r.date) ?? { original: 0, saved: 0 };
    dailyMap.set(r.date, { original: entry.original + r.original_chars, saved: entry.saved + r.saved_chars });
  }

  const sortedDates = [...dailyMap.keys()].sort().reverse().slice(0, maxDays);
  if (sortedDates.length > 0) {
    for (const date of sortedDates) {
      const { original, saved } = dailyMap.get(date)!;
      const pct = original > 0 ? Math.round((saved / original) * 100) : 0;
      const filled = Math.min(histBarW, Math.round((pct / 100) * histBarW));
      const empty = histBarW - filled;
      const barColor = pct >= 70 ? C.green : pct >= 40 ? C.yellow : C.dim;
      const bar = `${barColor}${"█".repeat(filled)}${C.dim}${"░".repeat(empty)}${C.reset}`;
      const wd = weekday(date, today);
      const dateLabel = `${C.dim}${date.slice(5)}${C.reset} ${C.dim}(${wd})${C.reset}`;
      const pctColor = pct >= 70 ? C.green : pct >= 40 ? C.yellow : C.dim;
      const tokRange = `${C.dim}${formatK(original)} → ${formatK(original - saved)}${C.reset}`;
      lines.push(row(`  ${dateLabel}   ${bar} ${pctColor}${pct}%${C.reset} │ ${tokRange}`, W));
    }
  } else {
    lines.push(row(`  ${C.dim}${T.noHistory}${C.reset}`, W));
  }
  return lines;
}

function buildStatus(W: number, score: ScoreData): string[] {
  const lt = score.hologram.lifetime;
  const reqStr = `${T.requests}: ${lt.requests}`;
  const uptStr = `${T.uptime}: ${formatUptime(score.uptime)}`;
  const evtStr = `${T.events}: ${score.totalEvents}`;
  return [
    divider(W),
    row(`  ${C.cyan}${C.bold}${T.systemStatus}${C.reset}`, W),
    row(`  ${C.dim}${reqStr}  │  ${uptStr}  │  ${evtStr}${C.reset}`, W),
  ];
}

function buildFooter(W: number, lastUpdated: string): string[] {
  return [
    `└${hbar(W)}┘`,
    `   ${C.dim}${T.updated}: ${lastUpdated}  |  ${T.exitHint}${C.reset}`,
  ];
}

// ── Render (2-pass: build all sections, then trim to fit) ────────────────────

function render(score: ScoreData, lastUpdated: string): void {
  process.stdout.write("\x1b[2J\x1b[H");

  refreshTermSize();
  const W = getWidth();
  const termCols = cachedSize.cols;
  const termRows = cachedSize.rows;

  if (termCols < MIN_WIDTH) {
    process.stdout.write(`\n  ${C.yellow}${T.tooNarrow}${C.reset}\n  ${C.dim}(${termCols} cols)${C.reset}\n`);
    return;
  }

  const INNER = W - 2;
  const today = new Date().toISOString().slice(0, 10);
  const barW = Math.max(8, Math.floor((INNER - 30) * 0.45));
  const histBarW = Math.max(6, Math.floor((INNER - 36) * 0.4));

  // Always-present sections
  const headerLines  = buildHeader(W, today);
  const todayLines   = buildTodaySavings(W, score, today, barW);
  const statusLines  = buildStatus(W, score);
  const footerLines  = buildFooter(W, lastUpdated);

  // Fixed cost = header + divider(after today) + today + status + footer
  const fixedCount = headerLines.length + 1 + todayLines.length + statusLines.length + footerLines.length;
  let remaining = termRows - fixedCount;

  // Pass 1: try lifetime with breakdown + 7 days history
  let lifetimeLines = buildLifetime(W, score, true);
  let historyLines  = buildHistory(W, score, today, 7, histBarW);

  // Trim history days first
  if (lifetimeLines.length + historyLines.length > remaining) {
    const histBudget = remaining - lifetimeLines.length;
    if (histBudget >= 3) {
      // divider(1) + title(1) + at least 1 day
      const maxDays = histBudget - 2; // 2 = divider + title
      historyLines = buildHistory(W, score, today, maxDays, histBarW);
    } else {
      historyLines = [];
    }
  }

  // Still too tall? Drop lifetime breakdown
  if (lifetimeLines.length + historyLines.length > remaining) {
    lifetimeLines = buildLifetime(W, score, false);
    historyLines = [];
  }

  // Still too tall? Drop lifetime entirely
  if (lifetimeLines.length + historyLines.length > remaining) {
    lifetimeLines = [];
    historyLines = [];
  }

  // Assemble final output
  const out = [
    ...headerLines,
    ...todayLines,
    ...(lifetimeLines.length > 0 ? [divider(W), ...lifetimeLines] : []),
    ...historyLines,
    ...statusLines,
    ...footerLines,
  ];

  process.stdout.write(out.join("\n") + "\n");
}

// ── Live loop ─────────────────────────────────────────────────────────────────

// Alt Screen Buffer ANSI sequences
const ALT_SCREEN_ENTER = "\x1b[?1049h\x1b[?25l";  // switch to alt buffer + hide cursor
const ALT_SCREEN_LEAVE = "\x1b[?1049l\x1b[?25h";  // restore main buffer + show cursor

export async function dashboardCommand(): Promise<void> {
  const info = getDaemonInfo();
  if (!info) {
    const msg = isKo
      ? `[afd] 데몬이 실행 중이 아닙니다. \`afd start\`를 먼저 실행하세요.`
      : `[afd] Daemon not running. Run \`afd start\` first.`;
    console.error(`${C.red}${msg}${C.reset}`);
    process.exit(1);
  }

  // Enter alternate screen buffer (fullscreen TUI mode)
  process.stdout.write(ALT_SCREEN_ENTER);

  const ac = new AbortController();
  let lastScore: ScoreData | null = null;

  // Restore main screen on any exit path
  const leaveAltScreen = () => process.stdout.write(ALT_SCREEN_LEAVE);
  process.on("exit", leaveAltScreen);

  const cleanup = () => { ac.abort(); process.exit(0); };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // SIGWINCH: re-render on terminal resize (works on Unix)
  process.stdout.on("resize", () => {
    if (lastScore) render(lastScore, new Date().toLocaleTimeString());
  });

  // Size-change polling (Windows/Warp fallback — resize event unreliable)
  let lastCols = cachedSize.cols;
  let lastRows = cachedSize.rows;
  const sizePoller = setInterval(() => {
    refreshTermSize();
    if (cachedSize.cols !== lastCols || cachedSize.rows !== lastRows) {
      lastCols = cachedSize.cols;
      lastRows = cachedSize.rows;
      if (lastScore) render(lastScore, new Date().toLocaleTimeString());
    }
  }, 1000);
  ac.signal.addEventListener("abort", () => clearInterval(sizePoller));

  // Initial render
  refreshTermSize();
  try {
    lastScore = await daemonRequest<ScoreData>("/score");
    render(lastScore, new Date().toLocaleTimeString());
  } catch (err) {
    leaveAltScreen();
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${C.red}[afd] ${msg}${C.reset}`);
    process.exit(1);
  }

  async function doRefresh() {
    try {
      lastScore = await daemonRequest<ScoreData>("/score");
      render(lastScore, new Date().toLocaleTimeString());
    } catch { /* non-fatal */ }
  }

  const pollTimer = setInterval(doRefresh, 3000);
  ac.signal.addEventListener("abort", () => clearInterval(pollTimer));

  // SSE for instant updates
  (async () => {
    while (!ac.signal.aborted) {
      try {
        const res = await fetch(`http://127.0.0.1:${info.port}/events`, { signal: ac.signal });
        if (!res.body) { await new Promise(r => setTimeout(r, 3000)); continue; }

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";

        while (!ac.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const frames = buf.split("\n\n");
          buf = frames.pop() ?? "";
          for (const frame of frames) {
            if (frame.trim() && frame.includes("data:")) await doRefresh();
          }
        }
      } catch {
        if (ac.signal.aborted) break;
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  })();

  await new Promise<void>(resolve => ac.signal.addEventListener("abort", resolve));
}
