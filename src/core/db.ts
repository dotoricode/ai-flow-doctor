import { mkdirSync } from "fs";
import { Database } from "bun:sqlite";
import { resolveWorkspacePaths } from "../constants";

export function initDb(): Database {
  const paths = resolveWorkspacePaths();
  mkdirSync(paths.afdDir, { recursive: true });
  const db = new Database(paths.dbFile);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 3000");

  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      path TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS antibodies (
      id TEXT PRIMARY KEY,
      pattern_type TEXT NOT NULL,
      file_target TEXT NOT NULL,
      patch_op TEXT NOT NULL,
      dormant INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Migration: add dormant column if missing (existing DBs)
  try {
    db.exec("ALTER TABLE antibodies ADD COLUMN dormant INTEGER NOT NULL DEFAULT 0");
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: federation columns (v1.7)
  try { db.exec("ALTER TABLE antibodies ADD COLUMN scope TEXT NOT NULL DEFAULT 'local'"); } catch { /* exists */ }
  try { db.exec("ALTER TABLE antibodies ADD COLUMN ab_version INTEGER NOT NULL DEFAULT 1"); } catch { /* exists */ }
  try { db.exec("ALTER TABLE antibodies ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))"); } catch { /* exists */ }

  db.exec(`
    CREATE TABLE IF NOT EXISTS unlink_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `);

  // ── Hologram Stats: lifetime (single row) + daily (7-day rolling) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS hologram_lifetime (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      total_requests INTEGER NOT NULL DEFAULT 0,
      total_original_chars INTEGER NOT NULL DEFAULT 0,
      total_hologram_chars INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec(`INSERT OR IGNORE INTO hologram_lifetime (id) VALUES (1)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS hologram_daily (
      date TEXT PRIMARY KEY,
      requests INTEGER NOT NULL DEFAULT 0,
      original_chars INTEGER NOT NULL DEFAULT 0,
      hologram_chars INTEGER NOT NULL DEFAULT 0
    )
  `);
  // Purge entries older than 7 days
  db.exec(`DELETE FROM hologram_daily WHERE date < date('now', '-7 days')`);

  // ── Context Savings: workspace-map and pinpoint read tracking ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS ctx_savings_daily (
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      requests INTEGER NOT NULL DEFAULT 0,
      original_chars INTEGER NOT NULL DEFAULT 0,
      saved_chars INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (date, type)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS ctx_savings_lifetime (
      type TEXT NOT NULL PRIMARY KEY,
      total_requests INTEGER NOT NULL DEFAULT 0,
      total_original_chars INTEGER NOT NULL DEFAULT 0,
      total_saved_chars INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec(`INSERT OR IGNORE INTO ctx_savings_lifetime (type) VALUES ('wsmap')`);
  db.exec(`INSERT OR IGNORE INTO ctx_savings_lifetime (type) VALUES ('pinpoint')`);
  db.exec(`DELETE FROM ctx_savings_daily WHERE date < date('now', '-7 days')`);

  // ── Telemetry: feature usage tracking ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT,
      duration_ms REAL,
      timestamp INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_telemetry_cat_ts ON telemetry(category, timestamp)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_telemetry_action ON telemetry(action)`);
  // Purge raw telemetry older than 30 days
  db.exec(`DELETE FROM telemetry WHERE timestamp < unixepoch() * 1000 - 30 * 86400000`);

  // ── Mistake History: passive defense tracking ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS mistake_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      mistake_type TEXT NOT NULL,
      description TEXT NOT NULL,
      antibody_id TEXT,
      timestamp INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mistake_history_path ON mistake_history(file_path)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mistake_history_ts ON mistake_history(timestamp)`);
  db.exec(`DELETE FROM mistake_history WHERE timestamp < unixepoch() * 1000 - 90 * 86400000`);

  // Migration: move data from old hologram_stats table if it exists
  try {
    const old = db.prepare("SELECT total_requests, total_original_chars, total_hologram_chars FROM hologram_stats WHERE id = 1").get() as {
      total_requests: number; total_original_chars: number; total_hologram_chars: number;
    } | null;
    if (old && old.total_requests > 0) {
      db.transaction(() => {
        db.prepare(
          "UPDATE hologram_lifetime SET total_requests = ?, total_original_chars = ?, total_hologram_chars = ? WHERE id = 1"
        ).run(old.total_requests, old.total_original_chars, old.total_hologram_chars);
        db.exec("DROP TABLE hologram_stats");
      })();
    }
  } catch {
    // Old table doesn't exist — clean install
  }

  return db;
}
