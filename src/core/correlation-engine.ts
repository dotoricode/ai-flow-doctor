/**
 * Cross-Project Pattern Correlation Engine (v1.7)
 *
 * Aggregates antibodies across multiple scopes (federated projects) to surface
 * "Global Hotspot" patterns — mistake types that recur in 2+ distinct projects.
 *
 * Algorithm:
 *   1. Query antibodies grouped by (pattern_type, scope)
 *   2. Tokenize each pattern_type (lowercase, split on separators, remove stop words)
 *   3. Cluster variants with Jaccard similarity ≥ threshold (greedy, representative-based)
 *   4. For each cluster, aggregate distinct scopes + total occurrences
 *   5. Return clusters with scopeCount ≥ minScopes, ranked by scopeCount DESC
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { Database } from "bun:sqlite";
import { VALIDATORS_DIR } from "../daemon/types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface GlobalHotspot {
  /** Most prevalent pattern_type in this cluster */
  canonicalType: string;
  /** All pattern_type variants grouped in this cluster */
  variants: string[];
  /** Number of distinct project scopes this appeared in */
  scopeCount: number;
  /** Names of the scopes */
  scopes: string[];
  /** Total antibody occurrences across all scopes */
  totalOccurrences: number;
  /** Whether a local validator already covers this pattern */
  alreadyCovered: boolean;
  /**
   * Cluster coherence: average pairwise Jaccard similarity of variants.
   * Range 0–1 (1 = all variants are identical).
   */
  confidence: number;
}

export interface CorrelationOptions {
  /** Minimum distinct scopes to qualify as a global hotspot (default: 2) */
  minScopes?: number;
  /** Jaccard similarity threshold for grouping variant pattern_types (default: 0.4) */
  similarityThreshold?: number;
  /** Maximum number of hotspots to return (default: 10) */
  limit?: number;
  /** Include antibodies with scope = "local" in the analysis (default: false) */
  includeLocal?: boolean;
}

export interface CorrelationResult {
  hotspots: GlobalHotspot[];
  /** Total distinct scopes seen in the dataset */
  totalScopes: number;
  analysisWindow: {
    scopes: string[];
    antibodyCount: number;
  };
}

// ── Tokenization & similarity ────────────────────────────────────────────────

/**
 * Low-signal words that are stripped before similarity comparison.
 * Keeping these would artificially inflate similarity between unrelated patterns.
 */
const STOP_TOKENS = new Set([
  "error", "issue", "guard", "check", "prevent", "detect", "pattern",
  "file", "content", "bad", "invalid", "missing",
]);

