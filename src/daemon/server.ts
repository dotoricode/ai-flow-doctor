import { watch } from "chokidar";
import { mkdirSync, writeFileSync, unlinkSync, readFileSync, existsSync, watch as fsWatch, readdirSync, statSync, lstatSync } from "fs";
import { resolve, join } from "path";
import { QUARANTINE_DIR, WATCH_TARGETS, resolveWorkspacePaths } from "../constants";
import { initDb } from "../core/db";
import { generateHologram } from "../core/hologram";
import { diagnose } from "../core/immune";
import type { PatchOp } from "../core/immune";
import { detectEcosystem } from "../adapters/index";
import type { DetectionResult } from "../adapters/index";
import { calcHealMetrics, maybeHealBoast, formatHealLog, formatDormantLog, buildShiftSummary } from "../core/boast";
import { discoverWatchTargets } from "../core/discovery";
import { formatTimestamp, lineDiff } from "../core/log-utils";
import { semanticDiff, isAstSupported } from "../core/semantic-diff";
import { LruStringMap } from "../core/lru-map";
import { analyzeQuarantine, listQuarantine, evolve } from "../core/evolution";

// ── Suppression Safety Constants ──
const DOUBLE_TAP_WINDOW_MS = 30_000;  // 30 seconds — balances demo speed and production safety
const MASS_EVENT_THRESHOLD = 3;       // >3 unlinks in 1 second
const MASS_EVENT_WINDOW_MS = 1_000;   // 1 second window
const TAP_CLEANUP_INTERVAL_MS = 60_000; // Purge stale first-tap entries every 60s
const SELF_WRITE_DEBOUNCE_MS = 100;   // Debounce window for self-write fs.watch duplicates
const MAX_SSE_CLIENTS = 20;             // Prevent DoS via excessive SSE connections
const VALIDATOR_TIMEOUT_MS = 500;       // Max execution time per custom validator
const VALIDATORS_DIR = ".afd/validators"; // Dynamic validator scripts directory

/** Custom validator function signature: returns true if content is considered corrupted */
type ValidatorFn = (newContent: string, filePath: string) => boolean;

interface HologramStats {
  totalRequests: number;
  totalOriginalChars: number;
  totalHologramChars: number;
}

interface DaemonState {
  startedAt: number;
  filesDetected: number;
  lastEvent: string | null;
  lastEventAt: number | null;
  watchedFiles: Set<string>;
  hologramStats: HologramStats;
  ecosystems: DetectionResult[];
  autoHealCount: number;
  autoHealLog: { id: string; at: number }[];
  // Suppression safety: recent unlink timestamps for mass-event detection
  recentUnlinks: number[];
  // Suppression safety: per-file first-tap timestamps for double-tap detection
  firstTapTimestamps: Map<string, number>;
  suppressionSkippedCount: number;
  dormantTransitions: { antibodyId: string; at: number }[];
  totalFileBytesSaved: number;
  /** In-memory snapshot of watched file contents for diff on change (LRU, 10MB cap) */
  fileSnapshots: LruStringMap;
  /** SSE subscribers for live event streaming */
  sseClients: Set<ReadableStreamDefaultController<Uint8Array>>;
  /** Dynamically loaded custom validators from .afd/validators/ */
  customValidators: Map<string, ValidatorFn>;
}

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
  fileSnapshots: new LruStringMap(10 * 1024 * 1024), // 10 MB cap
  sseClients: new Set(),
  customValidators: new Map(),
};

// Workspace-resolved paths (set once at startup)
const _ws = resolveWorkspacePaths();

/** Guard: reject resolved paths outside the workspace root */
function assertInsideWorkspace(absPath: string): void {
  const cwd = process.cwd();
  if (!absPath.startsWith(cwd + "/") && absPath !== cwd) {
    throw new Error(`Access denied: path outside workspace`);
  }
}

// Resources to clean up on exit (populated inside main())
let _cleanupResources: { watcher?: ReturnType<typeof watch>; interval?: ReturnType<typeof setInterval>; mapTimer?: ReturnType<typeof setTimeout>; validatorWatcher?: ReturnType<typeof fsWatch>; db?: { close(): void } } = {};

function cleanup() {
  try { _cleanupResources.interval && clearInterval(_cleanupResources.interval); } catch {}
  try { _cleanupResources.mapTimer && clearTimeout(_cleanupResources.mapTimer); } catch {}
  try { _cleanupResources.watcher?.close(); } catch {}
  try { _cleanupResources.validatorWatcher?.close(); } catch {}
  try { _cleanupResources.db?.close(); } catch {}
  try { unlinkSync(_ws.pidFile); } catch {}
  try { unlinkSync(_ws.portFile); } catch {}
}

interface DaemonOptions {
  mcp?: boolean;
}

