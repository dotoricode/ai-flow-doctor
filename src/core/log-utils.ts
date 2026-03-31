/**
 * Logging utilities for the afd daemon.
 * Extracted for testability and reuse.
 */

/** Format current time as HH:MM:SS.mmm */
export function formatTimestamp(date: Date = new Date()): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

/**
 * Build a concise line-diff between old and new content.
 * Returns at most `maxLines` diff entries (default 10).
 */
export function lineDiff(oldText: string, newText: string, maxLines = 10): string[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const diffs: string[] = [];
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (oldLines[i] !== newLines[i]) {
      const ln = i + 1;
      if (i < oldLines.length && i < newLines.length) {
        diffs.push(`  L${ln}: "${oldLines[i].trimEnd()}" → "${newLines[i].trimEnd()}"`);
      } else if (i < oldLines.length) {
        diffs.push(`  L${ln}: - "${oldLines[i].trimEnd()}"`);
      } else {
        diffs.push(`  L${ln}: + "${newLines[i]!.trimEnd()}"`);
      }
    }
    if (diffs.length >= maxLines) { diffs.push("  ... (truncated)"); break; }
  }
  return diffs;
}
