/**
 * afd evolution — Self-Evolution command
 *
 * Analyzes quarantined files, generates failure lessons,
 * and writes them to afd-lessons.md for AI agent learning.
 */

import { evolve, analyzeQuarantine, listQuarantine } from "../core/evolution";
import { getSystemLanguage } from "../core/locale";

const msgs = {
  en: {
    title: "afd Self-Evolution Report",
    noQuarantine: "No quarantined files found. Nothing to learn from.",
    noPending: "All quarantined files already learned. No new lessons.",
    analyzing: "Analyzing quarantined failures...",
    written: (n: number) => `${n} new lesson(s) written to afd-lessons.md`,
    total: (n: number) => `Total lessons learned: ${n}`,
    stats: "Quarantine Stats",
    quarantined: "Quarantined",
    learned: "Learned",
    pending: "Pending",
    lessonDetail: "New Lessons",
  },
  ko: {
    title: "afd 자가 진화 리포트",
    noQuarantine: "격리된 파일이 없습니다. 학습할 대상이 없습니다.",
    noPending: "모든 격리 파일이 이미 학습되었습니다. 새로운 교훈이 없습니다.",
    analyzing: "격리된 실패 사례 분석 중...",
    written: (n: number) => `${n}개의 새로운 교훈이 afd-lessons.md에 기록되었습니다`,
    total: (n: number) => `총 학습된 교훈: ${n}개`,
    stats: "격리 통계",
    quarantined: "격리됨",
    learned: "학습 완료",
    pending: "대기 중",
    lessonDetail: "새로운 교훈",
  },
};

const BOX = { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│", ml: "├", mr: "┤" };
const W = 58;

function hline(l: string, r: string) { return `${l}${BOX.h.repeat(W)}${r}`; }
function row(s: string) {
  const pad = Math.max(0, W - 2 - visualWidth(s));
  return `${BOX.v} ${s}${" ".repeat(pad)} ${BOX.v}`;
}
function visualWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if ((cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x2e80 && cp <= 0x9fff) ||
        (cp >= 0xac00 && cp <= 0xd7af) || (cp >= 0xf900 && cp <= 0xfaff) ||
        (cp >= 0x1f000 && cp <= 0x1faff) || (cp >= 0x20000 && cp <= 0x2fa1f)) w += 2;
    else w += 1;
  }
  return w;
}

export async function evolutionCommand() {
  const lang = getSystemLanguage();
  const m = msgs[lang];

  const entries = listQuarantine();
  if (entries.length === 0) {
    console.log(m.noQuarantine);
    return;
  }

  const stats = analyzeQuarantine();
  if (stats.pending === 0) {
    console.log(m.noPending);
    return;
  }

  console.log(m.analyzing);
  const result = evolve();

  console.log("");
  console.log(hline(BOX.tl, BOX.tr));
  console.log(row(`🧬 ${m.title}`));
  console.log(hline(BOX.ml, BOX.mr));
  console.log(row(`${m.stats}`));
  console.log(row(`  ${m.quarantined}  : ${stats.totalQuarantined}`));
  console.log(row(`  ${m.learned}  : ${result.totalLessons}`));
  console.log(row(`  ${m.pending}  : 0`));
  console.log(hline(BOX.ml, BOX.mr));
  console.log(row(`${m.lessonDetail}`));
  console.log(row(BOX.h.repeat(W - 4)));

  for (const lesson of stats.lessons) {
    const icon = lesson.failureType === "deletion" ? "🗑️" : "💥";
    const file = lesson.entry.originalPath;
    console.log(row(`${icon} ${file}`));
    // Truncate suggestion to fit box
    const maxSug = W - 8;
    const sug = lesson.suggestion.length > maxSug
      ? lesson.suggestion.slice(0, maxSug - 3) + "..."
      : lesson.suggestion;
    console.log(row(`   ${sug}`));
  }

  console.log(hline(BOX.ml, BOX.mr));
  console.log(row(m.written(result.lessonsWritten)));
  console.log(row(m.total(result.totalLessons)));
  console.log(hline(BOX.bl, BOX.br));
}
