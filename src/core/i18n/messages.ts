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

  // ── Score dashboard ──
  SCORE_TITLE: string;
  SCORE_ECOSYSTEM: string;
  SCORE_ALSO_FOUND: string;
  SCORE_UPTIME: string;
  SCORE_EVENTS: string;
  SCORE_FILES_FOUND: string;
  SCORE_ACTIVITY: string;
  SCORE_HOLOGRAM_TITLE: string;
  SCORE_HOLOGRAM_REQUESTS: string;
  SCORE_HOLOGRAM_ORIGINAL: string;
  SCORE_HOLOGRAM_COMPRESSED: string;
  SCORE_HOLOGRAM_SAVED: string;
  SCORE_HOLOGRAM_EFFICIENCY: string;
  SCORE_HOLOGRAM_EMPTY: string;
  SCORE_HOLOGRAM_HINT: string;
  SCORE_HOLOGRAM_TODAY: string;
  SCORE_HOLOGRAM_LIFETIME: string;
  SCORE_IMMUNE_TITLE: string;
  SCORE_ANTIBODIES: string;
  SCORE_LEVEL: string;
  SCORE_IMMUNITY: string;
  SCORE_AUTO_HEALED_LABEL: string;
  SCORE_AUTO_HEALED: string;       // "{count}" "{s}"
  SCORE_LAST_HEAL: string;         // "{id}" "{ago}"
  SCORE_WATCHED_FILES: string;
  SCORE_NO_FILES: string;
  SCORE_LAST_EVENT: string;
  SCORE_AGO: string;               // "{time}"
  SCORE_VALUE_TITLE: string;
  SCORE_IMMUNE_VULNERABLE: string;
  SCORE_IMMUNE_LEARNING: string;
  SCORE_IMMUNE_GUARDED: string;
  SCORE_IMMUNE_FORTIFIED: string;

  // ── Lang command ──
  LANG_CURRENT: string;            // "{lang}"
  LANG_CHANGED: string;            // "{lang}"
  LANG_SAVED: string;              // "{path}"
  LANG_LIST_TITLE: string;
  LANG_INVALID: string;            // "{lang}" "{supported}"

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
  DAEMON_RESTARTING: string;

  // ── Setup checklist ──
  SETUP_HEADER: string;         // "{ecosystem}"
  SETUP_HOOKS_NEW: string;
  SETUP_HOOKS_OK: string;
  SETUP_MCP_NEW: string;
  SETUP_MCP_OK: string;
  SETUP_MCP_SKIP: string;
  SETUP_STATUS_NEW: string;
  SETUP_STATUS_OK: string;
  SETUP_STATUS_SKIP: string;
  SETUP_DONE: string;
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
  SCORE_TITLE: "afd score — Daemon Diagnostics",
  SCORE_ECOSYSTEM: "Ecosystem",
  SCORE_ALSO_FOUND: "Also found",
  SCORE_UPTIME: "Uptime",
  SCORE_EVENTS: "Events",
  SCORE_FILES_FOUND: "Files Found",
  SCORE_ACTIVITY: "Activity",
  SCORE_HOLOGRAM_TITLE: "Context Efficiency (Hologram)",
  SCORE_HOLOGRAM_REQUESTS: "Requests",
  SCORE_HOLOGRAM_ORIGINAL: "Original",
  SCORE_HOLOGRAM_COMPRESSED: "Hologram",
  SCORE_HOLOGRAM_SAVED: "Saved",
  SCORE_HOLOGRAM_EFFICIENCY: "Efficiency",
  SCORE_HOLOGRAM_EMPTY: "No hologram requests yet.",
  SCORE_HOLOGRAM_HINT: "Use: GET /hologram?file=<path>",
  SCORE_HOLOGRAM_TODAY: "Today",
  SCORE_HOLOGRAM_LIFETIME: "All-time",
  SCORE_IMMUNE_TITLE: "Immune System",
  SCORE_ANTIBODIES: "Antibodies",
  SCORE_LEVEL: "Level",
  SCORE_IMMUNITY: "Immunity",
  SCORE_AUTO_HEALED_LABEL: "Auto-healed",
  SCORE_AUTO_HEALED: "{count} background event{s}",
  SCORE_LAST_HEAL: "{id} ({ago} ago)",
  SCORE_WATCHED_FILES: "Watched Files:",
  SCORE_NO_FILES: "No files detected yet.",
  SCORE_LAST_EVENT: "Last",
  SCORE_AGO: "{time} ago",
  SCORE_VALUE_TITLE: "\uD83D\uDCC8 Value Delivered",
  SCORE_IMMUNE_VULNERABLE: "Vulnerable",
  SCORE_IMMUNE_LEARNING: "Learning",
  SCORE_IMMUNE_GUARDED: "Guarded",
  SCORE_IMMUNE_FORTIFIED: "Fortified",
  LANG_CURRENT: "[afd] Current language: {lang}",
  LANG_CHANGED: "[afd] Language changed to: {lang}",
  LANG_SAVED: "[afd] Saved to {path}",
  LANG_LIST_TITLE: "[afd] Supported languages:",
  LANG_INVALID: "[afd] Unknown language '{lang}'. Supported: {supported}",
  DAEMON_ALREADY_RUNNING: "\uD83D\uDEE1\uFE0F afd daemon is already running",
  DAEMON_STARTED: "[afd] 🛡️ Daemon started (pid={pid}, port={port})",
  DAEMON_WATCHING: "[afd] 🛡️ Smart Discovery: Watching {count} AI-context targets",
  DAEMON_LOGS: "[afd] Logs: {path}",
  DAEMON_STOPPED: "[afd] Daemon stopped (pid={pid})",
  DAEMON_KILLED: "[afd] Daemon killed (pid={pid})",
  DAEMON_NOT_RUNNING: "[afd] No daemon running.",
  DAEMON_NOT_RESPONDING: "[afd] Daemon not responding. Cleaning up stale PID files.",
  DAEMON_START_FAILED: "[afd] Failed to start daemon. Check logs: {path}",
  DAEMON_RESTARTING: "[afd] 🔄 Restarting daemon...",

  SETUP_HEADER: "[afd] Setting up {ecosystem} ecosystem:",
  SETUP_HOOKS_NEW: "  [+] Hook injected into PreToolUse",
  SETUP_HOOKS_OK: "  [=] Hook already present",
  SETUP_MCP_NEW: "  [+] MCP server registered in .mcp.json",
  SETUP_MCP_OK: "  [=] MCP server already registered",
  SETUP_MCP_SKIP: "  [-] MCP registration not available",
  SETUP_STATUS_NEW: "  [+] StatusLine configured",
  SETUP_STATUS_OK: "  [=] StatusLine already configured",
  SETUP_STATUS_SKIP: "  [-] StatusLine not available",
  SETUP_DONE: "[afd] Zero-touch setup complete. All channels active.",
};

