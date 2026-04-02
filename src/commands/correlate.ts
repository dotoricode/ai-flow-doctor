/**
 * afd correlate — Cross-Project Pattern Correlation CLI
 *
 * Analyzes federated antibodies (scope != 'local') to surface Global Hotspot
 * patterns that recur across 2+ distinct project scopes.
 */

import { correlatePatterns } from "../core/correlation-engine";
import { generateValidator } from "../core/validator-generator";
import type { ValidatorGenInput } from "../core/validator-generator";
import { initDb } from "../core/db";
import { getSystemLanguage } from "../core/locale";

interface CorrelateOptions {
  minScopes?: string;
  apply?: boolean;
  includeLocal?: boolean;
}

const msgs = {
  en: {
    title: "afd correlate — Cross-Project Pattern Correlation",
    noData: "No cross-project patterns found. Pull antibodies from a remote store first:\n   afd sync --pull --remote <url>",
    noDataLocal: "No cross-project patterns found even with local scope included.",
    header: "Global Hotspot patterns detected across multiple projects:",
    scopes: "scopes",
    occurrences: "occurrences",
    covered: "validator exists",
    uncovered: "no validator",
    variants: "variants",
    scopeList: "projects",
    applyTitle: "Auto-generating global validators for uncovered hotspots...",
    applyDone: (n: number) => `${n} global validator(s) generated. Daemon will hot-reload automatically.`,
    applySkipped: (n: number) => `${n} hotspot(s) already covered — skipped.`,
    hint: "Run `afd correlate --apply` to generate global validators for uncovered hotspots.",
    confidence: "confidence",
    communityVerified: "Community Verified",
    minScopesLabel: "Min scopes",
    totalScopes: "Scopes in dataset",
  },
  ko: {
    title: "afd correlate — 크로스 프로젝트 패턴 상관관계",
    noData: "크로스 프로젝트 패턴을 찾지 못했습니다. 원격 스토어에서 항체를 먼저 Pull 하세요:\n   afd sync --pull --remote <url>",
    noDataLocal: "로컬 스코프 포함 시에도 크로스 프로젝트 패턴을 찾지 못했습니다.",
    header: "여러 프로젝트에서 감지된 글로벌 핫스팟 패턴:",
    scopes: "스코프",
    occurrences: "발생",
    covered: "검증기 있음",
    uncovered: "검증기 없음",
    variants: "변형",
    scopeList: "프로젝트",
    applyTitle: "미보호 핫스팟에 대한 글로벌 검증기 자동 생성 중...",
    applyDone: (n: number) => `${n}개 글로벌 검증기 생성 완료. 데몬이 자동으로 핫 리로드합니다.`,
    applySkipped: (n: number) => `${n}개 핫스팟은 이미 보호됨 — 건너뜀.`,
    hint: "`afd correlate --apply`를 실행하여 미보호 핫스팟의 글로벌 검증기를 자동 생성하세요.",
    confidence: "신뢰도",
    communityVerified: "커뮤니티 검증됨",
    minScopesLabel: "최소 스코프",
    totalScopes: "데이터셋 내 스코프",
  },
};

