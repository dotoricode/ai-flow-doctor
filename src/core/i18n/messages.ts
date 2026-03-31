/**
 * Bilingual Dictionary — "Boastful Doctor" persona
 *
 * Keys use template literals with {placeholders}.
 * All arrays are variant pools — a random entry is picked at runtime.
 */

import type { SupportedLang } from "../locale";

export interface MessageDict {
  // ── Heal event ──
  HEAL_LOG: string;           // "{fileName}" "{ms}" "{tokens}" "{mins}"
  BOAST_HEAL: string[];       // witty one-liners after heal (1-in-5 chance)
  BOAST_HEAL_PREFIX: string;  // e.g. "[afd] 🗣️"

  // ── Dormant transition ──
  BOAST_DORMANT: string[];
  DORMANT_LOG: string;        // "{id}" "{boast}"

  // ── Shift summary box ──
  SHIFT_TITLE: string;
  SHIFT_ON_DUTY: string;
  SHIFT_EVENTS: string;
  SHIFT_HEALS: string;
  SHIFT_TOKENS: string;
  SHIFT_TIME: string;
  SHIFT_COST: string;
  SHIFT_SUPPRESSED: string;
  SHIFT_RETIRED: string;
  BOAST_SHIFT_END: string[];

  // ── Score value section ──
  SCORE_VALUE_TITLE: string;

  // ── CLI messages ──
  DAEMON_ALREADY_RUNNING: string;
  DAEMON_STARTED: string;     // "{pid}" "{port}"
  DAEMON_WATCHING: string;    // "{count}" "{targets}"
  DAEMON_LOGS: string;        // "{path}"
  DAEMON_STOPPED: string;     // "{pid}"
  DAEMON_KILLED: string;      // "{pid}"
  DAEMON_NOT_RUNNING: string;
  DAEMON_NOT_RESPONDING: string;
  DAEMON_START_FAILED: string; // "{path}"
}

const en: MessageDict = {
  HEAL_LOG: "[afd] 🩹 Healed {fileName} in {ms}ms | 📉 Saved ~{tokens} tokens & {mins} mins of debugging",
  BOAST_HEAL: [
    "Dodged a bullet there! Restored in {ms}ms. You owe me a coffee ☕",
    "Claude tried to delete a critical config. I said 'Not today.' 🛡️",
    "Another mutation neutralized. The flow remains immortal. 💉",
    "File vanished. I brought it back before you even blinked. 👁️",
    "That deletion looked suspicious. Good thing I was on shift. 🔬",
    "Patched faster than you can say 'git checkout'. No charge. 🩺",
    "A lesser daemon would have let that one slide. Not me. 🦠→🛡️",
    "Config restored. Your AI agent will never know it was gone. 🤫",
    "Intercepted a fatal mutation mid-flight. Routine procedure. ✂️",
    "The immune system holds. Another day, another heal. 💪",
  ],
  BOAST_HEAL_PREFIX: "[afd] 🗣️",
  BOAST_DORMANT: [
    "You deleted that twice? Fine, I'll respect your wishes, doctor. 🫡",
    "Double-tap detected. Standing down — your call, chief. 🤝",
    "I know when I'm not wanted. Antibody retired gracefully. 😌",
  ],
  DORMANT_LOG: "[afd] 🫡 Antibody {id} retired. {boast}",
  SHIFT_TITLE: "🏥 afd Shift Summary",
  SHIFT_ON_DUTY: "On duty",
  SHIFT_EVENTS: "Events",
  SHIFT_HEALS: "Heals",
  SHIFT_TOKENS: "Tokens saved",
  SHIFT_TIME: "Time saved",
  SHIFT_COST: "Cost saved",
  SHIFT_SUPPRESSED: "Suppressed",
  SHIFT_RETIRED: "Retired",
  BOAST_SHIFT_END: [
    "Another shift complete. The flow is stronger than ever. 💎",
    "Signing off. Your configs are safe... for now. 🌙",
    "Shift ended. Not a single mutation got past me. Well, almost. 😏",
    "Clocking out. Remember: I never sleep, I just pause. ⏸️",
    "End of watch. Zero casualties on my side. 🏥",
  ],
  SCORE_VALUE_TITLE: "📈 Value Delivered",
  DAEMON_ALREADY_RUNNING: "🛡️ afd daemon is already running",
  DAEMON_STARTED: "[afd] 🛡️ Daemon started (pid={pid}, port={port})",
  DAEMON_WATCHING: "[afd] 🛡️ Smart Discovery: Watching {count} AI-context targets",
  DAEMON_LOGS: "[afd] Logs: {path}",
  DAEMON_STOPPED: "[afd] Daemon stopped (pid={pid})",
  DAEMON_KILLED: "[afd] Daemon killed (pid={pid})",
  DAEMON_NOT_RUNNING: "[afd] No daemon running.",
  DAEMON_NOT_RESPONDING: "[afd] Daemon not responding. Cleaning up stale PID files.",
  DAEMON_START_FAILED: "[afd] Failed to start daemon. Check logs: {path}",
};

