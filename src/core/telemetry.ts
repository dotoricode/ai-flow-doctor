/**
 * Lightweight telemetry helpers for CLI-side tracking.
 * Uses a short-lived DB connection — no daemon required.
 */

import { Database } from "bun:sqlite";
import { resolveWorkspacePaths } from "../constants";
import { existsSync } from "fs";

function openDb(): Database | null {
  try {
    const paths = resolveWorkspacePaths();
    if (!existsSync(paths.dbFile)) return null;
    const db = new Database(paths.dbFile);
    db.exec("PRAGMA journal_mode = WAL");
    return db;
  } catch { return null; }
}

/** Track a CLI command invocation (fire-and-forget). */
export function trackCliCommand(command: string) {
  const db = openDb();
  if (!db) return;
  try {
    db.prepare("INSERT INTO telemetry (category, action, timestamp) VALUES (?, ?, ?)").run("cli", command, Date.now());
  } catch { /* table may not exist yet — ignore */ }
  finally { db.close(); }
}

export interface TelemetryRow {
  category: string;
  action: string;
  detail: string | null;
  duration_ms: number | null;
  timestamp: number;
}

export interface TelemetrySummary {
  cli: Record<string, number>;
  mcp: Record<string, number>;
  seam: { counts: Record<string, number>; avgDurationMs: Record<string, number> };
  immune: Record<string, number>;
  validator: Record<string, number>;
  totalEvents: number;
  periodDays: number;
}

/** Query aggregated telemetry for the last N days. */
export function queryTelemetry(days: number): TelemetrySummary {
  const db = openDb();
  const empty: TelemetrySummary = { cli: {}, mcp: {}, seam: { counts: {}, avgDurationMs: {} }, immune: {}, validator: {}, totalEvents: 0, periodDays: days };
  if (!db) return empty;

  try {
    const since = Date.now() - days * 86_400_000;
    const rows = db.prepare(
      "SELECT category, action, duration_ms FROM telemetry WHERE timestamp >= ?"
    ).all(since) as { category: string; action: string; duration_ms: number | null }[];

    const result = { ...empty };
    const seamDurations: Record<string, number[]> = {};

    for (const row of rows) {
      result.totalEvents++;
      switch (row.category) {
        case "cli":
          result.cli[row.action] = (result.cli[row.action] ?? 0) + 1;
          break;
        case "mcp":
          result.mcp[row.action] = (result.mcp[row.action] ?? 0) + 1;
          break;
        case "seam":
          result.seam.counts[row.action] = (result.seam.counts[row.action] ?? 0) + 1;
          if (row.duration_ms != null) {
            (seamDurations[row.action] ??= []).push(row.duration_ms);
          }
          break;
        case "immune":
          result.immune[row.action] = (result.immune[row.action] ?? 0) + 1;
          break;
        case "validator":
          result.validator[row.action] = (result.validator[row.action] ?? 0) + 1;
          break;
      }
    }

    for (const [action, durations] of Object.entries(seamDurations)) {
      result.seam.avgDurationMs[action] = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    }

    return result;
  } catch { return empty; }
  finally { db.close(); }
}
