/**
 * Smart Discovery — scans project root for AI-agent config patterns.
 *
 * Runs ONCE at startup. O(n) existsSync calls on a known candidate list.
 * No directory traversal, no glob — just fast stat checks (< 5ms).
 */

import { existsSync } from "fs";

/** All known AI-agent config patterns to probe. */
const DISCOVERY_CANDIDATES = [
  // Claude Code ecosystem
  ".claude/",
  "CLAUDE.md",
  ".claudeignore",
  // Cursor ecosystem
  ".cursorrules",
  ".cursorignore",
  // Git essentials
  ".gitignore",
  // MCP configs
  "mcp-config.json",
  ".mcp.json",
  // Generic AI config directories
  ".ai/",
  // Custom rules (various tools)
  ".customrules",
  ".windsurfrules",
  // Copilot
  ".github/copilot-instructions.md",
] as const;

export interface DiscoveryResult {
  /** All targets that exist on disk (merged with defaults, deduplicated). */
  targets: string[];
  /** How many were found via smart discovery (beyond the hardcoded defaults). */
  discoveredCount: number;
  /** Elapsed time in ms. */
  elapsedMs: number;
}

/**
 * Discover AI-context files in the project root.
 * Merges found targets with the provided defaults, deduplicates, and returns.
 */
export function discoverWatchTargets(defaults: readonly string[]): DiscoveryResult {
  const t0 = performance.now();
  const seen = new Set<string>(defaults);
  let discoveredCount = 0;

  for (const candidate of DISCOVERY_CANDIDATES) {
    if (seen.has(candidate)) continue;
    if (existsSync(candidate)) {
      seen.add(candidate);
      discoveredCount++;
    }
  }

  const elapsedMs = Math.round((performance.now() - t0) * 100) / 100;
  return {
    targets: [...seen],
    discoveredCount,
    elapsedMs,
  };
}
