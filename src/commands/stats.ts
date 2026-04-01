/**
 * `afd stats` — Feature usage telemetry dashboard (developer-only).
 */

import { queryTelemetry, type TelemetrySummary } from "../core/telemetry";

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  blue: "\x1b[34m", magenta: "\x1b[35m", cyan: "\x1b[36m", white: "\x1b[37m",
};

function bar(count: number, max: number, width = 20): string {
  const ratio = max > 0 ? Math.min(count / max, 1) : 0;
  const filled = Math.round(ratio * width);
  return `${C.green}${"█".repeat(filled)}${C.dim}${"░".repeat(width - filled)}${C.reset}`;
}

function sortedEntries(obj: Record<string, number>): [string, number][] {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]);
}

function renderRankedList(title: string, data: Record<string, number>, barWidth = 16): string[] {
  const entries = sortedEntries(data);
  if (entries.length === 0) return [`  ${C.dim}(no data)${C.reset}`];
  const maxVal = entries[0][1];
  const maxNameLen = Math.max(...entries.map(([n]) => n.length), 8);
  return entries.map(([name, count]) => {
    const pad = " ".repeat(Math.max(1, maxNameLen - name.length + 2));
    return `  ${C.white}${name}${C.reset}${pad}${bar(count, maxVal, barWidth)} ${count}`;
  });
}

function renderSection(title: string): string {
  return `\n${C.bold}${C.cyan}${title}${C.reset}\n${"─".repeat(50)}`;
}

export async function statsCommand(opts: { days?: string }) {
  const days = parseInt(opts.days ?? "7", 10) || 7;
  const data: TelemetrySummary = queryTelemetry(days);

  const out: string[] = [];

  out.push(`${C.bold}📊 Feature Usage Telemetry${C.reset}  ${C.dim}(last ${days} days, ${data.totalEvents} events total)${C.reset}`);

  // CLI Commands
  out.push(renderSection("CLI Commands"));
  out.push(...renderRankedList("CLI", data.cli));

  // MCP Tools
  out.push(renderSection("MCP Tools"));
  out.push(...renderRankedList("MCP", data.mcp));

  // S.E.A.M Cycle
  out.push(renderSection("S.E.A.M Cycle"));
  const seamEntries = sortedEntries(data.seam.counts);
  if (seamEntries.length === 0) {
    out.push(`  ${C.dim}(no data)${C.reset}`);
  } else {
    const maxSeam = seamEntries[0][1];
    const maxNameLen = Math.max(...seamEntries.map(([n]) => n.length), 8);
    for (const [action, count] of seamEntries) {
      const pad = " ".repeat(Math.max(1, maxNameLen - action.length + 2));
      const avg = data.seam.avgDurationMs[action];
      const avgStr = avg != null ? `${C.dim}avg ${avg}ms${C.reset}` : "";
      out.push(`  ${C.white}${action}${C.reset}${pad}${bar(count, maxSeam, 12)} ${count}  ${avgStr}`);
    }
  }

  // Immune Activity + Accuracy
  out.push(renderSection("Immune Activity"));
  const hits = data.immune["heal_hit"] ?? 0;
  const falsePos = data.immune["heal_false_positive"] ?? 0;
  const passes = data.immune["heal_pass"] ?? 0;
  const suppressions = data.immune["suppression"] ?? 0;
  const totalJudgments = hits + falsePos + passes;
  const accuracy = totalJudgments > 0 ? Math.round((hits + passes) / totalJudgments * 100) : null;
  const precisionLabel = (hits + falsePos) > 0 ? `${Math.round(hits / (hits + falsePos) * 100)}%` : "—";

  out.push(`  ${C.white}Hits${C.reset}       ${hits}  ${C.dim}(corruption detected & restored)${C.reset}`);
  out.push(`  ${C.white}Passes${C.reset}     ${passes}  ${C.dim}(immune file changed, valid)${C.reset}`);
  out.push(`  ${C.white}False +${C.reset}    ${falsePos}  ${C.dim}(restored but user overrode)${C.reset}`);
  out.push(`  ${C.white}Suppress${C.reset}   ${suppressions}  ${C.dim}(mass event skip)${C.reset}`);
  out.push("");
  out.push(`  ${C.bold}Accuracy${C.reset}   ${accuracy != null ? `${C.green}${accuracy}%${C.reset}` : `${C.dim}—${C.reset}`}  ${C.dim}(correct judgments / total)${C.reset}`);
  out.push(`  ${C.bold}Precision${C.reset}  ${(hits + falsePos) > 0 ? `${C.green}${precisionLabel}${C.reset}` : `${C.dim}—${C.reset}`}  ${C.dim}(true hits / all blocks)${C.reset}`);

  // Validators
  if (Object.keys(data.validator).length > 0) {
    out.push(renderSection("Validator Triggers"));
    out.push(...renderRankedList("Validator", data.validator));
  }

  // Dead features warning
  const allCli = ["start", "stop", "restart", "status", "score", "fix", "sync", "doctor", "watch", "diagnose", "vaccine", "evolution", "mcp", "lang", "stats"];
  const unusedCli = allCli.filter(cmd => !(cmd in data.cli));
  if (unusedCli.length > 0 && Object.keys(data.cli).length > 0) {
    out.push(renderSection("Unused CLI Commands"));
    out.push(`  ${C.yellow}${unusedCli.join(", ")}${C.reset}`);
  }

  console.log(out.join("\n"));
}