function tokenize(patternType: string): Set<string> {
  return new Set(
    patternType
      .toLowerCase()
      .split(/[-_\s/]+/)
      .filter(t => t.length >= 3 && !STOP_TOKENS.has(t)),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const t of a) { if (b.has(t)) intersection++; }
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

// ── Core aggregation ─────────────────────────────────────────────────────────

/**
 * Main entry point. Returns global hotspot patterns with scope correlation.
 */
export function correlatePatterns(db: Database, opts: CorrelationOptions = {}): CorrelationResult {
  const minScopes = opts.minScopes ?? 2;
  const threshold = opts.similarityThreshold ?? 0.4;
  const limit = opts.limit ?? 10;
  const includeLocal = opts.includeLocal ?? false;

  const whereClause = includeLocal ? "" : "WHERE scope != 'local'";

  const rows = db.prepare(`
    SELECT pattern_type, scope, COUNT(*) AS cnt
    FROM antibodies
    ${whereClause}
    GROUP BY pattern_type, scope
    ORDER BY cnt DESC
  `).all() as { pattern_type: string; scope: string; cnt: number }[];

  if (rows.length === 0) {
    return { hotspots: [], totalScopes: 0, analysisWindow: { scopes: [], antibodyCount: 0 } };
  }

  const allScopes = new Set(rows.map(r => r.scope));
  const totalAntibodies = rows.reduce((sum, r) => sum + r.cnt, 0);

  // Build per-type aggregation map
  const typeMap = new Map<string, { scopes: Set<string>; total: number }>();
  for (const row of rows) {
    let entry = typeMap.get(row.pattern_type);
    if (!entry) {
      entry = { scopes: new Set(), total: 0 };
      typeMap.set(row.pattern_type, entry);
    }
    entry.scopes.add(row.scope);
    entry.total += row.cnt;
  }

  // Pre-compute token sets for each pattern_type
  const tokenCache = new Map<string, Set<string>>();
  for (const pt of typeMap.keys()) {
    tokenCache.set(pt, tokenize(pt));
  }

  // Greedy clustering: assign each type to the first cluster whose representative
  // has Jaccard similarity ≥ threshold, otherwise start a new cluster.
  const clusters: string[][] = [];
  for (const t of typeMap.keys()) {
    let placed = false;
    for (const cluster of clusters) {
      const repTokens = tokenCache.get(cluster[0])!;
      const sim = jaccardSimilarity(tokenCache.get(t)!, repTokens);
      if (sim >= threshold) {
        cluster.push(t);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([t]);
  }

  // Build hotspot from each cluster
  const coveredTargets = getExistingValidatorTargets();
  const hotspots: GlobalHotspot[] = [];

  for (const variants of clusters) {
    // Merge scopes and totals across all variants in the cluster
    const mergedScopes = new Set<string>();
    let total = 0;
    for (const v of variants) {
      const entry = typeMap.get(v)!;
      for (const s of entry.scopes) mergedScopes.add(s);
      total += entry.total;
    }

    if (mergedScopes.size < minScopes) continue;

    // Sort variants by total occurrences descending (canonical = most prevalent)
    variants.sort((a, b) => (typeMap.get(b)?.total ?? 0) - (typeMap.get(a)?.total ?? 0));
    const canonicalType = variants[0];

    // Confidence = average pairwise Jaccard within the cluster
    let confidence = 1;
    if (variants.length > 1) {
      let simSum = 0;
      let pairs = 0;
      for (let i = 0; i < variants.length; i++) {
        for (let j = i + 1; j < variants.length; j++) {
          simSum += jaccardSimilarity(tokenCache.get(variants[i])!, tokenCache.get(variants[j])!);
          pairs++;
        }
      }
      confidence = pairs > 0 ? simSum / pairs : 1;
    }

    // Coverage: any existing validator whose filename tokens overlap with canonicalType tokens
    const canonTokens = tokenCache.get(canonicalType) ?? tokenize(canonicalType);
    const alreadyCovered = [...coveredTargets].some(target => {
      const targetTokens = tokenize(target.replace(/\.(ts|json|md|js)$/, ""));
      return jaccardSimilarity(canonTokens, targetTokens) >= 0.4;
    });

    hotspots.push({
      canonicalType,
      variants,
      scopeCount: mergedScopes.size,
      scopes: [...mergedScopes].sort(),
      totalOccurrences: total,
      alreadyCovered,
      confidence: Math.round(confidence * 100) / 100,
    });
  }

  hotspots.sort((a, b) => b.scopeCount - a.scopeCount || b.totalOccurrences - a.totalOccurrences);

  return {
    hotspots: hotspots.slice(0, limit),
    totalScopes: allScopes.size,
    analysisWindow: { scopes: [...allScopes].sort(), antibodyCount: totalAntibodies },
  };
}

// ── Hotspot lookup for suggest integration ───────────────────────────────────

/**
 * Find a matching GlobalHotspot for a given mistakeType string.
 * Used by `afd suggest --cross` to annotate suggestions as "Community Verified".
 */
export function findMatchingHotspot(
  mistakeType: string,
  hotspots: GlobalHotspot[],
  threshold = 0.35,
): GlobalHotspot | null {
  const tokens = tokenize(mistakeType);
  let best: GlobalHotspot | null = null;
  let bestSim = threshold;

  for (const h of hotspots) {
    for (const v of h.variants) {
      const sim = jaccardSimilarity(tokens, tokenize(v));
      if (sim > bestSim) {
        bestSim = sim;
        best = h;
      }
    }
  }
  return best;
}

// ── Validator coverage helper ────────────────────────────────────────────────

function getExistingValidatorTargets(): Set<string> {
  const targets = new Set<string>();
  if (!existsSync(VALIDATORS_DIR)) return targets;

  let files: string[];
  try {
    files = readdirSync(VALIDATORS_DIR).filter(f => f.endsWith(".js"));
  } catch {
    return targets;
  }

  for (const file of files) {
    try {
      const code = readFileSync(join(VALIDATORS_DIR, file), "utf-8");
      const matches = code.matchAll(/endsWith\(["']([^"']+)["']\)/g);
      for (const m of matches) targets.add(m[1]);
    } catch {
      // skip unreadable files
    }
  }
  return targets;
}
