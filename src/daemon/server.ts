/**
 * afd daemon — S.E.A.M engine + module orchestrator.
 *
 * Modules:
 *   types.ts         — shared types and constants
 *   workspace-map.ts — project structure cache
 *   mcp-handler.ts   — MCP stdio JSON-RPC dispatcher
 *   http-routes.ts   — HTTP IPC endpoints
 */

import { watch } from "chokidar";
import { mkdirSync, writeFileSync, unlinkSync, readFileSync, existsSync, watch as fsWatch, readdirSync } from "fs";
import { resolve, join } from "path";
import { QUARANTINE_DIR, WATCH_TARGETS, resolveWorkspacePaths } from "../constants";
import { initDb } from "../core/db";
import { generateHologram } from "../core/hologram";
import type { PatchOp } from "../core/immune";
import { detectEcosystem } from "../adapters/index";
import { calcHealMetrics, maybeHealBoast, formatHealLog, formatDormantLog } from "../core/boast";
import { discoverWatchTargets } from "../core/discovery";
import { formatTimestamp, lineDiff } from "../core/log-utils";
import { semanticDiff, isAstSupported } from "../core/semantic-diff";
import { LruStringMap } from "../core/lru-map";

import {
  DOUBLE_TAP_WINDOW_MS, MASS_EVENT_THRESHOLD, MASS_EVENT_WINDOW_MS,
  TAP_CLEANUP_INTERVAL_MS, SELF_WRITE_DEBOUNCE_MS, VALIDATOR_TIMEOUT_MS, VALIDATORS_DIR,
} from "./types";
import type { DaemonState, DaemonContext, DaemonOptions, ValidatorFn } from "./types";
import { createWorkspaceMap } from "./workspace-map";
import { startMcpStdio } from "./mcp-handler";
import { createHttpHandler } from "./http-routes";

// ── State ──
const state: DaemonState = {
  startedAt: Date.now(),
  filesDetected: 0,
  lastEvent: null,
  lastEventAt: null,
  watchedFiles: new Set(),
  hologramStats: { totalRequests: 0, totalOriginalChars: 0, totalHologramChars: 0 },
  ecosystems: [],
  autoHealCount: 0,
  autoHealLog: [],
  recentUnlinks: [],
  firstTapTimestamps: new Map(),
  suppressionSkippedCount: 0,
  dormantTransitions: [],
  totalFileBytesSaved: 0,
  fileSnapshots: new LruStringMap(10 * 1024 * 1024),
  sseClients: new Set(),
  customValidators: new Map(),
  mistakeCache: new Map(),
};

const _ws = resolveWorkspacePaths();

let _cleanupResources: {
  watcher?: ReturnType<typeof watch>;
  interval?: ReturnType<typeof setInterval>;
  wsMapGetTimer?: () => ReturnType<typeof setTimeout> | null;
  validatorWatcher?: ReturnType<typeof fsWatch>;
  db?: { close(): void };
} = {};

function cleanup() {
  try { _cleanupResources.interval && clearInterval(_cleanupResources.interval); } catch {}
  try { const mt = _cleanupResources.wsMapGetTimer?.(); mt && clearTimeout(mt); } catch {}
  try { _cleanupResources.watcher?.close(); } catch {}
  try { _cleanupResources.validatorWatcher?.close(); } catch {}
  try { _cleanupResources.db?.close(); } catch {}
  try { unlinkSync(_ws.pidFile); } catch {}
  try { unlinkSync(_ws.portFile); } catch {}
}

// ── S.E.A.M Logger ──
const GUARD_LINE = "========== GUARDED ==========";
const GUARD_PHASES = new Set(["Mutate", "Quarantine"]);

