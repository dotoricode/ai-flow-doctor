import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { correlatePatterns, findMatchingHotspot } from "../src/core/correlation-engine";

let counter = 0;

function createTestDb(): Database {
  const path = `${import.meta.dir}/.tmp-correlate-${++counter}-${Date.now()}.sqlite`;
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = DELETE");
  db.exec(`
    CREATE TABLE IF NOT EXISTS antibodies (
      id TEXT PRIMARY KEY,
      pattern_type TEXT NOT NULL,
      file_target TEXT NOT NULL DEFAULT '',
      patch_op TEXT NOT NULL DEFAULT '[]',
      dormant INTEGER NOT NULL DEFAULT 0,
      scope TEXT NOT NULL DEFAULT 'local',
      ab_version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  return db;
}

let abId = 0;

function seedAntibody(db: Database, patternType: string, scope: string, count = 1) {
  for (let i = 0; i < count; i++) {
    db.prepare(
      "INSERT INTO antibodies (id, pattern_type, file_target, patch_op, scope) VALUES (?, ?, '', '[]', ?)"
    ).run(`ab-${++abId}`, patternType, scope);
  }
}

describe("correlation-engine", () => {
  it("returns empty when no antibodies exist", () => {
    const db = createTestDb();
    const result = correlatePatterns(db);
    expect(result.hotspots).toEqual([]);
    expect(result.totalScopes).toBe(0);
    db.close();
  });

  it("excludes local-scope antibodies by default", () => {
    const db = createTestDb();
    seedAntibody(db, "corruption", "local", 3);
    const result = correlatePatterns(db);
    expect(result.hotspots).toEqual([]);
    db.close();
  });

  it("includes local scope when includeLocal is true", () => {
    const db = createTestDb();
    seedAntibody(db, "corruption", "local");
    seedAntibody(db, "corruption", "org-b");
    const result = correlatePatterns(db, { includeLocal: true, minScopes: 2 });
    expect(result.hotspots.length).toBe(1);
    expect(result.hotspots[0].scopeCount).toBe(2);
    db.close();
  });

  it("requires minScopes threshold to qualify as global hotspot", () => {
    const db = createTestDb();
    // Only 1 remote scope — should NOT appear with default minScopes=2
    seedAntibody(db, "json-corruption", "org-a", 5);
    const r1 = correlatePatterns(db, { minScopes: 2 });
    expect(r1.hotspots).toEqual([]);

    // Add second scope — should now appear
    seedAntibody(db, "json-corruption", "org-b", 3);
    const r2 = correlatePatterns(db, { minScopes: 2 });
    expect(r2.hotspots.length).toBe(1);
    expect(r2.hotspots[0].canonicalType).toBe("json-corruption");
    expect(r2.hotspots[0].scopeCount).toBe(2);
    db.close();
  });

  it("ranks hotspots by scopeCount DESC then totalOccurrences DESC", () => {
    const db = createTestDb();
    // Pattern A: 2 scopes, 2 occurrences
    seedAntibody(db, "truncation", "org-a");
    seedAntibody(db, "truncation", "org-b");
    // Pattern B: 3 scopes, 3 occurrences
    seedAntibody(db, "deletion", "org-a");
    seedAntibody(db, "deletion", "org-b");
    seedAntibody(db, "deletion", "org-c");
    const result = correlatePatterns(db, { minScopes: 2 });
    expect(result.hotspots.length).toBe(2);
    expect(result.hotspots[0].canonicalType).toBe("deletion");
    expect(result.hotspots[0].scopeCount).toBe(3);
    expect(result.hotspots[1].canonicalType).toBe("truncation");
    db.close();
  });

  it("clusters similar pattern_type variants by Jaccard similarity", () => {
    const db = createTestDb();
    // "json-syntax-error" and "json-parse-error" should cluster (share 'json' token)
    seedAntibody(db, "json-syntax-error", "org-a", 2);
    seedAntibody(db, "json-parse-error", "org-b", 2);
    const result = correlatePatterns(db, { minScopes: 2, similarityThreshold: 0.2 });
    // Should produce 1 hotspot with 2 variants and 2 scopes
    expect(result.hotspots.length).toBe(1);
    expect(result.hotspots[0].scopeCount).toBe(2);
    expect(result.hotspots[0].variants.length).toBe(2);
    db.close();
  });

  it("does NOT cluster unrelated pattern types", () => {
    const db = createTestDb();
    seedAntibody(db, "deletion", "org-a");
    seedAntibody(db, "deletion", "org-b");
    seedAntibody(db, "truncation", "org-a");
    seedAntibody(db, "truncation", "org-b");
    const result = correlatePatterns(db, { minScopes: 2, similarityThreshold: 0.8 });
    // High threshold — "deletion" and "truncation" share no tokens → 2 separate hotspots
    expect(result.hotspots.length).toBe(2);
    db.close();
  });

  it("reports correct totalScopes and analysisWindow", () => {
    const db = createTestDb();
    seedAntibody(db, "corruption", "org-x");
    seedAntibody(db, "corruption", "org-y");
    seedAntibody(db, "deletion", "org-z");
    // org-z alone doesn't reach minScopes=2, but it still counts in totalScopes
    const result = correlatePatterns(db, { minScopes: 2 });
    expect(result.totalScopes).toBe(3);
    expect(result.analysisWindow.scopes).toContain("org-x");
    expect(result.analysisWindow.scopes).toContain("org-y");
    expect(result.analysisWindow.scopes).toContain("org-z");
    db.close();
  });

  it("respects limit", () => {
    const db = createTestDb();
    // Use clearly distinct patterns so threshold=0.9 keeps them in separate clusters
    const distinctPatterns = [
      "corruption", "deletion", "truncation", "json-syntax",
      "import-removal", "blank-body", "schema-violation", "overflow-write",
    ];
    for (const pt of distinctPatterns) {
      seedAntibody(db, pt, "org-a");
      seedAntibody(db, pt, "org-b");
    }
    const result = correlatePatterns(db, { minScopes: 2, limit: 3, similarityThreshold: 0.9 });
    expect(result.hotspots.length).toBe(3);
    db.close();
  });
});

describe("findMatchingHotspot", () => {
  it("returns null when hotspots list is empty", () => {
    expect(findMatchingHotspot("json-corruption", [])).toBeNull();
  });

  it("finds a matching hotspot by token similarity", () => {
    const db = createTestDb();
    seedAntibody(db, "json-syntax-corruption", "org-a", 2);
    seedAntibody(db, "json-syntax-corruption", "org-b", 2);
    const result = correlatePatterns(db, { minScopes: 2 });
    db.close();

    // "json-corruption" should match "json-syntax-corruption" (share 'json' + 'corruption')
    const match = findMatchingHotspot("json-corruption", result.hotspots, 0.3);
    expect(match).not.toBeNull();
    expect(match?.canonicalType).toBe("json-syntax-corruption");
  });

  it("returns null when no variant is similar enough", () => {
    const db = createTestDb();
    seedAntibody(db, "import-guard", "org-a");
    seedAntibody(db, "import-guard", "org-b");
    const result = correlatePatterns(db, { minScopes: 2 });
    db.close();

    const match = findMatchingHotspot("json-truncation", result.hotspots, 0.5);
    expect(match).toBeNull();
  });
});
