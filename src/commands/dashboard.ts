import { getDaemonInfo, daemonRequest } from "../daemon/client";
import { fmtNum, visualWidth } from "../core/boast";

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
const W = 58;
const INNER = W - 2;
const HBAR = "─".repeat(W);

function vw(s: string): number {
  return visualWidth(s.replace(/\x1b\[[0-9;]*m/g, ""));
}

function row(content: string): string {
  const pad = Math.max(0, INNER - vw(content));
  return `│${content}${" ".repeat(pad)}│`;
}

function divider(): string {
  return `├${HBAR}┤`;
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

// ── Render ────────────────────────────────────────────────────────────────────

function render(score: ScoreData, lastUpdated: string): void {
  process.stdout.write("\x1b[2J\x1b[H");

  const out: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const h = score.hologram;
  const ctx = score.ctxSavings ?? { daily: [], lifetime: [] };

  // ── Header ──
  out.push(`┌${HBAR}┐`);
  {
    const liveBadge = `${C.red}[● live]${C.reset}`;
    const dateStr = `${C.dim}${today}${C.reset}`;
    const title = `  ${C.cyan}${C.bold}${T.title}${C.reset}  ${liveBadge}  ${dateStr}`;
    out.push(row(title));
  }
  out.push(divider());

  // ── TODAY'S SAVINGS ──
  // Denominator = ALL bytes processed by afd tools (hologram_daily includes small files
  // since afd_read now records even full-content reads).
  {
    out.push(row(`  ${C.cyan}${C.bold}${T.todaySavings}${C.reset}`));

    const hToday = h.today ?? (h.daily[0]?.date === today ? h.daily[0] : null);
    // holoOriginal = total bytes that went through afd_read (small files + large files)
    // holoActual   = bytes actually sent (small files at full size + large files at hologram size)
    const holoOriginal = hToday?.originalChars ?? 0;
    const holoActual   = hToday?.hologramChars ?? 0;
    const holoRequests = hToday?.requests ?? 0;

    const wsmapToday       = ctx.daily.find(r => r.date === today && r.type === "wsmap");
    const pinpointToday    = ctx.daily.find(r => r.date === today && r.type === "pinpoint");
    const wsmapOriginal    = wsmapToday?.original_chars ?? 0;
    const wsmapSavedChars  = wsmapToday?.saved_chars ?? 0;
    const pinpointOriginal    = pinpointToday?.original_chars ?? 0;
    const pinpointSavedChars  = pinpointToday?.saved_chars ?? 0;

    // totalOriginal = what WOULD have been consumed without afd
    // totalActual   = what WAS actually consumed through afd
    const totalOriginal = holoOriginal + wsmapOriginal + pinpointOriginal;
    const totalActual   = holoActual + (wsmapOriginal - wsmapSavedChars) + (pinpointOriginal - pinpointSavedChars);
    const hasData = holoRequests > 0 || (wsmapToday?.requests ?? 0) > 0 || (pinpointToday?.requests ?? 0) > 0;

    if (hasData && totalOriginal > 0) {
      const barW = 20;
      const savedTok = Math.max(0, totalOriginal - totalActual);
      const savedPct = Math.round((savedTok / totalOriginal) * 100);
      const actPct   = (totalActual / totalOriginal) * 100;

      out.push(row(`  ${T.labelOrig}${barOriginal(barW)}  ${C.dim}${formatK(totalOriginal)}${C.reset}`));
      out.push(row(`  ${T.labelAct}${barActual(actPct, barW)}  ${C.yellow}${formatK(totalActual)}${C.reset}`));
      out.push(row(`  ${T.labelSaved}${barSaved(savedPct, barW)}  ${C.green}${savedPct}%${C.reset}  ${C.dim}(${formatK(savedTok)} ${T.savedSuffix})${C.reset}`));
    } else {
      out.push(row(`  ${C.dim}${T.startTracking}${C.reset}`));
    }
  }

  out.push(divider());

  // ── LIFETIME ROI & BREAKDOWN ──
  {
    out.push(row(`  ${C.cyan}${C.bold}${T.lifetimeRoi}${C.reset}`));

    const lt = h.lifetime;
    // hologramSavedChars = compression savings only (small files cancel out: orig == actual)
    const hologramSavedChars = Math.max(0, lt.originalChars - lt.hologramChars);

    const wsmapRow     = ctx.lifetime.find(r => r.type === "wsmap");
    const pinpointRow  = ctx.lifetime.find(r => r.type === "pinpoint");
    const wsmapSaved   = wsmapRow?.total_saved_chars ?? 0;
    const pinpointSaved = pinpointRow?.total_saved_chars ?? 0;
    const totalSavedChars = hologramSavedChars + wsmapSaved + pinpointSaved;
    const totalSavedTok = totalSavedChars / CHARS_PER_TOKEN;
    const estValue = Math.round(totalSavedTok / 1000 * 0.003 * 100) / 100;

    const totalLine = `  ${C.bold}${C.green}${T.totalSaved}    ~${fmtNum(Math.round(totalSavedTok))} tok${C.reset}  ${C.dim}│  ${T.estValue}  $${estValue.toFixed(2)}${C.reset}`;
    out.push(row(totalLine));
    out.push(row(`  ${C.dim}${"─".repeat(INNER - 4)}${C.reset}`));

    const holoTok   = Math.round(hologramSavedChars / CHARS_PER_TOKEN);
    const holoColor = holoTok > 0 ? C.green : C.dim;
    const holoPct   = totalSavedChars > 0 ? Math.round((hologramSavedChars / totalSavedChars) * 100) : 0;
    out.push(row(`  ${holoColor}[${holoTok > 0 ? "✓" : "·"}] ${T.hologram.padEnd(12)} ~${formatK(hologramSavedChars).padEnd(9)} (${holoPct}%)${C.reset}`));

    const wsmapTok   = Math.round(wsmapSaved / CHARS_PER_TOKEN);
    const wsmapColor = wsmapTok > 0 ? C.green : C.dim;
    const wsmapPct   = totalSavedChars > 0 ? Math.round((wsmapSaved / totalSavedChars) * 100) : 0;
    out.push(row(`  ${wsmapColor}[${wsmapTok > 0 ? "✓" : "·"}] ${T.wsmap.padEnd(12)} ~${formatK(wsmapSaved).padEnd(9)} (${wsmapPct}%)${C.reset}`));

    const pinTok   = Math.round(pinpointSaved / CHARS_PER_TOKEN);
    const pinColor = pinTok > 0 ? C.green : C.dim;
    const pinPct   = totalSavedChars > 0 ? Math.round((pinpointSaved / totalSavedChars) * 100) : 0;
    out.push(row(`  ${pinColor}[${pinTok > 0 ? "✓" : "·"}] ${T.pinpoint.padEnd(12)} ~${formatK(pinpointSaved).padEnd(9)} (${pinPct}%)${C.reset}`));
  }

  out.push(divider());

  // ── 7-DAY HISTORY ──
  {
    out.push(row(`  ${C.cyan}${C.bold}${T.weekHistory}${C.reset}`));

    // Merge hologram daily (which now includes small file reads) + wsmap/pinpoint daily
    const dailyMap = new Map<string, { original: number; saved: number }>();
    for (const d of h.daily) {
      dailyMap.set(d.date, { original: d.originalChars, saved: d.originalChars - d.hologramChars });
    }
    for (const r of ctx.daily) {
      const entry = dailyMap.get(r.date) ?? { original: 0, saved: 0 };
      dailyMap.set(r.date, { original: entry.original + r.original_chars, saved: entry.saved + r.saved_chars });
    }

    const sortedDates = [...dailyMap.keys()].sort().reverse().slice(0, 7);

    if (sortedDates.length > 0) {
      for (const date of sortedDates) {
        const { original, saved } = dailyMap.get(date)!;
        const pct = original > 0 ? Math.round((saved / original) * 100) : 0;
        const barW = 14;
        const filled = Math.min(barW, Math.round((pct / 100) * barW));
        const empty = barW - filled;
        const barColor = pct >= 70 ? C.green : pct >= 40 ? C.yellow : C.dim;
        const bar = `${barColor}${"█".repeat(filled)}${C.dim}${"░".repeat(empty)}${C.reset}`;
        const wd = weekday(date, today);
        const dateLabel = `${C.dim}${date.slice(5)}${C.reset} ${C.dim}(${wd})${C.reset}`;
        const pctColor = pct >= 70 ? C.green : pct >= 40 ? C.yellow : C.dim;
        const tokRange = `${C.dim}${formatK(original)} → ${formatK(original - saved)}${C.reset}`;
        out.push(row(`  ${dateLabel}   ${bar} ${pctColor}${pct}%${C.reset} │ ${tokRange}`));
      }
    } else {
      out.push(row(`  ${C.dim}${T.noHistory}${C.reset}`));
    }
  }

  out.push(divider());

  // ── SYSTEM STATUS ──
  {
    out.push(row(`  ${C.cyan}${C.bold}${T.systemStatus}${C.reset}`));
    const lt = h.lifetime;
    const reqStr = `${T.requests}: ${lt.requests}`;
    const uptStr = `${T.uptime}: ${formatUptime(score.uptime)}`;
    const evtStr = `${T.events}: ${score.totalEvents}`;
    out.push(row(`  ${C.dim}${reqStr}  │  ${uptStr}  │  ${evtStr}${C.reset}`));
  }

  out.push(`└${HBAR}┘`);
  out.push(`   ${C.dim}${T.updated}: ${lastUpdated}  |  ${T.exitHint}${C.reset}`);

  process.stdout.write(out.join("\n") + "\n");
}

// ── Live loop ─────────────────────────────────────────────────────────────────

export async function dashboardCommand(): Promise<void> {
  const info = getDaemonInfo();
  if (!info) {
    const msg = isKo
      ? `[afd] 데몬이 실행 중이 아닙니다. \`afd start\`를 먼저 실행하세요.`
      : `[afd] Daemon not running. Run \`afd start\` first.`;
    console.error(`${C.red}${msg}${C.reset}`);
    process.exit(1);
  }

  const ac = new AbortController();

  process.on("exit", () => process.stdout.write("\x1b[?25h"));
  const cleanup = () => { ac.abort(); process.exit(0); };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.stdout.write("\x1b[?25l");

  // Initial render
  try {
    const score = await daemonRequest<ScoreData>("/score");
    render(score, new Date().toLocaleTimeString());
  } catch (err) {
    process.stdout.write("\x1b[?25h");
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${C.red}[afd] ${msg}${C.reset}`);
    process.exit(1);
  }

  async function doRefresh() {
    try {
      const score = await daemonRequest<ScoreData>("/score");
      render(score, new Date().toLocaleTimeString());
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
