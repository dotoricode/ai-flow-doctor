/**
 * afd suggest — Rule Suggestion Engine CLI
 *
 * Analyzes mistake_history to recommend auto-validator generation
 * for frequently recurring failure patterns.
 */

import { suggestRules } from "../core/rule-suggestion";
import { correlatePatterns, findMatchingHotspot } from "../core/correlation-engine";
import { generateValidator } from "../core/validator-generator";
import type { ValidatorGenInput } from "../core/validator-generator";
import { initDb } from "../core/db";
import { getSystemLanguage } from "../core/locale";
import { existsSync, readFileSync } from "fs";

interface SuggestOptions {
  days?: string;
  min?: string;
  apply?: boolean;
  /** Annotate suggestions matching cross-project hotspots as "Community Verified" */
  cross?: boolean;
}

const msgs = {
  en: {
    title: "afd suggest — Rule Suggestion Engine",
    noData: "No recurring patterns found. Keep working — the engine learns from mistakes over time.",
    header: "Recommended validators based on failure history:",
    frequency: "occurrences",
    lastSeen: "last seen",
    covered: "already covered",
    uncovered: "no validator",
    applyTitle: "Auto-generating validators for uncovered patterns...",
    applyDone: (n: number) => `${n} validator(s) generated. Daemon will hot-reload automatically.`,
    applySkipped: (n: number) => `${n} pattern(s) already covered — skipped.`,
    hint: "Run `afd suggest --apply` to auto-generate validators for uncovered patterns.",
    daysLabel: "Analysis window",
    minLabel: "Minimum frequency",
    communityVerified: "Community Verified",
    crossHint: "🌐 = Community Verified (pattern seen in multiple projects). Run `afd correlate` for details.",
  },
  ko: {
    title: "afd suggest — 규칙 추천 엔진",
    noData: "반복 패턴을 찾지 못했습니다. 작업을 계속하세요 — 엔진이 시간이 지나면 실수에서 학습합니다.",
    header: "실패 이력 기반 추천 검증기:",
    frequency: "회 발생",
    lastSeen: "최근",
    covered: "이미 보호됨",
    uncovered: "검증기 없음",
    applyTitle: "미보호 패턴에 대해 검증기 자동 생성 중...",
    applyDone: (n: number) => `${n}개 검증기 생성 완료. 데몬이 자동으로 핫 리로드합니다.`,
    applySkipped: (n: number) => `${n}개 패턴은 이미 보호됨 — 건너뜀.`,
    hint: "`afd suggest --apply`를 실행하여 미보호 패턴의 검증기를 자동 생성하세요.",
    daysLabel: "분석 기간",
    minLabel: "최소 빈도",
    communityVerified: "커뮤니티 검증됨",
    crossHint: "🌐 = 커뮤니티 검증됨 (여러 프로젝트에서 발견된 패턴). 자세히: `afd correlate`",
  },
};