function createSeamLogger(mcp: boolean) {
  const log = mcp ? console.error.bind(console) : console.log.bind(console);
  return function seam(phase: string, msg: string) {
    if (GUARD_PHASES.has(phase)) {
      log(`\n${GUARD_LINE}`);
      log(`[${formatTimestamp()}] [afd] [${phase}] ${msg}`);
      log(`${GUARD_LINE}\n`);
    } else {
      log(`[${formatTimestamp()}] [afd] [${phase}] ${msg}`);
    }
    const encoder = new TextEncoder();
    const payload = JSON.stringify({ phase, msg, ts: Date.now() });
    const sseData = encoder.encode(`data: ${payload}\n\n`);
    const dead: ReadableStreamDefaultController<Uint8Array>[] = [];
    for (const controller of state.sseClients) {
      try { controller.enqueue(sseData); } catch { dead.push(controller); }
    }
    for (const c of dead) state.sseClients.delete(c);
  };
}

// ══════════════════════════════════════════════════════════
export function main(options: DaemonOptions = {}) {
  state.ecosystems = detectEcosystem(process.cwd());

  const db = initDb();
  _cleanupResources.db = db;

  // ── Prepared statements ──
  const insertEvent = db.prepare("INSERT INTO events (type, path, timestamp) VALUES (?, ?, ?)");
  const insertAntibody = db.prepare(
    "INSERT OR REPLACE INTO antibodies (id, pattern_type, file_target, patch_op, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
  );
  const listAntibodies = db.prepare("SELECT * FROM antibodies ORDER BY created_at DESC");
  const antibodyIds = db.prepare("SELECT id FROM antibodies WHERE dormant = 0");
  const countAntibodies = db.prepare("SELECT COUNT(*) as cnt FROM antibodies");
  const insertUnlinkLog = db.prepare("INSERT INTO unlink_log (file_path, timestamp) VALUES (?, ?)");
  const findAntibodyByFile = db.prepare("SELECT id, dormant FROM antibodies WHERE file_target = ? AND dormant = 0");
  const setAntibodyDormant = db.prepare("UPDATE antibodies SET dormant = 1 WHERE id = ?");

  // Hologram stats
  const getLifetime = db.prepare("SELECT total_requests, total_original_chars, total_hologram_chars FROM hologram_lifetime WHERE id = 1");
  const updateLifetime = db.prepare(
    "UPDATE hologram_lifetime SET total_requests = ?, total_original_chars = ?, total_hologram_chars = ? WHERE id = 1"
  );
  const upsertDaily = db.prepare(`
    INSERT INTO hologram_daily (date, requests, original_chars, hologram_chars) VALUES (?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET requests = requests + excluded.requests,
      original_chars = original_chars + excluded.original_chars,
      hologram_chars = hologram_chars + excluded.hologram_chars
  `);
  const getDailyAll = db.prepare("SELECT date, requests, original_chars, hologram_chars FROM hologram_daily ORDER BY date DESC LIMIT 7");
  const purgeOldDaily = db.prepare("DELETE FROM hologram_daily WHERE date < date('now', '-7 days')");

  // ── Telemetry ──
  const insertTelemetry = db.prepare(
    "INSERT INTO telemetry (category, action, detail, duration_ms, timestamp) VALUES (?, ?, ?, ?, ?)"
  );
  function trackEvent(category: string, action: string, detail?: string, durationMs?: number) {
    try { insertTelemetry.run(category, action, detail ?? null, durationMs ?? null, Date.now()); } catch { /* crash-only */ }
  }

  // ── Mistake History (Passive Defense) ──
  const insertMistakeHistory = db.prepare(
    "INSERT INTO mistake_history (file_path, mistake_type, description, antibody_id, timestamp) VALUES (?, ?, ?, ?, ?)"
  );
  const queryMistakesByFile = db.prepare(
    "SELECT mistake_type, description, timestamp FROM mistake_history WHERE file_path = ? ORDER BY timestamp DESC LIMIT 5"
  );
  const deleteMistakeOverflow = db.prepare(
    "DELETE FROM mistake_history WHERE file_path = ? AND id NOT IN (SELECT id FROM mistake_history WHERE file_path = ? ORDER BY timestamp DESC LIMIT 5)"
  );

  function recordMistake(filePath: string, mistakeType: string, description: string, antibodyId?: string) {
    try {
      const normalizedPath = filePath.replace(/\\/g, "/");
      const truncatedDesc = description.slice(0, 200);
      insertMistakeHistory.run(normalizedPath, mistakeType, truncatedDesc, antibodyId ?? null, Date.now());
      deleteMistakeOverflow.run(normalizedPath, normalizedPath);
      // Update write-through cache
      const cached = state.mistakeCache.get(normalizedPath) ?? [];
      cached.unshift({ mistake_type: mistakeType, description: truncatedDesc, timestamp: Date.now() });
      if (cached.length > 5) cached.length = 5;
      state.mistakeCache.set(normalizedPath, cached);
    } catch { /* crash-only */ }
  }

  // Load mistake cache from DB on startup (write-through cache)
  try {
    const allMistakes = db.prepare("SELECT file_path, mistake_type, description, timestamp FROM mistake_history ORDER BY timestamp DESC").all() as { file_path: string; mistake_type: string; description: string; timestamp: number }[];
    for (const row of allMistakes) {
      const cached = state.mistakeCache.get(row.file_path) ?? [];
      if (cached.length < 5) {
        cached.push({ mistake_type: row.mistake_type, description: row.description, timestamp: row.timestamp });
        state.mistakeCache.set(row.file_path, cached);
      }
    }
  } catch { /* crash-only — empty cache is fine */ }

  function today(): string { return new Date().toISOString().slice(0, 10); }

  // Load persisted hologram stats
  const persisted = getLifetime.get() as { total_requests: number; total_original_chars: number; total_hologram_chars: number } | null;
  if (persisted) {
    state.hologramStats.totalRequests = persisted.total_requests;
    state.hologramStats.totalOriginalChars = persisted.total_original_chars;
    state.hologramStats.totalHologramChars = persisted.total_hologram_chars;
  }

  const seam = createSeamLogger(!!options.mcp);

  function persistHologramStats(originalChars: number, hologramChars: number) {
    state.hologramStats.totalRequests++;
    state.hologramStats.totalOriginalChars += originalChars;
    state.hologramStats.totalHologramChars += hologramChars;
    try {
      const hs = state.hologramStats;
      updateLifetime.run(hs.totalRequests, hs.totalOriginalChars, hs.totalHologramChars);
      upsertDaily.run(today(), 1, originalChars, hologramChars);
      purgeOldDaily.run();
    } catch (err) {
      console.error("[afd] Failed to persist hologram stats:", err instanceof Error ? err.message : String(err));
    }
  }

  function snapshotFile(filePath: string) {
    try {
      if (existsSync(filePath)) state.fileSnapshots.set(filePath, readFileSync(filePath, "utf-8"));
    } catch { /* ignore */ }
  }

  function safeHologram(filePath: string, source: string): string {
    if (!/\.[tj]sx?$/.test(filePath)) {
      const lines = source.split("\n");
      return lines.slice(0, 50).join("\n") + (lines.length > 50 ? "\n// … (truncated)" : "");
    }
    try {
      const result = generateHologram(filePath, source);
      persistHologramStats(result.originalLength, result.hologramLength);
      return result.hologram;
    } catch {
      const lines = source.split("\n");
      return lines.slice(0, 50).join("\n") + (lines.length > 50 ? "\n// … (truncated, AST parse failed)" : "");
    }
  }

  function quarantineFile(originalPath: string, corruptedContent: string | null): void {
    try {
      mkdirSync(QUARANTINE_DIR, { recursive: true });
      const now = new Date();
      const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
      const baseName = originalPath.replace(/[\\/]/g, "_").replace(/^_+/, "");
      const quarantinePath = resolve(QUARANTINE_DIR, `${ts}_${baseName}`);
      writeFileSync(quarantinePath, corruptedContent ?? "DELETED", "utf-8");
      seam("Quarantine", `Saved corrupted state → .afd/quarantine/${ts}_${baseName}`);
    } catch (err) {
      seam("Quarantine", `FAILED to quarantine ${originalPath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Auto-Seed Antibodies ──
  function seedAntibodies() {
    const immuneFiles = [
      { id: "IMM-001", path: ".claudeignore" },
      { id: "IMM-002", path: ".claude/hooks.json" },
      { id: "IMM-003", path: "CLAUDE.md" },
    ];
    for (const { id, path: filePath } of immuneFiles) {
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, "utf-8");
        const patches: PatchOp[] = [{ op: "add", path: `/${filePath}`, value: content }];
        insertAntibody.run(id, "auto-seed", filePath, JSON.stringify(patches));
        state.fileSnapshots.set(filePath, content);
        seam("Adapt", `Antibody ${id} seeded for ${filePath} (${content.length} bytes)`);
      }
    }
  }

  const selfWrites = new Set<string>();
  seedAntibodies();

  // ── Dynamic Immune Synthesis ──
  const validatorsDir = join(process.cwd(), VALIDATORS_DIR);

  async function loadValidators() {
    state.customValidators.clear();
    if (!existsSync(validatorsDir)) return;
    let files: string[];
    try { files = readdirSync(validatorsDir).filter(f => f.endsWith(".js")); } catch { return; }
    for (const file of files) {
      const absPath = resolve(validatorsDir, file);
      try {
        const mod = await import(`${absPath}?t=${Date.now()}`);
        const fn = mod.default ?? mod;
        if (typeof fn === "function") {
          state.customValidators.set(file, fn as ValidatorFn);
          seam("Adapt", `🧬 Validator loaded: ${file}`);
        } else {
          seam("Adapt", `⚠️ Validator ${file} does not export a function — skipped`);
        }
      } catch (err) {
        seam("Adapt", `⚠️ Failed to load validator ${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (state.customValidators.size > 0) {
      seam("Adapt", `Dynamic Immune Synthesis: ${state.customValidators.size} active validator(s)`);
    }
  }

  loadValidators();

  try {
    mkdirSync(validatorsDir, { recursive: true });
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    const validatorWatcher = fsWatch(validatorsDir, (_eventType, filename) => {
      if (!filename?.endsWith(".js")) return;
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => { seam("Sense", `Validator change detected: ${filename} — reloading...`); loadValidators(); reloadTimer = null; }, 200);
    });
    _cleanupResources.validatorWatcher = validatorWatcher;
  } catch (err) {
    seam("Adapt", `⚠️ Cannot watch ${VALIDATORS_DIR}: ${err instanceof Error ? err.message : String(err)}`);
  }

  function runCustomValidators(newContent: string, filePath: string): boolean {
    for (const [name, fn] of state.customValidators) {
      try {
        const t0 = performance.now();
        const result = fn(newContent, filePath);
        const elapsed = performance.now() - t0;
        if (elapsed > VALIDATOR_TIMEOUT_MS) seam("Adapt", `⚠️ Validator ${name} took ${Math.round(elapsed)}ms (>${VALIDATOR_TIMEOUT_MS}ms)`);
        if (result === true) { trackEvent("validator", name, filePath); seam("Adapt", `🛡️ Custom validator ${name} flagged corruption in ${filePath}`); return true; }
      } catch (err) {
        seam("Adapt", `⚠️ Validator ${name} threw error — ignored: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return false;
  }

  // ── Periodic cleanup ──
  const tapCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [file, ts] of state.firstTapTimestamps) { if (now - ts > DOUBLE_TAP_WINDOW_MS) state.firstTapTimestamps.delete(file); }
    for (const [file, ts] of corruptionTaps) { if (now - ts > DOUBLE_TAP_WINDOW_MS) corruptionTaps.delete(file); }
  }, TAP_CLEANUP_INTERVAL_MS);
  _cleanupResources.interval = tapCleanupInterval;

  // ── Suppression Safety ──
  function isMassEvent(now: number): boolean {
    state.recentUnlinks = state.recentUnlinks.filter(t => now - t < MASS_EVENT_WINDOW_MS);
    return state.recentUnlinks.length > MASS_EVENT_THRESHOLD;
  }

  function autoHealFile(antibodyId: string, fileTarget: string, patchOp: string) {
    const t0 = performance.now();
    try {
      seam("Mutate", `Restoring ${fileTarget} via antibody ${antibodyId}...`);
      const patches = JSON.parse(patchOp) as PatchOp[];
      let bytesWritten = 0;
      for (const patch of patches) {
        if (patch.op === "add" && patch.value) {
          const targetPath = resolve(patch.path.replace(/^\//, ""));
          writeFileSync(targetPath, patch.value, "utf-8");
          bytesWritten += patch.value.length;
        }
      }
      const healMs = Math.round(performance.now() - t0);
      state.autoHealCount++;
      state.totalFileBytesSaved += bytesWritten;
      state.autoHealLog.push({ id: antibodyId, at: Date.now() });
      trackEvent("immune", "heal_hit", JSON.stringify({ antibodyId, fileTarget, bytesWritten, healMs }));
      recordMistake(fileTarget, "file-deleted", `File deleted and restored via antibody ${antibodyId}`, antibodyId);
      if (state.autoHealLog.length > 100) state.autoHealLog.shift();
      const metrics = calcHealMetrics(bytesWritten, healMs);
      const boast = maybeHealBoast(5);
      const fileName = fileTarget.split("/").pop() ?? fileTarget;
      (options.mcp ? console.error : console.log)(formatHealLog(fileName, metrics, boast));
    } catch (err) {
      seam("Mutate", `FAILED to restore ${fileTarget}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function handleUnlink(filePath: string, now: number): "healed" | "dormant" | null {
    state.recentUnlinks.push(now);
    insertUnlinkLog.run(filePath, now);
    if (isMassEvent(now)) { state.suppressionSkippedCount++; trackEvent("immune", "suppression", JSON.stringify({ filePath })); state.firstTapTimestamps.clear(); return null; }
    const antibody = findAntibodyByFile.get(filePath) as { id: string; dormant: number } | null;
    if (!antibody) return null;
    const fullAntibody = db.prepare("SELECT * FROM antibodies WHERE id = ?").get(antibody.id) as { id: string; patch_op: string; file_target: string } | null;
    if (!fullAntibody) return null;
    const previousTap = state.firstTapTimestamps.get(filePath);
    if (previousTap && (now - previousTap) < DOUBLE_TAP_WINDOW_MS) {
      setAntibodyDormant.run(antibody.id);
      state.firstTapTimestamps.delete(filePath);
      state.dormantTransitions.push({ antibodyId: antibody.id, at: now });
      if (state.dormantTransitions.length > 100) state.dormantTransitions.shift();
      trackEvent("immune", "dormant", JSON.stringify({ antibodyId: antibody.id }));
      (options.mcp ? console.error : console.log)(formatDormantLog(antibody.id));
      return "dormant";
    }
    state.firstTapTimestamps.set(filePath, now);
    quarantineFile(filePath, null);
    autoHealFile(fullAntibody.id, fullAntibody.file_target, fullAntibody.patch_op);
    return "healed";
  }

  // ── Smart Discovery + Watcher ──
  const discovery = discoverWatchTargets(WATCH_TARGETS);
  seam("Sense", `Smart Discovery: ${discovery.targets.length} targets found in ${discovery.elapsedMs}ms`);
  if (discovery.discoveredCount > 0) {
    seam("Sense", `Discovered ${discovery.discoveredCount} extra: ${discovery.targets.filter(t => !WATCH_TARGETS.includes(t)).join(", ")}`);
  }

  const watcher = watch(discovery.targets, { ignoreInitial: false, persistent: true, atomic: 100 });
  _cleanupResources.watcher = watcher;

  const immuneMap: Record<string, string> = { ".claudeignore": "IMM-001", ".claude/hooks.json": "IMM-002", "CLAUDE.md": "IMM-003" };
  const corruptionTaps = new Map<string, number>();

  function isInternalPath(p: string): boolean {
    const normalized = p.replace(/\\/g, "/");
    return normalized.startsWith(".afd/") || normalized.includes("/.afd/");
  }

  function isCorrupted(oldContent: string, newContent: string, filePath: string): boolean {
    if (runCustomValidators(newContent, filePath)) return true;
    const trimmed = newContent.trim();
    if (trimmed.length === 0) return true;
    if (filePath.endsWith(".json")) {
      if (trimmed === "{}" || trimmed === "[]") return true;
      try { JSON.parse(newContent); } catch { return true; }
    }
    if (oldContent.length > 50 && newContent.length < oldContent.length * 0.1) return true;
    return false;
  }

  // ── Watcher Event Handler (S.E.A.M) ──
  watcher.on("all", (event, path) => {
    if (isInternalPath(path)) return;
    if (selfWrites.has(path)) return;
    const _seamStart = performance.now();

    state.filesDetected++;
    state.lastEvent = `${event}:${path}`;
    state.lastEventAt = Date.now();
    state.watchedFiles.add(path);
    insertEvent.run(event, path, Date.now());

    if (event === "add" || event === "addDir") { seam("Sense", `${event} → ${path}`); snapshotFile(path); trackEvent("seam", "sense", null, Math.round(performance.now() - _seamStart)); return; }

    if (event === "unlink") {
      seam("Sense", `unlink → ${path}`);
      state.fileSnapshots.delete(path);
      const result = handleUnlink(path, Date.now());
      if (result === "healed") {
        selfWrites.add(path);
        setTimeout(() => selfWrites.delete(path), SELF_WRITE_DEBOUNCE_MS);
        seam("Mutate", `Restored ${path} from antibody snapshot`);
        seam("Extract", `💡 Tip: Use the MCP tool 'afd_hologram' on ${path} to safely inspect the file's structure before attempting another edit.`);
        snapshotFile(path);
        watcher.add(path);
      } else if (result === "dormant") {
        seam("Adapt", `Double-tap confirmed — user intentionally deleted ${path}, antibody deactivated`);
      }
      trackEvent("seam", event, path, Math.round(performance.now() - _seamStart));
      return;
    }

    if (event === "change") {
      if (!existsSync(path)) return;
      let newContent: string;
      try { newContent = readFileSync(path, "utf-8"); } catch { return; }
      const oldContent = state.fileSnapshots.get(path);
      const newSize = newContent.length;

      if (oldContent !== undefined && oldContent !== newContent) {
        if (isAstSupported(path)) {
          try {
            const sdiff = semanticDiff(path, oldContent, newContent);
            const breakingTag = sdiff.hasBreakingChanges ? " ⚠️ BREAKING" : "";
            seam("Sense", `change → ${path} (${newSize} bytes)${breakingTag}\n  [semantic] ${sdiff.summary}`);
          } catch {
            const diffs = lineDiff(oldContent, newContent);
            seam("Sense", `change → ${path} (${newSize} bytes)\n${diffs.join("\n")}`);
          }
        } else {
          const diffs = lineDiff(oldContent, newContent);
          if (diffs.length > 0) seam("Sense", `change → ${path} (${newSize} bytes)\n${diffs.join("\n")}`);
          else seam("Sense", `change → ${path} (${newSize} bytes, whitespace-only diff)`);
        }
      } else if (oldContent === undefined) {
        seam("Sense", `change → ${path} (${newSize} bytes, no previous snapshot)`);
      } else {
        seam("Sense", `change → ${path} (${newSize} bytes, content identical — touch or metadata)`);
      }

      const normalizedPath = path.replace(/\\/g, "/");
      const abId = immuneMap[normalizedPath];
      if (abId && oldContent !== undefined) {
        if (isCorrupted(oldContent, newContent, path)) {
          const prevCorruption = corruptionTaps.get(path);
          const now = Date.now();
          if (prevCorruption && (now - prevCorruption) < DOUBLE_TAP_WINDOW_MS) {
            corruptionTaps.delete(path);
            state.fileSnapshots.set(path, newContent);
            insertAntibody.run(abId, "auto-seed", path, JSON.stringify([{ op: "add", path: `/${path}`, value: newContent }]));
            trackEvent("immune", "heal_false_positive", JSON.stringify({ filePath: path, abId }));
            seam("Adapt", `Corruption double-tap on ${path} — standing down, accepting new content`);
          } else {
            corruptionTaps.set(path, now);
            quarantineFile(path, newContent);
            selfWrites.add(path);
            setTimeout(() => selfWrites.delete(path), SELF_WRITE_DEBOUNCE_MS);
            writeFileSync(resolve(path), oldContent, "utf-8");
            trackEvent("immune", "heal_hit", JSON.stringify({ filePath: path, abId }));
            recordMistake(path, "corruption", `Silent corruption detected (${oldContent.length} → ${newSize} bytes) — restored`, abId);
            seam("Mutate", `Silent corruption detected in ${path} (${oldContent.length} → ${newSize} bytes) — restored from snapshot`);
            seam("Extract", `💡 Tip: Use the MCP tool 'afd_hologram' on ${path} to safely inspect the file's structure before attempting another edit.`);
          }
        } else {
          state.fileSnapshots.set(path, newContent);
          const patches: PatchOp[] = [{ op: "add", path: `/${path}`, value: newContent }];
          insertAntibody.run(abId, "auto-seed", path, JSON.stringify(patches));
          trackEvent("immune", "heal_pass", JSON.stringify({ filePath: path, abId }));
          seam("Adapt", `Antibody ${abId} updated: stored latest ${path} (${newSize} bytes) for auto-restore`);
        }
      } else {
        state.fileSnapshots.set(path, newContent);
      }
      trackEvent("seam", "change", path, Math.round(performance.now() - _seamStart));
      return;
    }

    seam("Sense", `${event} → ${path}`);
    trackEvent("seam", event, path, Math.round(performance.now() - _seamStart));
  });

  // ── Workspace Map ──
  const wsMap = createWorkspaceMap();
  _cleanupResources.wsMapGetTimer = wsMap.getTimer;
  watcher.on("add", () => wsMap.markDirty());
  watcher.on("unlink", () => wsMap.markDirty());
  wsMap.get(); // initial build

  // ── Build DaemonContext ──
  const ctx: DaemonContext = {
    state, db: db as unknown as DaemonContext["db"], ws: _ws, options,
    insertEvent, insertAntibody, listAntibodies, antibodyIds: antibodyIds as unknown as DaemonContext["antibodyIds"],
    countAntibodies: countAntibodies as unknown as DaemonContext["countAntibodies"],
    getDailyAll: getDailyAll as unknown as DaemonContext["getDailyAll"],
    insertTelemetry: insertTelemetry as unknown as DaemonContext["insertTelemetry"],
    insertMistakeHistory: insertMistakeHistory as unknown as DaemonContext["insertMistakeHistory"],
    queryMistakesByFile: queryMistakesByFile as unknown as DaemonContext["queryMistakesByFile"],
    deleteMistakeOverflow: deleteMistakeOverflow as unknown as DaemonContext["deleteMistakeOverflow"],
    seam, persistHologramStats, safeHologram,
    getWorkspaceMap: wsMap.get, today, discoveryTargets: discovery.targets,
    port: 0,
  };

  // ── MCP Mode ──
  if (options.mcp) {
    startMcpStdio(ctx);
    return;
  }

  // ── HTTP Server ──
  const server = Bun.serve({ port: 0, fetch: createHttpHandler(ctx, cleanup) });
  const port = server.port;
  ctx.port = port;

  mkdirSync(_ws.afdDir, { recursive: true });
  writeFileSync(_ws.pidFile, String(process.pid));
  writeFileSync(_ws.portFile, String(port));

  console.log(`[afd daemon] pid=${process.pid} port=${port} workspace=${_ws.root}`);

  process.on("uncaughtException", (err) => { console.error("[afd daemon] FATAL:", err.message); cleanup(); process.exit(1); });
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
}

if (import.meta.main) {
  const mcp = process.argv.includes("--mcp") || process.env.AFD_MCP === "1";
  main({ mcp });
}
