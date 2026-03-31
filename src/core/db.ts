import { mkdirSync } from "fs";
import { Database } from "bun:sqlite";
import { AFD_DIR, DB_FILE } from "../constants";

export function initDb(): Database {
  mkdirSync(AFD_DIR, { recursive: true });
  const db = new Database(DB_FILE);
  db.exec("PRAGMA journal_mode = WAL");

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

  // Migration: move data from old hologram_stats table if it exists
  try {
    const old = db.prepare("SELECT total_requests, total_original_chars, total_hologram_chars FROM hologram_stats WHERE id = 1").get() as {
      total_requests: number; total_original_chars: number; total_hologram_chars: number;
    } | null;
    if (old && old.total_requests > 0) {
      db.exec(`UPDATE hologram_lifetime SET total_requests = ${old.total_requests}, total_original_chars = ${old.total_original_chars}, total_hologram_chars = ${old.total_hologram_chars} WHERE id = 1`);
      db.exec("DROP TABLE hologram_stats");
    }
  } catch {
    // Old table doesn't exist — clean install
  }

  return db;
}
