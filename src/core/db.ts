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

  return db;
}