export function main(options: DaemonOptions = {}) {
  // Detect ecosystem at startup
  state.ecosystems = detectEcosystem(process.cwd());

  const db = initDb();
  _cleanupResources.db = db;
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

  // ── Persistent Hologram Stats (lifetime + daily) ──
  const getLifetime = db.prepare("SELECT total_requests, total_original_chars, total_hologram_chars FROM hologram_lifetime WHERE id = 1");
  const updateLifetime = db.prepare(
    "UPDATE hologram_lifetime SET total_requests = ?, total_original_chars = ?, total_hologram_chars = ? WHERE id = 1"
  );
  const upsertDaily = db.prepare(`
    INSERT INTO hologram_daily (date, requests, original_chars, hologram_chars)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      requests = requests + excluded.requests,
      original_chars = original_chars + excluded.original_chars,
      hologram_chars = hologram_chars + excluded.hologram_chars
  `);
  const getDailyAll = db.prepare("SELECT date, requests, original_chars, hologram_chars FROM hologram_daily ORDER BY date DESC LIMIT 7");
  const purgeOldDaily = db.prepare("DELETE FROM hologram_daily WHERE date < date('now', '-7 days')");

  function today(): string {
    return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  }

  // Load persisted lifetime stats into memory
  const persistedLife = getLifetime.get() as {
    total_requests: number;
    total_original_chars: number;
    total_hologram_chars: number;
  } | null;
  if (persistedLife) {
    state.hologramStats.totalRequests = persistedLife.total_requests;
    state.hologramStats.totalOriginalChars = persistedLife.total_original_chars;
    state.hologramStats.totalHologramChars = persistedLife.total_hologram_chars;
  }

  /** Record a hologram request into both lifetime and daily stats */
  function persistHologramStats(originalChars: number, hologramChars: number) {
    // Update in-memory lifetime
    state.hologramStats.totalRequests++;
    state.hologramStats.totalOriginalChars += originalChars;
    state.hologramStats.totalHologramChars += hologramChars;

    try {
      // Persist lifetime
      const hs = state.hologramStats;
      updateLifetime.run(hs.totalRequests, hs.totalOriginalChars, hs.totalHologramChars);

      // Upsert today's daily row
      upsertDaily.run(today(), 1, originalChars, hologramChars);

      // Periodic purge (cheap: only deletes if rows exist beyond 7 days)
      purgeOldDaily.run();
    } catch (err) {
      console.error("[afd] Failed to persist hologram stats:", err instanceof Error ? err.message : String(err));
    }
  }

  // ── S.E.A.M Cycle Logger ──
  // In MCP mode, use stderr to keep stdout clean for JSON-RPC protocol
  const GUARD_LINE = "========== GUARDED ==========";
  const GUARD_PHASES = new Set(["Mutate", "Quarantine"]);
  const log = options.mcp ? console.error.bind(console) : console.log.bind(console);
  function seam(phase: string, msg: string) {
    if (GUARD_PHASES.has(phase)) {
      log(`\n${GUARD_LINE}`);
      log(`[${formatTimestamp()}] [afd] [${phase}] ${msg}`);
      log(`${GUARD_LINE}\n`);
    } else {
      log(`[${formatTimestamp()}] [afd] [${phase}] ${msg}`);
    }
    // Broadcast to SSE clients
    const encoder = new TextEncoder();
    const payload = JSON.stringify({ phase, msg, ts: Date.now() });
    const sseData = encoder.encode(`data: ${payload}\n\n`);
    const dead: ReadableStreamDefaultController<Uint8Array>[] = [];
    for (const controller of state.sseClients) {
      try { controller.enqueue(sseData); } catch { dead.push(controller); }
    }
    for (const c of dead) state.sseClients.delete(c);
  }

  /** Snapshot a file's content into memory for future diff */
  function snapshotFile(filePath: string) {
    try {
      if (existsSync(filePath)) {
        state.fileSnapshots.set(filePath, readFileSync(filePath, "utf-8"));
      }
    } catch { /* ignore unreadable files */ }
  }

  /** Safe hologram generation with fallback on AST parse failure */
  function safeHologram(filePath: string, source: string): string {
    // Only attempt hologram for TS/JS files
    if (!/\.[tj]sx?$/.test(filePath)) {
      const lines = source.split("\n");
      return lines.slice(0, 50).join("\n") + (lines.length > 50 ? "\n// … (truncated)" : "");
    }
    try {
      const result = generateHologram(filePath, source);
      persistHologramStats(result.originalLength, result.hologramLength);
      return result.hologram;
    } catch {
      // AST parse failure — return first 50 lines as fallback
      const lines = source.split("\n");
      return lines.slice(0, 50).join("\n") + (lines.length > 50 ? "\n// … (truncated, AST parse failed)" : "");
    }
  }

  /** Quarantine corrupted/deleted file content before restoring */
  function quarantineFile(originalPath: string, corruptedContent: string | null): void {
    try {
      mkdirSync(QUARANTINE_DIR, { recursive: true });
      const now = new Date();
      const ts = now.getFullYear().toString()
        + String(now.getMonth() + 1).padStart(2, "0")
        + String(now.getDate()).padStart(2, "0")
        + "_"
        + String(now.getHours()).padStart(2, "0")
        + String(now.getMinutes()).padStart(2, "0")
        + String(now.getSeconds()).padStart(2, "0");
      const baseName = originalPath.replace(/[\\/]/g, "_").replace(/^_+/, "");
      const quarantinePath = resolve(QUARANTINE_DIR, `${ts}_${baseName}`);
      writeFileSync(quarantinePath, corruptedContent ?? "DELETED", "utf-8");
      seam("Quarantine", `Saved corrupted state → .afd/quarantine/${ts}_${baseName}`);
    } catch (err) {
      seam("Quarantine", `FAILED to quarantine ${originalPath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Auto-Seed Antibodies on Startup ──
  // Read existing immune-critical files and learn antibodies so they can be restored on delete
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

  // ── Self-write tracking: ignore watcher events caused by daemon's own file writes ──
  const selfWrites = new Set<string>();

  seedAntibodies();

  // ── Dynamic Immune Synthesis: hot-reload custom validators from .afd/validators/ ──
  const validatorsDir = join(process.cwd(), VALIDATORS_DIR);

  async function loadValidators() {
    state.customValidators.clear();
    if (!existsSync(validatorsDir)) return;

    let files: string[];
    try {
      files = readdirSync(validatorsDir).filter(f => f.endsWith(".js"));
    } catch { return; }

    for (const file of files) {
      const absPath = resolve(validatorsDir, file);
      try {
        // Cache-bust: append timestamp query to bypass ES module cache
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

  // Initial load
  loadValidators();

  // Watch for changes in .afd/validators/
  try {
    mkdirSync(validatorsDir, { recursive: true });
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    const validatorWatcher = fsWatch(validatorsDir, (_eventType, filename) => {
      if (!filename?.endsWith(".js")) return;
      // Debounce rapid changes (editor save + format)
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        seam("Sense", `Validator change detected: ${filename} — reloading...`);
        loadValidators();
        reloadTimer = null;
      }, 200);
    });
    _cleanupResources.validatorWatcher = validatorWatcher;
  } catch (err) {
    seam("Adapt", `⚠️ Cannot watch ${VALIDATORS_DIR}: ${err instanceof Error ? err.message : String(err)}`);
  }

  /** Run all custom validators with sandbox (try-catch + timeout concept) */
  function runCustomValidators(newContent: string, filePath: string): boolean {
    for (const [name, fn] of state.customValidators) {
      try {
        const t0 = performance.now();
        const result = fn(newContent, filePath);
        const elapsed = performance.now() - t0;
        if (elapsed > VALIDATOR_TIMEOUT_MS) {
          seam("Adapt", `⚠️ Validator ${name} took ${Math.round(elapsed)}ms (>${VALIDATOR_TIMEOUT_MS}ms) — consider optimizing`);
        }
        if (result === true) {
          seam("Adapt", `🛡️ Custom validator ${name} flagged corruption in ${filePath}`);
          return true;
        }
      } catch (err) {
        seam("Adapt", `⚠️ Validator ${name} threw error — ignored: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return false;
  }

  // ── Periodic cleanup: purge stale entries to prevent memory leaks ──
  const tapCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [file, ts] of state.firstTapTimestamps) {
      if (now - ts > DOUBLE_TAP_WINDOW_MS) {
        state.firstTapTimestamps.delete(file);
      }
    }
    // Also purge stale corruption-tap entries
    for (const [file, ts] of corruptionTaps) {
      if (now - ts > DOUBLE_TAP_WINDOW_MS) {
        corruptionTaps.delete(file);
      }
    }
  }, TAP_CLEANUP_INTERVAL_MS);
  _cleanupResources.interval = tapCleanupInterval;

  // ── Suppression Safety: Helper Functions ──

  /** Check if we're in a mass-event burst (>3 unlinks within 1 second) */
  function isMassEvent(now: number): boolean {
    // Prune old entries beyond the window
    state.recentUnlinks = state.recentUnlinks.filter(t => now - t < MASS_EVENT_WINDOW_MS);
    return state.recentUnlinks.length > MASS_EVENT_THRESHOLD;
  }

  /** Clear first-tap state when mass event is detected (bulk ops are not intentional user deletes) */
  function clearTapsOnMassEvent() {
    state.firstTapTimestamps.clear();
  }

  /** Auto-heal: re-apply patches for a given antibody, with metrics & boast */
  function autoHealFile(antibodyId: string, fileTarget: string, patchOp: string) {
    const t0 = performance.now();
    try {
      seam("Mutate", `Restoring ${fileTarget} via antibody ${antibodyId}...`);
      const patches = JSON.parse(patchOp) as PatchOp[];
      let bytesWritten = 0;
      for (const patch of patches) {
        if (patch.op === "add" && patch.value) {
          const targetPath = resolve(patch.path.replace(/^\//, ""));
          assertInsideWorkspace(targetPath);
          writeFileSync(targetPath, patch.value, "utf-8");
          bytesWritten += patch.value.length;
        }
      }
      const healMs = Math.round(performance.now() - t0);
      state.autoHealCount++;
      state.totalFileBytesSaved += bytesWritten;
      state.autoHealLog.push({ id: antibodyId, at: Date.now() });
      if (state.autoHealLog.length > 100) state.autoHealLog.shift();

      // Delightful logging: metrics + occasional boast
      const metrics = calcHealMetrics(bytesWritten, healMs);
      const boast = maybeHealBoast(5); // 1-in-5 chance
      const fileName = fileTarget.split("/").pop() ?? fileTarget;
      log(formatHealLog(fileName, metrics, boast));
    } catch (err) {
      seam("Mutate", `FAILED to restore ${fileTarget}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Handle unlink event with Double-Tap and Mass-Event heuristics.
   * Returns true if the event was handled (healed or made dormant).
   */
  /**
   * Handle unlink event with Double-Tap and Mass-Event heuristics.
   * Returns: "healed" | "dormant" | null
   */
  function handleUnlink(filePath: string, now: number): "healed" | "dormant" | null {
    // Record for mass-event detection
    state.recentUnlinks.push(now);
    insertUnlinkLog.run(filePath, now);

    // Mass-event check: if >3 unlinks in 1s, skip ALL suppression logic
    if (isMassEvent(now)) {
      state.suppressionSkippedCount++;
      clearTapsOnMassEvent();
      return null; // Do nothing — likely git checkout or bulk operation
    }

    // Find active (non-dormant) antibody protecting this file
    const antibody = findAntibodyByFile.get(filePath) as { id: string; dormant: number } | null;
    if (!antibody) return null; // No antibody for this file

    // Fetch full antibody data for healing
    const fullAntibody = db.prepare("SELECT * FROM antibodies WHERE id = ?").get(antibody.id) as {
      id: string; patch_op: string; file_target: string;
    } | null;
    if (!fullAntibody) return null;

    // Double-Tap detection
    const previousTap = state.firstTapTimestamps.get(filePath);

    if (previousTap && (now - previousTap) < DOUBLE_TAP_WINDOW_MS) {
      // SECOND TAP within window → user is intentional → make dormant
      setAntibodyDormant.run(antibody.id);
      state.firstTapTimestamps.delete(filePath);
      state.dormantTransitions.push({ antibodyId: antibody.id, at: now });
      if (state.dormantTransitions.length > 100) state.dormantTransitions.shift();
      log(formatDormantLog(antibody.id));
      return "dormant";
    }

    // FIRST TAP: record timestamp, quarantine deleted state, then auto-heal
    state.firstTapTimestamps.set(filePath, now);
    quarantineFile(filePath, null);
    autoHealFile(fullAntibody.id, fullAntibody.file_target, fullAntibody.patch_op);
    return "healed";
  }

  // ── Smart Discovery: scan for AI-context files ──
  const discovery = discoverWatchTargets(WATCH_TARGETS);
  seam("Sense", `Smart Discovery: ${discovery.targets.length} targets found in ${discovery.elapsedMs}ms`);
  if (discovery.discoveredCount > 0) {
    seam("Sense", `Discovered ${discovery.discoveredCount} extra: ${discovery.targets.filter(t => !WATCH_TARGETS.includes(t)).join(", ")}`);
  }

  // File watcher — atomic: 100 to handle rapid delete-recreate cycles
  // watcher.add() after restore ensures re-detection (see handleUnlink caller)
  const watcher = watch(discovery.targets, {
    ignoreInitial: false,
    persistent: true,
    atomic: 100,
  });
  _cleanupResources.watcher = watcher;

  const immuneMap: Record<string, string> = {
    ".claudeignore": "IMM-001",
    ".claude/hooks.json": "IMM-002",
    "CLAUDE.md": "IMM-003",
  };

  // ── Corruption double-tap: if same file is corruption-restored twice in 30s, stand down ──
  const corruptionTaps = new Map<string, number>();

  /** Check if a path is inside .afd/ (internal state — skip watcher reactions) */
  function isInternalPath(p: string): boolean {
    const normalized = p.replace(/\\/g, "/");
    return normalized.startsWith(".afd/") || normalized.includes("/.afd/");
  }

  /** Detect silent corruption: file exists but content is effectively destroyed */
  function isCorrupted(oldContent: string, newContent: string, filePath: string): boolean {
    // Dynamic Immune Synthesis: run custom validators first
    if (runCustomValidators(newContent, filePath)) return true;

    const trimmed = newContent.trim();
    // Empty or whitespace-only
    if (trimmed.length === 0) return true;
    // JSON file: empty object/array or invalid JSON
    if (filePath.endsWith(".json")) {
      if (trimmed === "{}" || trimmed === "[]") return true;
      try { JSON.parse(newContent); } catch { return true; }
    }
    // 90%+ content reduction (only when original has meaningful length)
    if (oldContent.length > 50 && newContent.length < oldContent.length * 0.1) return true;
    return false;
  }

  watcher.on("all", (event, path) => {
    // ── Guard: ignore .afd/ internal files (DB, logs, registry, test artifacts) ──
    if (isInternalPath(path)) return;

    // ── Guard: ignore events caused by daemon's own writes (debounced 100ms) ──
    if (selfWrites.has(path)) return;

    state.filesDetected++;
    state.lastEvent = `${event}:${path}`;
    state.lastEventAt = Date.now();
    state.watchedFiles.add(path);
    insertEvent.run(event, path, Date.now());

    // ── add / addDir: take initial snapshot ──
    if (event === "add" || event === "addDir") {
      seam("Sense", `${event} → ${path}`);
      snapshotFile(path);
      return;
    }

    // ── unlink: antibody restore / dormant ──
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
      return;
    }

    // ── change: diff against previous snapshot, then update ──
    if (event === "change") {
      if (!existsSync(path)) return;

      let newContent: string;
      try { newContent = readFileSync(path, "utf-8"); } catch { return; }

      const oldContent = state.fileSnapshots.get(path);
      const newSize = newContent.length;

      if (oldContent !== undefined && oldContent !== newContent) {
        // Use semantic diff for TS/JS files, text diff for others
        if (isAstSupported(path)) {
          try {
            const sdiff = semanticDiff(path, oldContent, newContent);
            const breakingTag = sdiff.hasBreakingChanges ? " ⚠️ BREAKING" : "";
            seam("Sense", `change → ${path} (${newSize} bytes)${breakingTag}\n  [semantic] ${sdiff.summary}`);
          } catch {
            // AST parse failure — fall back to text diff
            const diffs = lineDiff(oldContent, newContent);
            seam("Sense", `change → ${path} (${newSize} bytes)\n${diffs.join("\n")}`);
          }
        } else {
          const diffs = lineDiff(oldContent, newContent);
          if (diffs.length > 0) {
            seam("Sense", `change → ${path} (${newSize} bytes)\n${diffs.join("\n")}`);
          } else {
            seam("Sense", `change → ${path} (${newSize} bytes, whitespace-only diff)`);
          }
        }
      } else if (oldContent === undefined) {
        seam("Sense", `change → ${path} (${newSize} bytes, no previous snapshot)`);
      } else {
        seam("Sense", `change → ${path} (${newSize} bytes, content identical — touch or metadata)`);
      }

      // Re-seed antibody if this is an immune-critical file
      const normalizedPath = path.replace(/\\/g, "/");
      const abId = immuneMap[normalizedPath];
      if (abId && oldContent !== undefined) {
        // ── Corruption Detection: silent content destruction ──
        if (isCorrupted(oldContent, newContent, path)) {
          // Double-tap for corruption: if restored twice in 30s, stand down
          const prevCorruption = corruptionTaps.get(path);
          const now = Date.now();
          if (prevCorruption && (now - prevCorruption) < DOUBLE_TAP_WINDOW_MS) {
            // Second corruption within window — user/agent is intentional
            corruptionTaps.delete(path);
            state.fileSnapshots.set(path, newContent);
            insertAntibody.run(abId, "auto-seed", path, JSON.stringify([{ op: "add", path: `/${path}`, value: newContent }]));
            seam("Adapt", `Corruption double-tap on ${path} — standing down, accepting new content`);
          } else {
            // First corruption — quarantine corrupted content, then restore from snapshot
            corruptionTaps.set(path, now);
            quarantineFile(path, newContent);
            selfWrites.add(path);
            setTimeout(() => selfWrites.delete(path), SELF_WRITE_DEBOUNCE_MS);
            writeFileSync(resolve(path), oldContent, "utf-8");
            seam("Mutate", `Silent corruption detected in ${path} (${oldContent.length} → ${newSize} bytes) — restored from snapshot`);
            seam("Extract", `💡 Tip: Use the MCP tool 'afd_hologram' on ${path} to safely inspect the file's structure before attempting another edit.`);
          }
        } else {
          // Normal modification — update snapshot and re-seed antibody
          state.fileSnapshots.set(path, newContent);
          const patches: PatchOp[] = [{ op: "add", path: `/${path}`, value: newContent }];
          insertAntibody.run(abId, "auto-seed", path, JSON.stringify(patches));
          seam("Adapt", `Antibody ${abId} updated: stored latest ${path} (${newSize} bytes) for auto-restore`);
        }
      } else {
        // Non-immune file or no previous snapshot — just update snapshot
        state.fileSnapshots.set(path, newContent);
      }
      return;
    }

    // ── unlinkDir, other events ──
    seam("Sense", `${event} → ${path}`);
  });

  // ── Workspace Map: cached project structure for MCP resource ──
  let workspaceMapCache: string = "";
  let workspaceMapDirty = true;
  let mapRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  /** Build a workspace map: file tree with sizes and export signatures */
  const MAX_WALK_DEPTH = 8;
  function buildWorkspaceMap(): string {
    const cwd = process.cwd();
    const lines: string[] = [`# Workspace Map — ${cwd}`, `# Generated: ${new Date().toISOString()}`, ""];

    function walk(dir: string, prefix: string, depth: number) {
      if (depth > MAX_WALK_DEPTH) return;
      let entries: string[];
      try { entries = readdirSync(dir).sort(); } catch { return; }
      for (const entry of entries) {
        if (entry === "node_modules" || entry === ".afd" || entry === ".git" || entry === "dist" || entry === "coverage") continue;
        const fullPath = join(dir, entry);
        try {
          const lst = lstatSync(fullPath);
          if (lst.isSymbolicLink()) continue; // Skip symlinks to prevent cycles
          const st = lst;
          if (st.isDirectory()) {
            lines.push(`${prefix}${entry}/`);
            walk(fullPath, prefix + "  ", depth + 1);
            continue;
          }
          if (!entry.endsWith(".ts") && !entry.endsWith(".js") && !entry.endsWith(".json") && !entry.endsWith(".md")) continue;
          const sizeKB = (st.size / 1024).toFixed(1);
          // Extract export signatures for TS/JS files
          if (/\.[tj]sx?$/.test(entry) && st.size < 100 * 1024) {
            try {
              const source = readFileSync(fullPath, "utf-8");
              const exports = source.match(/export\s+(?:async\s+)?(?:function|const|class|interface|type|enum)\s+(\w+)/g);
              const sigs = exports ? exports.map(e => e.replace(/^export\s+(async\s+)?/, "").trim()).slice(0, 5).join(", ") : "";
              const extra = exports && exports.length > 5 ? ` +${exports.length - 5} more` : "";
              lines.push(`${prefix}${entry}  (${sizeKB}KB)${sigs ? `  → ${sigs}${extra}` : ""}`);
            } catch {
              lines.push(`${prefix}${entry}  (${sizeKB}KB)`);
            }
          } else {
            lines.push(`${prefix}${entry}  (${sizeKB}KB)`);
          }
        } catch { /* skip */ }
      }
    }

    walk(join(cwd, "src"), "  ", 0);

    // Also list root config files
    lines.push("", "# Root files");
    for (const f of ["CLAUDE.md", "package.json", ".claudeignore", ".mcp.json"]) {
      try {
        const st = statSync(join(cwd, f));
        lines.push(`  ${f}  (${(st.size / 1024).toFixed(1)}KB)`);
      } catch { /* not found */ }
    }

    return lines.join("\n");
  }

  function getWorkspaceMap(): string {
    if (workspaceMapDirty || !workspaceMapCache) {
      workspaceMapCache = buildWorkspaceMap();
      workspaceMapDirty = false;
    }
    return workspaceMapCache;
  }

  // Mark map dirty on file events (debounced rebuild)
  function markMapDirty() {
    workspaceMapDirty = true;
    if (mapRefreshTimer) clearTimeout(mapRefreshTimer);
    mapRefreshTimer = setTimeout(() => { getWorkspaceMap(); }, 5000);
    _cleanupResources.mapTimer = mapRefreshTimer;
  }

  // Hook into watcher events to invalidate map cache
  watcher.on("add", () => markMapDirty());
  watcher.on("unlink", () => markMapDirty());

  // Build initial map
  getWorkspaceMap();

  // ── MCP stdio mode: JSON-RPC over stdin/stdout ──
  if (options.mcp) {
    console.error("[afd] MCP stdio mode — awaiting JSON-RPC on stdin");

    const mcpToolDefs = [
      {
        name: "afd_diagnose",
        description: "Run health diagnosis on the current project. Returns symptoms and healthy checks.",
        inputSchema: {
          type: "object" as const,
          properties: {
            raw: { type: "boolean" as const, description: "If true, report all symptoms ignoring antibodies" },
          },
        },
      },
      {
        name: "afd_score",
        description: "Get daemon runtime stats: uptime, events, heals, hologram savings, suppression metrics.",
        inputSchema: { type: "object" as const, properties: {} },
      },
      {
        name: "afd_hologram",
        description: "Generate a token-efficient hologram (type skeleton) for a TypeScript file.",
        inputSchema: {
          type: "object" as const,
          properties: {
            file: { type: "string" as const, description: "Relative or absolute file path" },
          },
          required: ["file"],
        },
      },
      {
        name: "afd_read",
        description: "Smart file reader that saves tokens. Files <10KB return full content. Files >=10KB return a structural hologram instead. Use 'startLine' and 'endLine' to read specific line ranges of large files at full fidelity.",
        inputSchema: {
          type: "object" as const,
          properties: {
            file: { type: "string" as const, description: "Relative or absolute file path" },
            startLine: { type: "number" as const, description: "Start line number (1-based, inclusive). Use with endLine to read a specific range of large files." },
            endLine: { type: "number" as const, description: "End line number (1-based, inclusive)." },
          },
          required: ["file"],
        },
      },
    ];

    function mcpResponse(id: unknown, result: unknown) {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
    }

    function mcpError(id: unknown, code: number, message: string) {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
    }

    function handleMcpRequest(req: { id?: unknown; method?: string; params?: Record<string, unknown> }) {
      const { id, method, params } = req;

      // ── initialize ──
      if (method === "initialize") {
        mcpResponse(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: "afd", version: "1.4.0" },
        });
        return;
      }

      // ── notifications (no response needed) ──
      if (method === "notifications/initialized") return;

      // ── tools/list ──
      if (method === "tools/list") {
        mcpResponse(id, { tools: mcpToolDefs });
        return;
      }

      // ── resources/list ──
      if (method === "resources/list") {
        mcpResponse(id, {
          resources: [{
            uri: "afd://workspace-map",
            name: "Workspace Map",
            description: "Project file tree with export signatures. Read this first to understand the codebase structure before reading individual files.",
            mimeType: "text/plain",
          }],
        });
        return;
      }

      // ── resources/read ──
      if (method === "resources/read") {
        const uri = params?.uri as string | undefined;
        if (uri === "afd://workspace-map") {
          mcpResponse(id, {
            contents: [{
              uri: "afd://workspace-map",
              mimeType: "text/plain",
              text: getWorkspaceMap(),
            }],
          });
          return;
        }
        mcpError(id, -32602, `Unknown resource: ${uri}`);
        return;
      }

      // ── tools/call ──
      if (method === "tools/call") {
        const toolName = params?.name as string | undefined;
        const args = (params?.arguments ?? {}) as Record<string, unknown>;

        if (toolName === "afd_diagnose") {
          const raw = args.raw === true;
          const known = (antibodyIds.all() as { id: string }[]).map(r => r.id);
          const result = diagnose(known, { raw });

          const PROACTIVE_THRESHOLD = 5 * 1024;
          const enriched = result.symptoms.map((s: { fileTarget: string; [k: string]: unknown }) => {
            const snapshot = state.fileSnapshots.get(s.fileTarget)
              ?? state.fileSnapshots.get(s.fileTarget.replace(/\//g, "\\"));
            if (!snapshot) return s;
            if (snapshot.length > PROACTIVE_THRESHOLD) {
              const hologram = safeHologram(s.fileTarget, snapshot);
              return { ...s, hologram, contextNote: `File is ${(snapshot.length / 1024).toFixed(1)}KB — hologram provided to save tokens.` };
            }
            return { ...s, context: snapshot };
          });

          mcpResponse(id, {
            content: [{ type: "text", text: JSON.stringify({ ...result, symptoms: enriched }, null, 2), cache_control: { type: "ephemeral" } }],
          });
          return;
        }

        if (toolName === "afd_score") {
          const uptime = Math.floor((Date.now() - state.startedAt) / 1000);
          const eventCount = db.query("SELECT COUNT(*) as cnt FROM events").get() as { cnt: number };
          const abCount = countAntibodies.get() as { cnt: number };
          const hs = state.hologramStats;
          const result = {
            uptime,
            filesDetected: state.filesDetected,
            totalEvents: eventCount.cnt,
            antibodies: abCount.cnt,
            autoHealed: state.autoHealCount,
            hologramRequests: hs.totalRequests,
            hologramSavings: hs.totalOriginalChars > 0
              ? `${Math.round((hs.totalOriginalChars - hs.totalHologramChars) / hs.totalOriginalChars * 100)}%`
              : "0%",
            suppression: {
              massEventsSkipped: state.suppressionSkippedCount,
              dormantTransitions: state.dormantTransitions.length,
            },
          };
          mcpResponse(id, {
            content: [{ type: "text", text: JSON.stringify(result, null, 2), cache_control: { type: "ephemeral" } }],
          });
          return;
        }

        if (toolName === "afd_hologram") {
          const file = args.file as string | undefined;
          if (!file) {
            mcpError(id, -32602, "Missing required argument: file");
            return;
          }
          try {
            const absPath = resolve(file);
            assertInsideWorkspace(absPath);
            const source = readFileSync(absPath, "utf-8");
            const result = generateHologram(file, source);
            persistHologramStats(result.originalLength, result.hologramLength);
            mcpResponse(id, {
              content: [{ type: "text", text: result.hologram, cache_control: { type: "ephemeral" } }],
            });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            mcpError(id, -32603, msg);
          }
          return;
        }

        if (toolName === "afd_read") {
          const file = args.file as string | undefined;
          if (!file) {
            mcpError(id, -32602, "Missing required argument: file");
            return;
          }
          try {
            const AFD_READ_THRESHOLD = 10 * 1024; // 10KB
            const absPath = resolve(file);
            assertInsideWorkspace(absPath);
            const source = readFileSync(absPath, "utf-8");
            const sizeKB = (source.length / 1024).toFixed(1);
            const rawStart = args.startLine;
            const rawEnd = args.endLine;
            const startLine = typeof rawStart === "number" && Number.isFinite(rawStart) ? rawStart : undefined;
            const endLine = typeof rawEnd === "number" && Number.isFinite(rawEnd) ? rawEnd : undefined;

            // Line range request — always return verbatim slice
            if (startLine !== undefined && endLine !== undefined) {
              const lines = source.split("\n");
              const start = Math.max(1, Math.floor(startLine)) - 1;
              const end = Math.min(lines.length, Math.floor(endLine));
              const slice = lines.slice(start, end)
                .map((l, i) => `${start + i + 1}\t${l}`)
                .join("\n");
              mcpResponse(id, {
                content: [{ type: "text", text: `// ${file} lines ${start + 1}-${end} (${sizeKB}KB total)\n${slice}`, cache_control: { type: "ephemeral" } }],
              });
              return;
            }

            // Small file — return full content
            if (source.length < AFD_READ_THRESHOLD) {
              mcpResponse(id, {
                content: [{ type: "text", text: source, cache_control: { type: "ephemeral" } }],
              });
              return;
            }

            // Large file — return hologram with advisory
            const result = generateHologram(file, source);
            persistHologramStats(result.originalLength, result.hologramLength);
            const savings = Math.round((1 - result.hologramLength / result.originalLength) * 100);
            const header = [
              `⚠️ [afd-Optimizer]: File is ${sizeKB}KB. To save tokens, only the structural hologram is provided (${savings}% reduction).`,
              `Use afd_read with startLine/endLine to read specific sections at full fidelity.`,
              `Total lines: ${source.split("\n").length}`,
              "",
            ].join("\n");
            mcpResponse(id, {
              content: [{ type: "text", text: header + result.hologram, cache_control: { type: "ephemeral" } }],
            });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            mcpError(id, -32603, msg);
          }
          return;
        }

        mcpError(id, -32601, `Unknown tool: ${toolName}`);
        return;
      }

      mcpError(id, -32601, `Unknown method: ${method}`);
    }

    const MCP_MAX_BUFFER = 1024 * 1024; // 1 MB — reject oversized payloads without newline

    (async () => {
      const decoder = new TextDecoder();
      let buffer = "";
      for await (const chunk of Bun.stdin.stream()) {
        buffer += decoder.decode(chunk);

        // Guard against unbounded buffer growth (no newline → malicious/broken client)
        if (buffer.length > MCP_MAX_BUFFER) {
          console.error("[afd] MCP buffer overflow — dropping buffer");
          buffer = "";
          continue;
        }

        // Process all complete lines in buffer
        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);
          if (!line) continue;
          try {
            handleMcpRequest(JSON.parse(line));
          } catch {
            // Crash-only: malformed JSON is ignored
          }
        }
      }
    })().catch((err) => {
      console.error("[afd] MCP stdin loop error:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
    return; // file watcher + stdin loop keep process alive
  }

  // HTTP server for IPC
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/health") {
        return Response.json({ status: "alive", pid: process.pid, workspace: _ws.root, port });
      }

      if (url.pathname === "/mini-status") {
        const last = state.autoHealLog.length > 0
          ? state.autoHealLog[state.autoHealLog.length - 1].id
          : null;
        return Response.json({
          status: "ON",
          healed_count: state.autoHealCount,
          last_healed: last,
        });
      }

      if (url.pathname === "/hologram") {
        const file = url.searchParams.get("file");
        if (!file) return Response.json({ error: "?file= required" }, { status: 400 });
        try {
          const absPath = resolve(file);
          assertInsideWorkspace(absPath);
          const source = readFileSync(absPath, "utf-8");
          const result = generateHologram(file, source);
          persistHologramStats(result.originalLength, result.hologramLength);
          return Response.json(result);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return Response.json({ error: msg }, { status: 404 });
        }
      }

      if (url.pathname === "/workspace-map") {
        return new Response(getWorkspaceMap(), { headers: { "Content-Type": "text/plain" } });
      }

      if (url.pathname === "/read") {
        const file = url.searchParams.get("file");
        if (!file) return Response.json({ error: "?file= required" }, { status: 400 });
        try {
          const AFD_READ_THRESHOLD = 10 * 1024;
          const absPath = resolve(file);
          assertInsideWorkspace(absPath);
          const source = readFileSync(absPath, "utf-8");
          const rawStart = parseInt(url.searchParams.get("startLine") ?? "", 10);
          const rawEnd = parseInt(url.searchParams.get("endLine") ?? "", 10);

          if (Number.isFinite(rawStart) && Number.isFinite(rawEnd)) {
            const lines = source.split("\n");
            const s = Math.max(1, rawStart) - 1;
            const e = Math.min(lines.length, rawEnd);
            return Response.json({ file, lines: lines.slice(s, e), range: [s + 1, e], totalLines: lines.length });
          }
          if (source.length < AFD_READ_THRESHOLD) {
            return Response.json({ file, content: source, mode: "full" });
          }
          const result = generateHologram(file, source);
          persistHologramStats(result.originalLength, result.hologramLength);
          return Response.json({ file, hologram: result.hologram, mode: "hologram", originalSize: source.length, totalLines: source.split("\n").length });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return Response.json({ error: msg }, { status: 404 });
        }
      }

      if (url.pathname === "/diagnose") {
        const raw = url.searchParams.get("raw") === "true";
        const known = (antibodyIds.all() as { id: string }[]).map(r => r.id);
        const result = diagnose(known, { raw });

        const PROACTIVE_HOLOGRAM_THRESHOLD = 5 * 1024; // 5KB

        // Enrich symptoms with proactive hologram context
        const enriched = result.symptoms.map((s: { fileTarget: string; [k: string]: unknown }) => {
          const snapshot = state.fileSnapshots.get(s.fileTarget)
            ?? state.fileSnapshots.get(s.fileTarget.replace(/\//g, "\\"));
          if (!snapshot) return s;

          // Proactive hologram: large files get auto-compressed
          if (snapshot.length > PROACTIVE_HOLOGRAM_THRESHOLD) {
            const hologram = safeHologram(s.fileTarget, snapshot);
            return {
              ...s,
              hologram,
              contextNote: `File is ${(snapshot.length / 1024).toFixed(1)}KB — hologram skeleton provided to save tokens (${Math.round((1 - hologram.length / snapshot.length) * 100)}% reduction).`,
            };
          }

          // Small files: return full content as-is
          return { ...s, context: snapshot };
        });

        return Response.json({ ...result, symptoms: enriched });
      }

      if (url.pathname === "/antibodies") {
        const rows = listAntibodies.all();
        return Response.json({ antibodies: rows });
      }

      if (url.pathname === "/antibodies/learn" && req.method === "POST") {
        try {
          const body = await req.json() as {
            id: string;
            patternType: string;
            fileTarget: string;
            patches: PatchOp[];
          };
          insertAntibody.run(
            body.id,
            body.patternType,
            body.fileTarget,
            JSON.stringify(body.patches)
          );
          return Response.json({ status: "learned", id: body.id });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return Response.json({ error: msg }, { status: 400 });
        }
      }

      if (url.pathname === "/auto-heal/record" && req.method === "POST") {
        try {
          const body = await req.json() as { id: string };
          state.autoHealCount++;
          state.autoHealLog.push({ id: body.id, at: Date.now() });
          // Keep log bounded
          if (state.autoHealLog.length > 100) state.autoHealLog.shift();
          return Response.json({ status: "recorded", total: state.autoHealCount });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return Response.json({ error: msg }, { status: 400 });
        }
      }

      if (url.pathname === "/score") {
        const uptime = Math.floor((Date.now() - state.startedAt) / 1000);
        const eventCount = db.query("SELECT COUNT(*) as cnt FROM events").get() as { cnt: number };
        const abCount = countAntibodies.get() as { cnt: number };
        const hs = state.hologramStats;
        const globalSavings = hs.totalOriginalChars > 0
          ? Math.round((hs.totalOriginalChars - hs.totalHologramChars) / hs.totalOriginalChars * 1000) / 10
          : 0;
        const dailyRows = getDailyAll.all() as { date: string; requests: number; original_chars: number; hologram_chars: number }[];
        const todayRow = dailyRows.find(r => r.date === today());
        return Response.json({
          uptime,
          filesDetected: state.filesDetected,
          totalEvents: eventCount.cnt,
          lastEvent: state.lastEvent,
          lastEventAt: state.lastEventAt,
          watchedFiles: [...state.watchedFiles],
          watchTargets: discovery.targets,
          hologram: {
            lifetime: {
              requests: hs.totalRequests,
              originalChars: hs.totalOriginalChars,
              hologramChars: hs.totalHologramChars,
              savings: globalSavings,
            },
            today: todayRow ? {
              requests: todayRow.requests,
              originalChars: todayRow.original_chars,
              hologramChars: todayRow.hologram_chars,
              savings: todayRow.original_chars > 0
                ? Math.round((todayRow.original_chars - todayRow.hologram_chars) / todayRow.original_chars * 1000) / 10
                : 0,
            } : null,
            daily: dailyRows.map(r => ({
              date: r.date,
              requests: r.requests,
              originalChars: r.original_chars,
              hologramChars: r.hologram_chars,
            })),
          },
          immune: {
            antibodies: abCount.cnt,
            autoHealed: state.autoHealCount,
            lastAutoHeal: state.autoHealLog.length > 0
              ? state.autoHealLog[state.autoHealLog.length - 1]
              : null,
          },
          ecosystem: {
            detected: state.ecosystems.map(e => ({
              name: e.adapter.name,
              confidence: e.confidence,
              schema: e.adapter.getHarnessSchema(),
            })),
            primary: state.ecosystems[0]?.adapter.name ?? "Unknown",
          },
          suppression: {
            massEventsSkipped: state.suppressionSkippedCount,
            dormantTransitions: state.dormantTransitions.length,
            activeTaps: state.firstTapTimestamps.size,
          },
          evolution: (() => {
            const q = listQuarantine();
            return {
              totalQuarantined: q.length,
              totalLearned: q.filter(e => e.learned).length,
              pending: q.filter(e => !e.learned).length,
            };
          })(),
          dynamicImmune: {
            activeValidators: state.customValidators.size,
            validatorNames: [...state.customValidators.keys()],
          },
        });
      }

      if (url.pathname === "/evolution") {
        const result = evolve();
        return Response.json(result);
      }

      if (url.pathname === "/evolution/status") {
        const q = listQuarantine();
        const stats = analyzeQuarantine();
        return Response.json({
          totalQuarantined: q.length,
          totalLearned: q.filter(e => e.learned).length,
          pending: stats.pending,
          lessons: stats.lessons.map(l => ({
            file: l.entry.originalPath,
            type: l.failureType,
            timestamp: l.entry.timestamp,
            suggestion: l.suggestion,
          })),
        });
      }

      if (url.pathname === "/sync") {
        const rows = listAntibodies.all() as {
          id: string;
          pattern_type: string;
          file_target: string;
          patch_op: string;
          created_at: string;
        }[];
        // Sanitize: strip absolute paths, keep only relative patterns
        const sanitized = rows.map(r => {
          const patches = JSON.parse(r.patch_op) as PatchOp[];
          const cleanPatches = patches.map(p => ({
            ...p,
            // Ensure paths are relative (strip any leading drive/abs prefix)
            path: p.path.replace(/^[A-Za-z]:/, "").replace(/\\/g, "/"),
            // Strip absolute paths from values
            value: p.value?.replace(/[A-Za-z]:\\[^\s"']*/g, "<redacted>"),
          }));
          return {
            id: r.id,
            patternType: r.pattern_type,
            fileTarget: r.file_target.replace(/^[A-Za-z]:/, "").replace(/\\/g, "/"),
            patches: cleanPatches,
            learnedAt: r.created_at,
          };
        });
        const payload = {
          version: "0.1.0",
          generatedAt: new Date().toISOString(),
          ecosystem: state.ecosystems[0]?.adapter.name ?? "Unknown",
          antibodyCount: sanitized.length,
          antibodies: sanitized,
        };
        // Write payload to disk
        const payloadPath = resolve(_ws.afdDir, "global-vaccine-payload.json");
        writeFileSync(payloadPath, JSON.stringify(payload, null, 2), "utf-8");
        return Response.json({ status: "exported", path: payloadPath, count: sanitized.length });
      }

      if (url.pathname === "/shift-summary") {
        const uptime = Math.floor((Date.now() - state.startedAt) / 1000);
        const eventCount = db.query("SELECT COUNT(*) as cnt FROM events").get() as { cnt: number };
        const hs = state.hologramStats;
        const hologramSavedChars = Math.max(0, hs.totalOriginalChars - hs.totalHologramChars);
        const summary = buildShiftSummary({
          uptimeSeconds: uptime,
          totalEvents: eventCount.cnt,
          healsPerformed: state.autoHealCount,
          totalFileBytesSaved: state.totalFileBytesSaved,
          suppressionsSkipped: state.suppressionSkippedCount,
          dormantTransitions: state.dormantTransitions.length,
          hologramSavedChars,
        });
        return Response.json(summary);
      }

      if (url.pathname === "/events") {
        if (state.sseClients.size >= MAX_SSE_CLIENTS) {
          return Response.json({ error: "Too many SSE clients" }, { status: 429 });
        }
        let sseController: ReadableStreamDefaultController<Uint8Array> | null = null;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            sseController = controller;
            state.sseClients.add(controller);
          },
          cancel() {
            if (sseController) state.sseClients.delete(sseController);
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          },
        });
      }

      if (url.pathname === "/stop") {
        cleanup();
        setTimeout(() => process.exit(0), 100);
        return Response.json({ status: "stopping" });
      }

      return Response.json({ error: "not found" }, { status: 404 });
    },
  });

  const port = server.port;

  mkdirSync(_ws.afdDir, { recursive: true });
  writeFileSync(_ws.pidFile, String(process.pid));
  writeFileSync(_ws.portFile, String(port));

  console.log(`[afd daemon] pid=${process.pid} port=${port} workspace=${_ws.root}`);

  process.on("uncaughtException", (err) => {
    console.error("[afd daemon] FATAL:", err.message);
    cleanup();
    process.exit(1);
  });

  process.on("SIGTERM", () => { cleanup(); process.exit(0); });
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
}

// Auto-execute when run directly (not imported)
if (import.meta.main) {
  const mcp = process.argv.includes("--mcp") || process.env.AFD_MCP === "1";
  main({ mcp });
}
