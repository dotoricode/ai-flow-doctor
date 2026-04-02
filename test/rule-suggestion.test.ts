import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { suggestRules } from "../src/core/rule-suggestion";

let testCounter = 0;

function createTestDb(): Database {
  const dbPath = `${import.meta.dir}/.tmp-suggest-${++testCounter}-${Date.now()}.sqlite`;
  const db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = DELETE");
  db.exec(`
    CREATE TABLE IF NOT EXISTS mistake_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      mistake_type TEXT NOT NULL,
      description TEXT NOT NULL,
      antibody_id TEXT,
      timestamp INTEGER NOT NULL
    )
  `);
  return db;
}

function seedMistakes(db: Database, entries: { file_path: string; mistake_type: string; description: string; timestamp: number }[]) {
  const stmt = db.prepare("INSERT INTO mistake_history (file_path, mistake_type, description, timestamp) VALUES (?, ?, ?, ?)");
  for (const e of entries) {
    stmt.run(e.file_path, e.mistake_type, e.description, e.timestamp);
  }
}

describe("rule-suggestion", () => {
  it("returns empty when no mistakes exist", () => {
    const db = createTestDb();
    const results = suggestRules(db);
    expect(results).toEqual([]);
    db.close();
  });

  it("returns empty when frequency is below threshold", () => {
    const db = createTestDb();
    const now = Date.now();
    seedMistakes(db, [
      { file_path: "src/main.ts", mistake_type: "corruption", description: "broken", timestamp: now },
      { file_path: "src/main.ts", mistake_type: "corruption", description: "broken", timestamp: now - 1000 },
    ]);
    const results = suggestRules(db);
    expect(results).toEqual([]);
    db.close();
  });

  it("suggests when frequency meets threshold", () => {
    const db = createTestDb();
    const now = Date.now();
    seedMistakes(db, [
      { file_path: "CLAUDE.md", mistake_type: "truncation", description: "content reduced by 95%", timestamp: now },
      { file_path: "CLAUDE.md", mistake_type: "truncation", description: "content reduced by 90%", timestamp: now - 3600_000 },
      { file_path: "CLAUDE.md", mistake_type: "truncation", description: "content reduced by 80%", timestamp: now - 7200_000 },
    ]);
    const results = suggestRules(db);
    expect(results.length).toBe(1);
    expect(results[0].filePath).toBe("CLAUDE.md");
    expect(results[0].mistakeType).toBe("truncation");
    expect(results[0].frequency).toBe(3);
    expect(results[0].description).toBe("content reduced by 95%");
    db.close();
  });

  it("ranks by frequency descending", () => {
    const db = createTestDb();
    const now = Date.now();
    seedMistakes(db, [
      { file_path: "A.md", mistake_type: "deletion", description: "d", timestamp: now },
      { file_path: "A.md", mistake_type: "deletion", description: "d", timestamp: now - 1000 },
      { file_path: "A.md", mistake_type: "deletion", description: "d", timestamp: now - 2000 },
      { file_path: "B.json", mistake_type: "json_syntax", description: "j", timestamp: now },
      { file_path: "B.json", mistake_type: "json_syntax", description: "j", timestamp: now - 1000 },
      { file_path: "B.json", mistake_type: "json_syntax", description: "j", timestamp: now - 2000 },
      { file_path: "B.json", mistake_type: "json_syntax", description: "j", timestamp: now - 3000 },
      { file_path: "B.json", mistake_type: "json_syntax", description: "j", timestamp: now - 4000 },
    ]);
    const results = suggestRules(db);
    expect(results.length).toBe(2);
    expect(results[0].filePath).toBe("B.json");
    expect(results[0].frequency).toBe(5);
    expect(results[1].filePath).toBe("A.md");
    expect(results[1].frequency).toBe(3);
    db.close();
  });

  it("excludes events outside the analysis window", () => {
    const db = createTestDb();
    const now = Date.now();
    const oldTimestamp = now - 40 * 86_400_000;
    seedMistakes(db, [
      { file_path: "old.ts", mistake_type: "corruption", description: "old", timestamp: oldTimestamp },
      { file_path: "old.ts", mistake_type: "corruption", description: "old", timestamp: oldTimestamp + 1000 },
      { file_path: "old.ts", mistake_type: "corruption", description: "old", timestamp: oldTimestamp + 2000 },
    ]);
    const results = suggestRules(db, { days: 30 });
    expect(results).toEqual([]);
    const wider = suggestRules(db, { days: 45 });
    expect(wider.length).toBe(1);
    db.close();
  });

  it("respects custom minFrequency", () => {
    const db = createTestDb();
    const now = Date.now();
    seedMistakes(db, [
      { file_path: "x.ts", mistake_type: "empty", description: "e", timestamp: now },
      { file_path: "x.ts", mistake_type: "empty", description: "e", timestamp: now - 1000 },
    ]);
    const results = suggestRules(db, { minFrequency: 2 });
    expect(results.length).toBe(1);
    const strict = suggestRules(db, { minFrequency: 3 });
    expect(strict).toEqual([]);
    db.close();
  });

  it("groups by (file_path, mistake_type) separately", () => {
    const db = createTestDb();
    const now = Date.now();
    seedMistakes(db, [
      { file_path: "same.ts", mistake_type: "corruption", description: "c", timestamp: now },
      { file_path: "same.ts", mistake_type: "corruption", description: "c", timestamp: now - 1000 },
      { file_path: "same.ts", mistake_type: "corruption", description: "c", timestamp: now - 2000 },
      { file_path: "same.ts", mistake_type: "deletion", description: "d", timestamp: now },
      { file_path: "same.ts", mistake_type: "deletion", description: "d", timestamp: now - 1000 },
      { file_path: "same.ts", mistake_type: "deletion", description: "d", timestamp: now - 2000 },
    ]);
    const results = suggestRules(db);
    expect(results.length).toBe(2);
    expect(new Set(results.map(r => r.mistakeType))).toEqual(new Set(["corruption", "deletion"]));
    db.close();
  });

  it("respects limit", () => {
    const db = createTestDb();
    const now = Date.now();
    for (let i = 0; i < 15; i++) {
      seedMistakes(db, [
        { file_path: `file${i}.ts`, mistake_type: "corruption", description: "c", timestamp: now },
        { file_path: `file${i}.ts`, mistake_type: "corruption", description: "c", timestamp: now - 1000 },
        { file_path: `file${i}.ts`, mistake_type: "corruption", description: "c", timestamp: now - 2000 },
      ]);
    }
    const results = suggestRules(db, { limit: 5 });
    expect(results.length).toBe(5);
    db.close();
  });
});
