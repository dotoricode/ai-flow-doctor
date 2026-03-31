/**
 * afd watch — Real-time TUI dashboard
 *
 * Connects to daemon SSE endpoint and renders live S.E.A.M events.
 * Also polls /score every 5s for stats update.
 */

import { daemonRequest, getDaemonInfo } from "../daemon/client";
import { getSystemLanguage } from "../core/locale";

const msgs = {
  en: {
    title: "afd watch — Live Dashboard",
    connecting: "Connecting to daemon...",
    notRunning: "Daemon not running. Start with: afd start",
    uptime: "Uptime",
    events: "Events",
    heals: "Heals",
    antibodies: "Antibodies",
    hologram: "Hologram",
    ecosystem: "Ecosystem",
    liveEvents: "Live Events",
    evolution: "Evolution",
    quit: "Press Ctrl+C to quit",
    noEvents: "Waiting for events...",
  },
  ko: {
    title: "afd watch — 실시간 대시보드",
    connecting: "데몬에 연결 중...",
    notRunning: "데몬이 실행 중이 아닙니다. afd start로 시작하세요.",
    uptime: "가동 시간",
    events: "이벤트",
    heals: "치유",
    antibodies: "항체",
    hologram: "홀로그램",
    ecosystem: "에코시스템",
    liveEvents: "실시간 이벤트",
    evolution: "진화 상태",
    quit: "Ctrl+C로 종료",
    noEvents: "이벤트 대기 중...",
  },
};

const BOX = { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│", ml: "├", mr: "┤" };
const W = 60;

function hline(l: string, r: string) { return `${l}${BOX.h.repeat(W)}${r}`; }
function row(s: string) {
  const pad = Math.max(0, W - 2 - visualWidth(s));
  return `${BOX.v} ${s}${" ".repeat(pad)} ${BOX.v}`;
}

function visualWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if ((cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x2e80 && cp <= 0x9fff) ||
        (cp >= 0xac00 && cp <= 0xd7af) || (cp >= 0xf900 && cp <= 0xfaff) ||
        (cp >= 0x1f000 && cp <= 0x1faff) || (cp >= 0x20000 && cp <= 0x2fa1f)) w += 2;
    else w += 1;
  }
  return w;
}

function kv(label: string, value: string) {
  const gap = 14 - visualWidth(label);
  return row(`${label}${" ".repeat(Math.max(1, gap))}: ${value}`);
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function phaseIcon(phase: string): string {
  switch (phase) {
    case "Sense": return "👁️";
    case "Extract": return "🧬";
    case "Adapt": return "🧪";
    case "Mutate": return "💉";
    case "Quarantine": return "🔒";
    default: return "📌";
  }
}

interface ScoreData {
  uptime: number;
  filesDetected: number;
  totalEvents: number;
  immune: { antibodies: number; autoHealed: number };
  hologram: { lifetime: { requests: number; savings: number } };
  ecosystem: { primary: string };
  evolution?: { totalQuarantined: number; totalLearned: number; pending: number };
}

interface LiveEvent {
  phase: string;
  msg: string;
  ts: number;
}

export async function watchCommand() {
  const lang = getSystemLanguage();
  const m = msgs[lang];

  const info = getDaemonInfo();
  if (!info) {
    console.error(m.notRunning);
    process.exit(1);
  }

  console.log(m.connecting);

  let score: ScoreData | null = null;
  const eventLog: LiveEvent[] = [];
  const MAX_EVENTS = 15;

  // Poll score every 5 seconds
  async function refreshScore() {
    try {
      score = await daemonRequest<ScoreData>("/score");
    } catch { /* daemon might stop */ }
  }

  await refreshScore();
  const scoreInterval = setInterval(refreshScore, 5000);

  // Connect SSE
  let sseAbort = new AbortController();
  connectSSE();

  function connectSSE() {
    fetch(`http://127.0.0.1:${info!.port}/events`, {
      signal: sseAbort.signal,
    }).then(async (res) => {
      if (!res.body) return;
      const decoder = new TextDecoder();
      const reader = res.body.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as LiveEvent;
            eventLog.push(evt);
            if (eventLog.length > MAX_EVENTS) eventLog.shift();
            render();
          } catch { /* skip */ }
        }
      }
    }).catch(() => { /* connection lost */ });
  }

  function render() {
    const lines: string[] = [];

    // Clear screen
    lines.push("\x1b[2J\x1b[H");

    lines.push(hline(BOX.tl, BOX.tr));
    lines.push(row(`🛡️ ${m.title}`));
    lines.push(hline(BOX.ml, BOX.mr));

    if (score) {
      lines.push(kv(m.ecosystem, score.ecosystem.primary));
      lines.push(kv(m.uptime, formatUptime(score.uptime)));
      lines.push(kv(m.events, String(score.totalEvents)));
      lines.push(kv(m.heals, String(score.immune.autoHealed)));
      lines.push(kv(m.antibodies, String(score.immune.antibodies)));

      const holoSav = score.hologram.lifetime.savings;
      lines.push(kv(m.hologram, `${score.hologram.lifetime.requests} req / ${holoSav}% saved`));

      if (score.evolution) {
        const evo = score.evolution;
        lines.push(kv(m.evolution, `${evo.totalLearned} learned / ${evo.pending} pending`));
      }
    }

    lines.push(hline(BOX.ml, BOX.mr));
    lines.push(row(`${m.liveEvents}`));
    lines.push(row(BOX.h.repeat(W - 4)));

    if (eventLog.length === 0) {
      lines.push(row(`  ${m.noEvents}`));
    } else {
      for (const evt of eventLog) {
        const time = new Date(evt.ts).toLocaleTimeString();
        const icon = phaseIcon(evt.phase);
        const firstLine = evt.msg.split("\n")[0];
        const truncated = firstLine.length > 45 ? firstLine.slice(0, 42) + "..." : firstLine;
        lines.push(row(`${icon} ${time} [${evt.phase}] ${truncated}`));
      }
    }

    lines.push(hline(BOX.ml, BOX.mr));
    lines.push(row(`💡 ${m.quit}`));
    lines.push(hline(BOX.bl, BOX.br));

    process.stdout.write(lines.join("\n") + "\n");
  }

  // Initial render
  render();

  // Periodic re-render for uptime updates
  const renderInterval = setInterval(() => {
    if (score) score.uptime++;
    render();
  }, 1000);

  // Cleanup on exit
  process.on("SIGINT", () => {
    clearInterval(scoreInterval);
    clearInterval(renderInterval);
    sseAbort.abort();
    console.log("\n");
    process.exit(0);
  });
}
