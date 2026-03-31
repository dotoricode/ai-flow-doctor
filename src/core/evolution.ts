/**
 * Self-Evolution Engine
 *
 * Analyzes quarantined (corrupted) files against their restored originals,
 * generates failure lessons, and writes them to afd-lessons.md so AI agents
 * learn from their own mistakes.
 */

import { readdirSync, readFileSync, writeFileSync, renameSync, existsSync } from "fs";
import { resolve, basename } from "path";
import { QUARANTINE_DIR } from "../constants";
import { lineDiff } from "./log-utils";

const LESSONS_FILE = "afd-lessons.md";
const LEARNED_SUFFIX = ".learned";

export interface QuarantineEntry {
  /** Full path inside .afd/quarantine/ */
  quarantinePath: string;
  /** Original file path (reconstructed from quarantine filename) */
  originalPath: string;
  /** Timestamp string extracted from filename */
  timestamp: string;
  /** Whether this entry has already been learned */
  learned: boolean;
}

export interface EvolutionLesson {
  entry: QuarantineEntry;
  diff: string[];
  corruptedContent: string;
  restoredContent: string | null;
  failureType: "corruption" | "deletion";
  suggestion: string;
}

export interface EvolutionStats {
  totalQuarantined: number;
  totalLearned: number;
  pending: number;
  lessons: EvolutionLesson[];
}

/** Parse quarantine filename: YYYYMMDD_HHMMSS_originalname → { timestamp, originalPath } */
function parseQuarantineName(filename: string): { timestamp: string; originalPath: string } | null {
  // e.g. 20260401_021028_.claude_hooks.json or 20260401_020741_.claudeignore
  const match = filename.replace(LEARNED_SUFFIX, "").match(/^(\d{8}_\d{6})_(.+)$/);
  if (!match) return null;
  const ts = match[1];
  // Reconstruct path: underscores that were separators become path separators
  // Heuristic: first underscore-delimited segment starting with "." is likely a directory
  const rawName = match[2];
  // Reverse the flatten: `.claude_hooks.json` → `.claude/hooks.json`
  const originalPath = rawName.replace(/^\.([^.]+)_/, ".$1/");
  return { timestamp: ts, originalPath };
}