const ko: MessageDict = {
  HEAL_LOG: "[afd] 🩹 {fileName} 복구 완료 ({ms}ms) | 📉 ~{tokens} 토큰 & {mins}분 디버깅 절약",
  BOAST_HEAL: [
    "위험했다! {ms}ms 만에 복구. 커피 한 잔 빚졌어요 ☕",
    "Claude가 핵심 설정을 지우려 했지만, 제가 막았습니다 🛡️",
    "또 하나의 변이 무력화. 플로우는 영원합니다 💉",
    "파일이 사라졌다가 눈 깜짝할 새 돌아왔습니다 👁️",
    "수상한 삭제를 감지했어요. 당직 중이라 다행이죠 🔬",
    "'git checkout' 치기도 전에 패치 완료. 무료입니다 🩺",
    "보통 데몬이면 넘어갔을 텐데, 전 아니죠 🦠→🛡️",
    "설정 복구 완료. AI 에이전트는 모를 거예요 🤫",
    "치명적 변이를 비행 중 요격. 일상적인 수술이죠 ✂️",
    "면역 체계 건재. 오늘도 한 건 치료 완료 💪",
  ],
  BOAST_HEAL_PREFIX: "[afd] 🗣️",
  BOAST_DORMANT: [
    "두 번이나 지웠어요? 좋아요, 의사 선생님 뜻을 존중합니다 🫡",
    "더블탭 감지. 물러서겠습니다 — 당신의 판단을 믿어요 🤝",
    "필요 없다는 걸 알겠어요. 항체 우아하게 은퇴합니다 😌",
  ],
  DORMANT_LOG: "[afd] 🫡 항체 {id} 은퇴. {boast}",
  SHIFT_TITLE: "🏥 afd 근무 요약",
  SHIFT_ON_DUTY: "근무 시간",
  SHIFT_EVENTS: "이벤트",
  SHIFT_HEALS: "치료 횟수",
  SHIFT_TOKENS: "절약 토큰",
  SHIFT_TIME: "절약 시간",
  SHIFT_COST: "절약 비용",
  SHIFT_SUPPRESSED: "억제됨",
  SHIFT_RETIRED: "은퇴됨",
  BOAST_SHIFT_END: [
    "또 하루의 근무 완료. 플로우는 더 강해졌습니다 💎",
    "퇴근합니다. 설정 파일은 안전해요... 지금은요 🌙",
    "근무 종료. 변이 하나도 못 지나갔어요. 거의요 😏",
    "퇴근. 전 자지 않아요, 잠시 멈출 뿐 ⏸️",
    "당직 종료. 제 쪽 사상자 제로 🏥",
  ],
  SCORE_VALUE_TITLE: "📈 전달된 가치",
  DAEMON_ALREADY_RUNNING: "🛡️ afd 데몬이 이미 실행 중입니다",
  DAEMON_STARTED: "[afd] 🛡️ 데몬 시작됨 (pid={pid}, port={port})",
  DAEMON_WATCHING: "[afd] 🛡️ 스마트 탐색: AI 컨텍스트 대상 {count}개 감시 중",
  DAEMON_LOGS: "[afd] 로그: {path}",
  DAEMON_STOPPED: "[afd] 데몬 중지됨 (pid={pid})",
  DAEMON_KILLED: "[afd] 데몬 강제 종료 (pid={pid})",
  DAEMON_NOT_RUNNING: "[afd] 실행 중인 데몬이 없습니다.",
  DAEMON_NOT_RESPONDING: "[afd] 데몬이 응답하지 않습니다. 잔여 PID 파일을 정리합니다.",
  DAEMON_START_FAILED: "[afd] 데몬 시작 실패. 로그를 확인하세요: {path}",
};

const dictionaries: Record<SupportedLang, MessageDict> = { en, ko };

/** Get the full dictionary for a language. */
export function getMessages(lang: SupportedLang): MessageDict {
  return dictionaries[lang];
}

/** Template interpolation: replaces {key} with values. */
export function t(template: string, vars: Record<string, string | number> = {}): string {
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, String(val));
  }
  return result;
}
