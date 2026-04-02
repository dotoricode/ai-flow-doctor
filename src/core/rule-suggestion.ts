/**
 * Rule Suggestion Engine — analyzes mistake_history to recommend
 * auto-validator generation for frequently recurring failure patterns.
 *
 * Query strategy: aggregate by (file_path, mistake_type), rank by frequency,
 * filter out patterns already covered by existing validators.
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { Database } from "bun:sqlite";
import { VALIDATORS_DIR } from "../daemon/types";

// ── Types ───────────────────────────────────────────────────────────────────

export interface RuleSuggestion {
  /** Target file path (workspace-relative) */
  filePath: string;
  /** Mistake category (English enum) */
  mistakeType: string;
  /** Number of occurrences in the analysis window */
  frequency: number;
  /** Most recent occurrence timestamp (epoch ms) */
  lastSeen: number;
  /** Representative description from the most recent event */
  description: string;
  /** Whether an existing validator already covers this file */
  alreadyCovered: boolean;
}

export interface SuggestionOptions {
  /** Analysis window in days (default: 30) */
  days?: number;
  /** Minimum frequency to trigger a suggestion (default: 3) */
  minFrequency?: number;
  /** Maximum number of suggestions to return (default: 10) */
  limit?: number;
}

// ── Core query ──────────────────────────────────────────────────────────────

/**
 * Aggregate mistake_history and produce ranked suggestions.
 */
export function suggestRules(db: Database, opts: SuggestionOptions = {}): RuleSuggestion[] {
  const days = opts.days ?? 30;
  const minFreq = opts.minFrequency ?? 3;
  const limit = opts.limit ?? 10;

  const cutoffMs = Date.now() - days * 86_400_000;

  // Single query: group by (file_path, mistake_type), count, get latest
  const rows = db.prepare(`
    SELECT
      file_path,
      mistake_type,
      COUNT(*) AS frequency,
      MAX(timestamp) AS last_seen,
      -- Get the description from the most recent entry
      (SELECT description FROM mistake_history m2
       WHERE m2.file_path = m1.file_path AND m2.mistake_type = m1.mistake_type
       ORDER BY m2.timestamp DESC LIMIT 1) AS description
    FROM mistake_history m1
    WHERE timestamp >= ?
    GROUP BY file_path, mistake_type
    HAVING COUNT(*) >= ?
    ORDER BY frequency DESC, last_seen DESC
    LIMIT ?
  `).all(cutoffMs, minFreq, limit) as {
    file_path: string;
    mistake_type: string;
    frequency: number;
    last_seen: number;
    description: string;
  }[];

  const coveredFiles = getExistingValidatorTargets();

  return rows.map(row => ({
    filePath: row.file_path,
    mistakeType: row.mistake_type,
    frequency: row.frequency,
    lastSeen: row.last_seen,
    description: row.description,
    alreadyCovered: coveredFiles.has(row.file_path),
  }));
}

// ── Validator coverage detection ────────────────────────────────────────────

/**
 * Scan existing `.afd/validators/*.js` files and extract the file targets
 * they protect (by parsing the `endsWith("...")` pattern in the source).
 */
function getExistingValidatorTargets(): Set<string> {
  const targets = new Set<string>();
  const dir = VALIDATORS_DIR;
  if (!existsSync(dir)) return targets;

  let files: string[];
  try { files = readdirSync(dir).filter(f => f.endsWith(".js")); } catch { return targets; }

  for (const file of files) {
    try {
      const code = readFileSync(join(dir, file), "utf-8");
      // Extract endsWith("...") targets from generated validators
      const matches = code.matchAll(/endsWith\(["']([^"']+)["']\)/g);
      for (const m of matches) {
        targets.add(m[1]);
      }
    } catch {
      // skip unreadable files
    }
  }
  return targets;
}

/**
 * Check if a specific file path is already covered by a validator.
 */
export function isFileCovered(filePath: string, coveredTargets?: Set<string>): boolean {
  const targets = coveredTargets ?? getExistingValidatorTargets();
  for (const target of targets) {
    if (filePath.endsWith(target)) return true;
  }
  return false;
}