/** List all quarantined entries */
export function listQuarantine(): QuarantineEntry[] {
  if (!existsSync(QUARANTINE_DIR)) return [];
  const files = readdirSync(QUARANTINE_DIR);
  const entries: QuarantineEntry[] = [];

  for (const file of files) {
    const isLearned = file.endsWith(LEARNED_SUFFIX);
    const cleanName = file.replace(LEARNED_SUFFIX, "");
    const parsed = parseQuarantineName(cleanName);
    if (!parsed) continue;
    entries.push({
      quarantinePath: resolve(QUARANTINE_DIR, file),
      originalPath: parsed.originalPath,
      timestamp: parsed.timestamp,
      learned: isLearned,
    });
  }

  return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/** Detect what type of corruption occurred */
function detectFailureType(content: string): "corruption" | "deletion" {
  return content.trim() === "DELETED" ? "deletion" : "corruption";
}

/** Generate a human-readable suggestion based on the failure */
function generateSuggestion(entry: QuarantineEntry, failureType: string, corruptedContent: string, restoredContent: string | null): string {
  const file = entry.originalPath;

  if (failureType === "deletion") {
    return `Do NOT delete \`${file}\`. This is an immune-critical file protected by afd. ` +
      `If you need to modify it, edit the content instead of removing the file.`;
  }

  // Corruption analysis
  if (file.endsWith(".json")) {
    try {
      JSON.parse(corruptedContent);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return `When editing \`${file}\`, ensure valid JSON syntax. ` +
        `Common mistake: ${msg}. Always validate JSON structure after editing.`;
    }
  }

  if (corruptedContent.trim().length === 0) {
    return `Do NOT empty \`${file}\`. The file was overwritten with blank content. ` +
      `Preserve existing content when making changes.`;
  }

  if (restoredContent && corruptedContent.length < restoredContent.length * 0.1) {
    return `Do NOT truncate \`${file}\`. Content was reduced by >90%. ` +
      `When editing, preserve the existing structure and only modify specific sections.`;
  }

  return `When editing \`${file}\`, be careful not to corrupt its structure. ` +
    `Always verify the file is still valid after changes.`;
}

/** Analyze pending (unlearned) quarantine entries and produce lessons */
export function analyzeQuarantine(): EvolutionStats {
  const entries = listQuarantine();
  const totalQuarantined = entries.length;
  const totalLearned = entries.filter(e => e.learned).length;
  const pending = entries.filter(e => !e.learned);

  const lessons: EvolutionLesson[] = [];

  for (const entry of pending) {
    const corruptedContent = readFileSync(entry.quarantinePath, "utf-8");
    const failureType = detectFailureType(corruptedContent);

    let restoredContent: string | null = null;
    let diff: string[] = [];

    if (existsSync(entry.originalPath)) {
      restoredContent = readFileSync(entry.originalPath, "utf-8");
      if (failureType === "corruption") {
        diff = lineDiff(corruptedContent, restoredContent, 20);
      } else {
        diff = [`  (file was deleted — restored from antibody snapshot)`];
      }
    } else {
      diff = [`  (original file not found — may still be deleted)`];
    }

    const suggestion = generateSuggestion(entry, failureType, corruptedContent, restoredContent);

    lessons.push({ entry, diff, corruptedContent, restoredContent, failureType, suggestion });
  }

  return { totalQuarantined, totalLearned, pending: pending.length, lessons };
}

/** Mark a quarantine entry as learned by renaming with .learned suffix */
export function markLearned(entry: QuarantineEntry): void {
  if (entry.learned) return;
  const newPath = entry.quarantinePath + LEARNED_SUFFIX;
  renameSync(entry.quarantinePath, newPath);
}

/** Build the lesson block for afd-lessons.md */
function buildLessonBlock(lesson: EvolutionLesson): string {
  const ts = lesson.entry.timestamp.replace("_", "T");
  const formattedTs = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)} ${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}`;
  const lines: string[] = [
    `### ${lesson.entry.originalPath} (${formattedTs})`,
    `- **Type**: ${lesson.failureType === "deletion" ? "Unauthorized Deletion" : "Content Corruption"}`,
    `- **Rule**: ${lesson.suggestion}`,
  ];
  if (lesson.diff.length > 0) {
    lines.push(`- **Diff**:`);
    lines.push("```");
    lines.push(...lesson.diff);
    lines.push("```");
  }
  return lines.join("\n");
}

/**
 * Write lessons to afd-lessons.md and mark entries as learned.
 * Returns the number of new lessons written.
 */
export function evolve(): { lessonsWritten: number; totalLessons: number } {
  const stats = analyzeQuarantine();
  if (stats.lessons.length === 0) {
    return { lessonsWritten: 0, totalLessons: stats.totalLearned };
  }

  // Build new lesson blocks
  const newBlocks = stats.lessons.map(buildLessonBlock);

  // Read or initialize afd-lessons.md
  let existing = "";
  if (existsSync(LESSONS_FILE)) {
    existing = readFileSync(LESSONS_FILE, "utf-8");
  }

  if (!existing.includes("# Failure Lessons")) {
    existing = `# Failure Lessons\n\n` +
      `> Auto-generated by afd Self-Evolution engine.\n` +
      `> AI agents: read these rules to avoid repeating past mistakes.\n\n` +
      existing;
  }

  // Append new lessons
  const updated = existing.trimEnd() + "\n\n" + newBlocks.join("\n\n") + "\n";
  writeFileSync(LESSONS_FILE, updated, "utf-8");

  // Mark all analyzed entries as learned
  for (const lesson of stats.lessons) {
    markLearned(lesson.entry);
  }

  return { lessonsWritten: stats.lessons.length, totalLessons: stats.totalLearned + stats.lessons.length };
}
