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
  sessionOriginalChars: number;
  sessionHologramChars: number;
}

export interface MistakeEntry {
  mistake_type: string;
  description: string;
  timestamp: number;
}

/** SEAM 이벤트 로그 항목 (afd://events 리소스용) */
export interface SeamEventEntry {
  phase: string;
  msg: string;
  ts: number;
}

/** 격리(quarantine) 로그 항목 (afd://quarantine 리소스용) */
export interface QuarantineLogEntry {
  path: string;
  ts: number;
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
  autoHealLog: { id: string; at: number; file: string; healMs: number }[];
  recentUnlinks: number[];
  firstTapTimestamps: Map<string, number>;
  suppressionSkippedCount: number;
  dormantTransitions: { antibodyId: string; at: number }[];
  totalFileBytesSaved: number;
  totalSavedTokens: number;
  fileSnapshots: LruStringMap;
  sseClients: Set<ReadableStreamDefaultController<Uint8Array>>;
  customValidators: Map<string, ValidatorFn>;
  mistakeCache: Map<string, MistakeEntry[]>;
  /** v1.9.0: 실시간 SEAM 이벤트 링 버퍼 (최근 200개) */
  seamEventLog: SeamEventEntry[];
  /** v1.9.0: 격리 이벤트 로그 (최근 100개) */
  quarantineLog: QuarantineLogEntry[];
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
  insertMistakeHistory: { run: (...args: unknown[]) => void };
  queryMistakesByFile: { all: (...args: unknown[]) => MistakeEntry[] };
  deleteMistakeOverflow: { run: (...args: unknown[]) => void };

  // Helper functions
  seam: (phase: string, msg: string) => void;
  persistHologramStats: (originalChars: number, hologramChars: number) => void;
  persistCtxSavings: (type: 'wsmap' | 'pinpoint' | 'raw_read', originalChars: number, savedChars: number) => void;
  safeHologram: (filePath: string, source: string) => Promise<string>;
  getWorkspaceMap: () => string;
  getWorkspaceMapStats: () => { totalProjectBytes: number; mapBytes: number };
  today: () => string;
  getCtxSavingsDaily: { all: () => { date: string; type: string; requests: number; original_chars: number; saved_chars: number }[] };
  getCtxSavingsLifetime: { all: () => { type: string; total_requests: number; total_original_chars: number; total_saved_chars: number }[] };

  // Discovery
  discoveryTargets: string[];

  // Options
  options: DaemonOptions;

  // Mutable port (set after Bun.serve)
  port: number;
}