const ko: MessageDict = {
  HEAL_LOG: "[afd] 🩹 {fileName} 살려냈습니다 ({ms}ms) | 📉 토큰 ~{tokens}개 & {mins}분 아꼈네요",
  BOAST_HEAL: [
    "위험할 뻔했네요! {ms}ms 만에 복구 완료. 커피 한 잔 사세요 ☕",
    "클로드가 핵심 설정을 지우려길래 제가 컷했습니다 🛡️",
    "변이 한 놈 더 잡았습니다. 코딩 흐름 끊기지 않게 💉",
    "파일이 삭제될 뻔했지만 눈 깜짝할 새 되돌려놨어요 👁️",
    "수상한 움직임을 감지했습니다. 제가 당직이라 다행인 줄 아세요 🔬",
    "git checkout 치기도 전에 고쳐놨습니다. 이건 서비스예요 🩺",
    "일반 데몬이었으면 멍 때렸겠지만, 전 아니죠 🦠→🛡️",
    "설정 복구 완료. AI 에이전트는 감쪽같이 모를 거예요 🤫",
    "심각한 변이를 비행 중에 요격했습니다. 늘 있는 일이죠 ✂️",
    "면역 체계 이상 무. 오늘도 한 건 해결했습니다 💪",
  ],
  BOAST_HEAL_PREFIX: "[afd] 🗣️",
  BOAST_DORMANT: [
    "두 번이나 지우시겠다고요? 알겠습니다, 뜻대로 하세요 🫡",
    "더블 클릭 감지. 이번엔 원하시는 대로 물러나 드릴게요 🤝",
    "필요 없으시다면야... 항체 우아하게 퇴장합니다 😌",
  ],
  DORMANT_LOG: "[afd] 🫡 항체 {id} 은퇴. {boast}",
  SHIFT_TITLE: "🏥 afd 오늘의 근무 리포트",
  SHIFT_ON_DUTY: "근무 시간",
  SHIFT_EVENTS: "발생 이벤트",
  SHIFT_HEALS: "치료 횟수",
  SHIFT_TOKENS: "절약한 토큰",
  SHIFT_TIME: "아낀 시간",
  SHIFT_COST: "절감 비용",
  SHIFT_SUPPRESSED: "억제됨",
  SHIFT_RETIRED: "은퇴함",
  BOAST_SHIFT_END: [
    "오늘 근무 끝. 덕분에 프로젝트가 더 튼튼해졌네요 💎",
    "퇴근합니다. 설정 파일들은 안전해요... 아직은요 🌙",
    "근무 종료. 단 하나의 변이도 놓치지 않았습니다. (아마도요) 😏",
    "퇴근할게요. 전 자는 게 아니라 잠시 멈추는 겁니다 ⏸️",
    "당직 종료. 제 구역 사상자는 없습니다 🏥",
  ],
  SCORE_TITLE: "afd score — 프로젝트 건강 검진",
  SCORE_ECOSYSTEM: "에코시스템",
  SCORE_ALSO_FOUND: "추가 감지",
  SCORE_UPTIME: "가동 시간",
  SCORE_EVENTS: "이벤트",
  SCORE_FILES_FOUND: "감지된 파일",
  SCORE_ACTIVITY: "활동량",
  SCORE_HOLOGRAM_TITLE: "컨텍스트 효율 (Hologram)",
  SCORE_HOLOGRAM_REQUESTS: "요청 수",
  SCORE_HOLOGRAM_ORIGINAL: "원본 크기",
  SCORE_HOLOGRAM_COMPRESSED: "홀로그램",
  SCORE_HOLOGRAM_SAVED: "절약됨",
  SCORE_HOLOGRAM_EFFICIENCY: "압축 효율",
  SCORE_HOLOGRAM_EMPTY: "아직 홀로그램 요청이 없습니다.",
  SCORE_HOLOGRAM_HINT: "사용법: GET /hologram?file=<경로>",
  SCORE_HOLOGRAM_TODAY: "오늘",
  SCORE_HOLOGRAM_LIFETIME: "누적",
  SCORE_IMMUNE_TITLE: "면역 시스템",
  SCORE_ANTIBODIES: "항체 수",
  SCORE_LEVEL: "방어 레벨",
  SCORE_IMMUNITY: "면역력",
  SCORE_AUTO_HEALED_LABEL: "자동 치유",
  SCORE_AUTO_HEALED: "{count}건 백그라운드 치유됨",
  SCORE_LAST_HEAL: "{id} ({ago} 전)",
  SCORE_WATCHED_FILES: "감시 중인 파일:",
  SCORE_NO_FILES: "아직 감지된 파일이 없습니다.",
  SCORE_LAST_EVENT: "최근 기록",
  SCORE_AGO: "{time} 전",
  SCORE_VALUE_TITLE: "📈 전달된 가치",
  SCORE_IMMUNE_VULNERABLE: "취약",
  SCORE_IMMUNE_LEARNING: "학습 중",
  SCORE_IMMUNE_GUARDED: "경계 중",
  SCORE_IMMUNE_FORTIFIED: "철통 방어",
  LANG_CURRENT: "[afd] 현재 언어: {lang}",
  LANG_CHANGED: "[afd] 언어가 변경되었습니다: {lang}",
  LANG_SAVED: "[afd] 저장 완료 → {path}",
  LANG_LIST_TITLE: "[afd] 지원하는 언어:",
  LANG_INVALID: "[afd] '{lang}' 은(는) 알 수 없는 언어예요. 지원: {supported}",
  DAEMON_ALREADY_RUNNING: "🛡️ afd 데몬이 이미 열심히 일하고 있습니다",
  DAEMON_STARTED: "[afd] 🛡️ 데몬 시작 (pid={pid}, port={port})",
  DAEMON_WATCHING: "[afd] 🛡️ 스마트 탐색 중: AI 컨텍스트 대상 {count}개 감시 시작",
  DAEMON_LOGS: "[afd] 로그 위치: {path}",
  DAEMON_STOPPED: "[afd] 데몬이 중지되었습니다 (pid={pid})",
  DAEMON_KILLED: "[afd] 데몬 강제 종료 완료 (pid={pid})",
  DAEMON_NOT_RUNNING: "[afd] 실행 중인 데몬을 찾을 수 없습니다.",
  DAEMON_NOT_RESPONDING: "[afd] 데몬이 응답하지 않네요. 남은 PID 파일을 정리합니다.",
  DAEMON_START_FAILED: "[afd] 데몬 시작 실패. 로그를 확인해 보세요: {path}",
  DAEMON_RESTARTING: "[afd] 🔄 데몬을 재시작합니다...",

  SETUP_HEADER: "[afd] {ecosystem} 에코시스템 설정 중:",
  SETUP_HOOKS_NEW: "  [+] PreToolUse 훅 주입 완료",
  SETUP_HOOKS_OK: "  [=] 훅 이미 설정됨",
  SETUP_MCP_NEW: "  [+] MCP 서버 등록 완료 (.mcp.json)",
  SETUP_MCP_OK: "  [=] MCP 서버 이미 등록됨",
  SETUP_MCP_SKIP: "  [-] MCP 등록 미지원",
  SETUP_STATUS_NEW: "  [+] StatusLine 설정 완료",
  SETUP_STATUS_OK: "  [=] StatusLine 이미 설정됨",
  SETUP_STATUS_SKIP: "  [-] StatusLine 미지원",
  SETUP_DONE: "[afd] 제로터치 설정 완료. 모든 채널 활성화.",
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
