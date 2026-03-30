/**
 * Suppression Safety E2E Tests
 *
 * Validates the "Reflexive Suppression" (Autoimmune Disease prevention) heuristics:
 *   1. Accidental Delete (Single tap) → Auto-heals the file
 *   2. Intentional Delete (Double-tap within 60s) → Sets antibody dormant, stops healing
 *   3. Mass Delete (>3 unlinks in 1s) → Suppression logic entirely skipped
 *
 * Uses Bun's built-in SQLite and test runner — no external dependencies.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  mkdirSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  rmSync,
  readFileSync,
} from "fs";
import { join, resolve } from "path";

// ── Constants (mirroring src/daemon/server.ts) ──
const DOUBLE_TAP_WINDOW_MS = 60_000;
const MASS_EVENT_THRESHOLD = 3;
const MASS_EVENT_WINDOW_MS = 1_000;

// ── Minimal in-process daemon simulation ──
// We replicate the core suppression logic without spawning an actual HTTP daemon,
// so the tests are fast, deterministic, and require no port binding.

interface PatchOp {
  op: "add" | "remove" | "replace";
  path: string;
  value?: string;
}

interface SuppressionEngine {
  db: Database;
  recentUnlinks: number[];
  firstTapTimestamps: Map<string, number>;
  healCount: number;
  dormantTransitions: { antibodyId: string; at: number }[];
  suppressionSkippedCount: number;
  handleUnlink(filePath: string, now: number): "healed" | "dormant" | "skipped" | "no-antibody";
}

function createEngine(tmpDir: string): SuppressionEngine {
  const db = new Database(":memory:");

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

  db.exec(`
    CREATE TABLE IF NOT EXISTS unlink_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `);

  const insertUnlinkLog = db.prepare("INSERT INTO unlink_log (file_path, timestamp) VALUES (?, ?)");
  const findAntibodyByFile = db.prepare("SELECT id, dormant FROM antibodies WHERE file_target = ? AND dormant = 0");
  const getFullAntibody = db.prepare("SELECT * FROM antibodies WHERE id = ?");
  const setDormant = db.prepare("UPDATE antibodies SET dormant = 1 WHERE id = ?");

  const engine: SuppressionEngine = {
    db,
    recentUnlinks: [],
    firstTapTimestamps: new Map(),
    healCount: 0,
    dormantTransitions: [],
    suppressionSkippedCount: 0,

    handleUnlink(filePath: string, now: number) {
      engine.recentUnlinks.push(now);
      insertUnlinkLog.run(filePath, now);

      // Mass-event check
      engine.recentUnlinks = engine.recentUnlinks.filter(t => now - t < MASS_EVENT_WINDOW_MS);
      if (engine.recentUnlinks.length > MASS_EVENT_THRESHOLD) {
        engine.suppressionSkippedCount++;
        // Clear first-tap timestamps: bulk ops are not intentional user deletes
        engine.firstTapTimestamps.clear();
        return "skipped";
      }

      // Find active antibody
      const antibody = findAntibodyByFile.get(filePath) as { id: string; dormant: number } | null;
      if (!antibody) return "no-antibody";

      const fullAntibody = getFullAntibody.get(antibody.id) as {
        id: string; patch_op: string; file_target: string;
      } | null;
      if (!fullAntibody) return "no-antibody";

      // Double-tap detection
      const previousTap = engine.firstTapTimestamps.get(filePath);

      if (previousTap && (now - previousTap) < DOUBLE_TAP_WINDOW_MS) {
        // Second tap → dormant
        setDormant.run(antibody.id);
        engine.firstTapTimestamps.delete(filePath);
        engine.dormantTransitions.push({ antibodyId: antibody.id, at: now });
        return "dormant";
      }

      // First tap → heal
      engine.firstTapTimestamps.set(filePath, now);
      // Simulate healing: re-create the file
      try {
        const patches = JSON.parse(fullAntibody.patch_op) as PatchOp[];
        for (const patch of patches) {
          if (patch.op === "add" && patch.value) {
            const targetPath = resolve(tmpDir, patch.path.replace(/^\//, ""));
            writeFileSync(targetPath, patch.value, "utf-8");
          }
        }
      } catch {
        // Crash-only
      }
      engine.healCount++;
      return "healed";
    },
  };

  return engine;
}

function seedAntibody(db: Database, id: string, fileTarget: string, content: string) {
  const patches: PatchOp[] = [{ op: "add", path: `/${fileTarget}`, value: content }];
  db.prepare(
    "INSERT OR REPLACE INTO antibodies (id, pattern_type, file_target, patch_op) VALUES (?, ?, ?, ?)"
  ).run(id, "missing-file", fileTarget, JSON.stringify(patches));
}

// ── Test Suite ──

const TMP_BASE = resolve(".afd-test-tmp");

let tmpDir: string;
let engine: SuppressionEngine;

beforeEach(() => {
  tmpDir = join(TMP_BASE, `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(tmpDir, { recursive: true });
  engine = createEngine(tmpDir);
});

afterEach(() => {
  engine.db.close();
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  try { rmSync(TMP_BASE, { recursive: true, force: true }); } catch {}
});

describe("Suppression Safety: Double-Tap Heuristic", () => {
  test("Accidental Delete (single tap) → auto-heals the file", () => {
    const fileTarget = ".claudeignore";
    const fileContent = "# test content\nnode_modules/\n";
    seedAntibody(engine.db, "IMM-001", fileTarget, fileContent);

    // Create the file, then simulate deletion
    const filePath = join(tmpDir, fileTarget);
    writeFileSync(filePath, fileContent);
    unlinkSync(filePath);

    const now = Date.now();
    const result = engine.handleUnlink(fileTarget, now);

    expect(result).toBe("healed");
    expect(engine.healCount).toBe(1);

    // Verify the file was recreated by the healing logic
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, "utf-8")).toBe(fileContent);

    // Antibody should still be active (not dormant)
    const ab = engine.db.prepare("SELECT dormant FROM antibodies WHERE id = ?").get("IMM-001") as { dormant: number };
    expect(ab.dormant).toBe(0);
  });

  test("Intentional Delete (double-tap within 60s) → sets antibody dormant", () => {
    const fileTarget = ".claudeignore";
    const fileContent = "# test\n";
    seedAntibody(engine.db, "IMM-001", fileTarget, fileContent);

    const filePath = join(tmpDir, fileTarget);
    writeFileSync(filePath, fileContent);

    // First tap: heals
    const t1 = Date.now();
    const result1 = engine.handleUnlink(fileTarget, t1);
    expect(result1).toBe("healed");
    expect(engine.healCount).toBe(1);

    // Simulate: user deletes the healed file AGAIN within 60s
    // (file was recreated by heal, user deletes it again)
    unlinkSync(filePath);
    const t2 = t1 + 5_000; // 5 seconds later
    const result2 = engine.handleUnlink(fileTarget, t2);
    expect(result2).toBe("dormant");

    // Antibody is now dormant
    const ab = engine.db.prepare("SELECT dormant FROM antibodies WHERE id = ?").get("IMM-001") as { dormant: number };
    expect(ab.dormant).toBe(1);

    // Heal count did NOT increase on the second tap
    expect(engine.healCount).toBe(1);
    expect(engine.dormantTransitions).toHaveLength(1);
    expect(engine.dormantTransitions[0].antibodyId).toBe("IMM-001");
  });

  test("Delete after 60s window → treated as new first tap, not double-tap", () => {
    const fileTarget = "CLAUDE.md";
    const fileContent = "# Constitution\n";
    seedAntibody(engine.db, "IMM-003", fileTarget, fileContent);

    const filePath = join(tmpDir, fileTarget);
    writeFileSync(filePath, fileContent);

    // First tap
    const t1 = Date.now();
    engine.handleUnlink(fileTarget, t1);
    expect(engine.healCount).toBe(1);

    // Second delete AFTER 60s window expires → should heal again, not go dormant
    const t2 = t1 + DOUBLE_TAP_WINDOW_MS + 1_000; // 61 seconds later
    const result2 = engine.handleUnlink(fileTarget, t2);
    expect(result2).toBe("healed");
    expect(engine.healCount).toBe(2);

    // Antibody still active
    const ab = engine.db.prepare("SELECT dormant FROM antibodies WHERE id = ?").get("IMM-003") as { dormant: number };
    expect(ab.dormant).toBe(0);
  });

  test("Dormant antibody no longer triggers healing", () => {
    const fileTarget = ".claudeignore";
    seedAntibody(engine.db, "IMM-001", fileTarget, "# content\n");

    // Force dormant
    engine.db.prepare("UPDATE antibodies SET dormant = 1 WHERE id = ?").run("IMM-001");

    const now = Date.now();
    const result = engine.handleUnlink(fileTarget, now);
    expect(result).toBe("no-antibody"); // Dormant → invisible to suppression
    expect(engine.healCount).toBe(0);
  });
});

describe("Suppression Safety: Mass-Event Awareness", () => {
  test("Mass delete (>3 unlinks in 1s) → suppression logic entirely skipped", () => {
    // Seed antibodies for multiple files
    const files = [".claudeignore", "CLAUDE.md", ".cursorrules", ".claude/hooks.json"];
    files.forEach((f, i) => {
      seedAntibody(engine.db, `IMM-${String(i + 1).padStart(3, "0")}`, f, `# content ${i}\n`);
    });

    const now = Date.now();

    // Simulate rapid-fire unlinks (e.g., git checkout)
    const results = files.map((f, i) => engine.handleUnlink(f, now + i));

    // First 3 may heal (threshold is >3), but the 4th+ should be skipped
    // Actually: after the 4th unlink, recentUnlinks has 4 entries within 1s → >3 → skipped
    expect(results[3]).toBe("skipped");
    expect(engine.suppressionSkippedCount).toBeGreaterThanOrEqual(1);
  });

  test("Unlinks spread over >1s do NOT trigger mass-event", () => {
    seedAntibody(engine.db, "IMM-001", ".claudeignore", "# content\n");
    seedAntibody(engine.db, "IMM-003", "CLAUDE.md", "# content\n");

    const now = Date.now();

    // Two unlinks 1.5s apart — should NOT trigger mass detection
    const r1 = engine.handleUnlink(".claudeignore", now);
    const r2 = engine.handleUnlink("CLAUDE.md", now + 1_500);

    expect(r1).toBe("healed");
    expect(r2).toBe("healed");
    expect(engine.suppressionSkippedCount).toBe(0);
  });

  test("Mass event followed by single delete after cooldown → heals normally", () => {
    const files = [".claudeignore", "CLAUDE.md", ".cursorrules", ".claude/hooks.json"];
    files.forEach((f, i) => {
      seedAntibody(engine.db, `IMM-${String(i + 1).padStart(3, "0")}`, f, `# content ${i}\n`);
    });

    const now = Date.now();

    // Trigger mass event
    files.forEach((f, i) => engine.handleUnlink(f, now + i));
    expect(engine.suppressionSkippedCount).toBeGreaterThanOrEqual(1);

    // After 2 seconds, a single delete should heal normally
    const laterResult = engine.handleUnlink(".claudeignore", now + 2_000);
    expect(laterResult).toBe("healed");
  });
});

describe("Suppression Safety: Combined Scenarios", () => {
  test("Full lifecycle: heal → dormant → re-learn → heal again", () => {
    const fileTarget = ".claudeignore";
    const content = "# v1\n";
    seedAntibody(engine.db, "IMM-001", fileTarget, content);

    const filePath = join(tmpDir, fileTarget);
    writeFileSync(filePath, content);

    // First tap → heals
    const t1 = Date.now();
    expect(engine.handleUnlink(fileTarget, t1)).toBe("healed");

    // Second tap → dormant
    unlinkSync(filePath);
    const t2 = t1 + 5_000;
    expect(engine.handleUnlink(fileTarget, t2)).toBe("dormant");

    // Re-learn the antibody (user runs `afd fix` again)
    const newContent = "# v2\n";
    engine.db.prepare(
      "INSERT OR REPLACE INTO antibodies (id, pattern_type, file_target, patch_op, dormant) VALUES (?, ?, ?, ?, 0)"
    ).run("IMM-001", "missing-file", fileTarget, JSON.stringify([{ op: "add", path: `/${fileTarget}`, value: newContent }]));

    // New first tap → heals with new content
    const t3 = t2 + DOUBLE_TAP_WINDOW_MS + 1_000;
    expect(engine.handleUnlink(fileTarget, t3)).toBe("healed");
    expect(readFileSync(filePath, "utf-8")).toBe(newContent);
  });

  test("Unlink log records all events in DB", () => {
    seedAntibody(engine.db, "IMM-001", ".claudeignore", "# c\n");

    const now = Date.now();
    engine.handleUnlink(".claudeignore", now);
    engine.handleUnlink(".claudeignore", now + 10_000);

    const rows = engine.db.prepare("SELECT * FROM unlink_log ORDER BY timestamp").all() as { file_path: string; timestamp: number }[];
    expect(rows).toHaveLength(2);
    expect(rows[0].file_path).toBe(".claudeignore");
    expect(rows[1].timestamp).toBe(now + 10_000);
  });
});