const BOX = { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│", ml: "├", mr: "┤" };
const W = 62;

function hline(l: string, r: string) { return `${l}${BOX.h.repeat(W)}${r}`; }
function row(s: string) {
  // Simple padding — doesn't account for wide chars but good enough for ASCII
  const pad = Math.max(0, W - 2 - s.length);
  return `${BOX.v} ${s}${" ".repeat(pad)} ${BOX.v}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function suggestCommand(opts: SuggestOptions = {}) {
  const lang = getSystemLanguage();
  const m = msgs[lang];

  const days = parseInt(opts.days ?? "30", 10) || 30;
  const minFreq = parseInt(opts.min ?? "3", 10) || 3;

  const db = initDb();
  try {
    const suggestions = suggestRules(db, { days, minFrequency: minFreq, limit: 10 });

    // Cross-project correlation: load hotspots once if --cross is set
    const hotspots = opts.cross ? correlatePatterns(db, { minScopes: 2, limit: 50 }).hotspots : [];

    if (suggestions.length === 0) {
      console.log(`[afd suggest] ${m.noData}`);
      return;
    }

    // ── Apply mode: generate validators for uncovered patterns ──
    if (opts.apply) {
      const uncovered = suggestions.filter(s => !s.alreadyCovered);
      const covered = suggestions.filter(s => s.alreadyCovered);

      if (uncovered.length === 0) {
        console.log(`[afd suggest] ${m.applySkipped(covered.length)}`);
        return;
      }

      console.log(`[afd suggest] ${m.applyTitle}`);

      let generated = 0;
      for (const s of uncovered) {
        // Build a ValidatorGenInput from the suggestion
        const input = buildGenInput(s);
        if (!input) continue;
        const result = generateValidator(input);
        if (result.written) {
          console.log(`  ✅ ${result.filename}`);
          generated++;
        }
      }

      console.log(`[afd suggest] ${m.applyDone(generated)}`);
      if (covered.length > 0) {
        console.log(`[afd suggest] ${m.applySkipped(covered.length)}`);
      }
      return;
    }

    // ── Display mode: show ranked suggestions ──
    console.log("");
    console.log(hline(BOX.tl, BOX.tr));
    console.log(row(`🔍 ${m.title}`));
    console.log(hline(BOX.ml, BOX.mr));
    console.log(row(`${m.daysLabel}: ${days}d | ${m.minLabel}: ${minFreq}`));
    console.log(hline(BOX.ml, BOX.mr));

    let hasCrossAnnotation = false;
    for (let i = 0; i < suggestions.length; i++) {
      const s = suggestions[i];
      const statusIcon = s.alreadyCovered ? "🛡️" : "⚠️";
      const statusText = s.alreadyCovered ? m.covered : m.uncovered;
      const rank = `#${i + 1}`;

      // Cross-project annotation
      const matchedHotspot = hotspots.length > 0 ? findMatchingHotspot(s.mistakeType, hotspots) : null;
      const crossBadge = matchedHotspot ? ` 🌐` : "";
      if (matchedHotspot) hasCrossAnnotation = true;

      console.log(row(`${rank} ${statusIcon} ${s.filePath}${crossBadge}`));
      console.log(row(`   ${s.mistakeType} — ${s.frequency} ${m.frequency}`));
      if (matchedHotspot) {
        console.log(row(`   🌐 ${m.communityVerified} (${matchedHotspot.scopeCount} projects)`));
      }
      console.log(row(`   ${m.lastSeen}: ${formatDate(s.lastSeen)} | ${statusText}`));

      // Truncate description
      const maxDesc = W - 8;
      const desc = s.description.length > maxDesc ? s.description.slice(0, maxDesc - 3) + "..." : s.description;
      console.log(row(`   ${desc}`));

      if (i < suggestions.length - 1) {
        console.log(row(""));
      }
    }

    const uncoveredCount = suggestions.filter(s => !s.alreadyCovered).length;
    if (uncoveredCount > 0 || hasCrossAnnotation) {
      console.log(hline(BOX.ml, BOX.mr));
      if (uncoveredCount > 0) console.log(row(`💡 ${m.hint}`));
      if (hasCrossAnnotation) console.log(row(`💡 ${m.crossHint}`));
    }
    console.log(hline(BOX.bl, BOX.br));
  } finally {
    db.close();
  }
}

/**
 * Build a ValidatorGenInput from a suggestion.
 * Uses the mistake_type to infer the failure type and creates a synthetic input
 * so the validator-generator can produce the correct template.
 */
function buildGenInput(s: { filePath: string; mistakeType: string; description: string }): ValidatorGenInput | null {
  const filePath = s.filePath;

  // Map mistake_type to failureType + synthetic content
  if (s.mistakeType.includes("deletion") || s.mistakeType.includes("delete")) {
    return { failureType: "deletion", originalPath: filePath, corruptedContent: "DELETED", restoredContent: readFileSafe(filePath) };
  }

  if (s.mistakeType.includes("empty") || s.mistakeType.includes("blank")) {
    return { failureType: "corruption", originalPath: filePath, corruptedContent: "", restoredContent: readFileSafe(filePath) };
  }

  if (s.mistakeType.includes("truncat")) {
    // Simulate severe truncation
    const restored = readFileSafe(filePath);
    return { failureType: "corruption", originalPath: filePath, corruptedContent: "x", restoredContent: restored };
  }

  if (s.mistakeType.includes("json") || s.mistakeType.includes("syntax")) {
    return { failureType: "corruption", originalPath: filePath, corruptedContent: "{invalid", restoredContent: readFileSafe(filePath) };
  }

  // Generic corruption
  return { failureType: "corruption", originalPath: filePath, corruptedContent: "corrupted", restoredContent: readFileSafe(filePath) };
}

function readFileSafe(path: string): string | null {
  try {
    if (existsSync(path)) return readFileSync(path, "utf-8");
  } catch { /* ignore */ }
  return null;
}
