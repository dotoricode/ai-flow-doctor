/**
 * Shared types for the afd daemon modules.
 */

import type { DetectionResult } from "../adapters/index";
import type { PatchOp } from "../core/immune";
import type { LruStringMap } from "../core/lru-map";

// ── Constants ──
export const DOUBLE_TAP_WINDOW_MS = 30_000;
export const MASS_EVENT_THRESHOLD = 3;
export const MASS_EVENT_WINDOW_MS = 1_000;
export const TAP_CLEANUP_INTERVAL_MS = 60_000;
export const SELF_WRITE_DEBOUNCE_MS = 100;
export const MAX_SSE_CLIENTS = 20;
export const VALIDATOR_TIMEOUT_MS = 500;
export const VALIDATORS_DIR = ".afd/validators";

// ── Types ──
export type ValidatorFn = (newContent: string, filePath: string) => boolean;

export interface HologramStats {
  totalRequests: number;
  totalOriginalChars: number;
  totalHologramChars: number;
}

export interface DaemonState {
  startedAt: number;
  filesDetected: number;
  lastEvent: string | null;
  lastEventAt: number | null;
  watchedFiles: Set<string>;
  hologramStats: HologramStats;
  ecosystems: DetectionResult[];
  autoHealCount: number;
  autoHealLog: { id: string; at: number }[];
  recentUnlinks: number[];
  firstTapTimestamps: Map<string, number>;
  suppressionSkippedCount: number;
  dormantTransitions: { antibodyId: string; at: number }[];
  totalFileBytesSaved: number;
  fileSnapshots: LruStringMap;
  sseClients: Set<ReadableStreamDefaultController<Uint8Array>>;
  customValidators: Map<string, ValidatorFn>;
}

export interface DaemonOptions {
  mcp?: boolean;
}

export { type PatchOp, type DetectionResult };

/**
 * DaemonContext — shared dependency bag passed to all daemon modules.
 * Created once in main() and threaded through MCP/HTTP handlers.
 */
export interface DaemonContext {
  state: DaemonState;
  db: { query: (sql: string) => { get: () => unknown }; prepare: (sql: string) => { run: (...args: unknown[]) => void; get: (...args: unknown[]) => unknown; all: () => unknown[] } };
  ws: { root: string; afdDir: string; pidFile: string; portFile: string; dbFile: string; logFile: string; quarantineDir: string };

  // Prepared statements
  insertEvent: { run: (...args: unknown[]) => void };
  insertAntibody: { run: (...args: unknown[]) => void };
  listAntibodies: { all: () => unknown[] };
  antibodyIds: { all: () => { id: string }[] };
  countAntibodies: { get: () => { cnt: number } };
  getDailyAll: { all: () => { date: string; requests: number; original_chars: number; hologram_chars: number }[] };
  insertTelemetry: { run: (...args: unknown[]) => void };

  // Helper functions
  seam: (phase: string, msg: string) => void;
  persistHologramStats: (originalChars: number, hologramChars: number) => void;
  safeHologram: (filePath: string, source: string) => string;
  getWorkspaceMap: () => string;
  today: () => string;

  // Discovery
  discoveryTargets: string[];

  // Options
  options: DaemonOptions;

  // Mutable port (set after Bun.serve)
  port: number;
}