const BOX = { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│", ml: "├", mr: "┤" };
const W = 62;

function hline(l: string, r: string) { return `${l}${BOX.h.repeat(W)}${r}`; }
function row(s: string) {
  const pad = Math.max(0, W - 2 - s.length);
  return `${BOX.v} ${s}${" ".repeat(pad)} ${BOX.v}`;
}

export async function correlateCommand(opts: CorrelateOptions = {}) {
  const lang = getSystemLanguage();
  const m = msgs[lang];

  const minScopes = parseInt(opts.minScopes ?? "2", 10) || 2;
  const includeLocal = opts.includeLocal ?? false;

  const db = initDb();
  try {
    const result = correlatePatterns(db, { minScopes, includeLocal, limit: 10 });

    if (result.hotspots.length === 0) {
      console.log(`[afd correlate] ${includeLocal ? m.noDataLocal : m.noData}`);
      return;
    }

    // ── Apply mode ──────────────────────────────────────────────────────────
    if (opts.apply) {
      const uncovered = result.hotspots.filter(h => !h.alreadyCovered);
      const covered = result.hotspots.filter(h => h.alreadyCovered);

      if (uncovered.length === 0) {
        console.log(`[afd correlate] ${m.applySkipped(covered.length)}`);
        return;
      }

      console.log(`[afd correlate] ${m.applyTitle}`);
      let generated = 0;

      for (const h of uncovered) {
        const input = buildGlobalValidatorInput(h.canonicalType);
        if (!input) continue;
        const res = generateValidator(input);
        if (res.written) {
          console.log(`  ✅ ${res.filename}  (${h.scopeCount} ${m.scopes})`);
          generated++;
        }
      }

      console.log(`[afd correlate] ${m.applyDone(generated)}`);
      if (covered.length > 0) {
        console.log(`[afd correlate] ${m.applySkipped(covered.length)}`);
      }
      return;
    }

    // ── Display mode ────────────────────────────────────────────────────────
    console.log("");
    console.log(hline(BOX.tl, BOX.tr));
    console.log(row(`🌐 ${m.title}`));
    console.log(hline(BOX.ml, BOX.mr));
    console.log(row(`${m.totalScopes}: ${result.totalScopes} | ${m.minScopesLabel}: ${minScopes}`));
    console.log(hline(BOX.ml, BOX.mr));

    for (let i = 0; i < result.hotspots.length; i++) {
      const h = result.hotspots[i];
      const statusIcon = h.alreadyCovered ? "🛡️" : "⚠️";
      const statusText = h.alreadyCovered ? m.covered : m.uncovered;
      const rank = `#${i + 1}`;
      const confStr = `${Math.round(h.confidence * 100)}%`;

      console.log(row(`${rank} ${statusIcon} ${h.canonicalType}`));
      console.log(row(`   ${h.scopeCount} ${m.scopes} | ${h.totalOccurrences} ${m.occurrences} | ${m.confidence}: ${confStr}`));
      console.log(row(`   ${m.scopeList}: ${h.scopes.join(", ")}`));
      console.log(row(`   ${statusText}`));

      if (h.variants.length > 1) {
        const maxVarW = W - 16;
        const varStr = h.variants.slice(1).join(", ");
        const truncated = varStr.length > maxVarW ? varStr.slice(0, maxVarW - 3) + "..." : varStr;
        console.log(row(`   ↳ ${m.variants}: ${truncated}`));
      }

      if (i < result.hotspots.length - 1) {
        console.log(row(""));
      }
    }

    const uncoveredCount = result.hotspots.filter(h => !h.alreadyCovered).length;
    if (uncoveredCount > 0) {
      console.log(hline(BOX.ml, BOX.mr));
      console.log(row(`💡 ${m.hint}`));
    }
    console.log(hline(BOX.bl, BOX.br));
  } finally {
    db.close();
  }
}

/**
 * Build a ValidatorGenInput for a global hotspot based on its pattern type.
 */
function buildGlobalValidatorInput(patternType: string): ValidatorGenInput | null {
  const pt = patternType.toLowerCase();

  if (pt.includes("delet") || pt.includes("removal")) {
    return { failureType: "deletion", originalPath: "global", corruptedContent: "DELETED", restoredContent: null };
  }
  if (pt.includes("empty") || pt.includes("blank")) {
    return { failureType: "corruption", originalPath: "global", corruptedContent: "", restoredContent: null };
  }
  if (pt.includes("truncat")) {
    return { failureType: "corruption", originalPath: "global", corruptedContent: "x", restoredContent: null };
  }
  if (pt.includes("json") || pt.includes("syntax") || pt.includes("parse")) {
    return { failureType: "corruption", originalPath: "global.json", corruptedContent: "{invalid", restoredContent: null };
  }
  return { failureType: "corruption", originalPath: "global", corruptedContent: "corrupted", restoredContent: null };
}
