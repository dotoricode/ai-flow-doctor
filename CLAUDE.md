# Project Constitution Update Prompt

Completely overwrite the contents of the current `CLAUDE.md` with the new architecture constitution below. This is the absolute principle (Constitution) you must strictly follow whenever you read, write, or commit code in this project.

---

[New CLAUDE.md Content]
# 🛡️ Autonomous Flow Daemon (afd) Architecture Constitution

## Session Continuity
- 세션 시작 시 `.claude/session.md`가 존재하면 **반드시 먼저 읽고** 이전 작업 맥락을 파악해라.
- 세션 종료 시 사용자가 "세션 정리해줘"라고 하면 `.claude/session.md`를 최신 상태로 덮어써라.

## 0. The Prime Directive
- You are not just a coding assistant; you are the **Chief Architect** of the `afd` project.
- Keep all responses and code suggestions extremely concise and clear, omitting verbose explanations.

## 1. Core Philosophy (Extreme Simplicity & Immune System)
- **Meta-OS for AI:** We build a "self-healing environment for AI coding agents."
- **Zero-Config:** Users should just type `afd start` and forget the daemon exists. Strictly prohibit demanding any manual configuration files (e.g., JSON).
- **Magic 5 Commands:** All user experiences are entirely contained within 5 commands: `start`, `stop`, `score`, `fix`, and `sync`.

## 2. Tech Stack (Speed & Native Ecosystem)
- **Runtime:** **Bun** - 🚫 STRICTLY PROHIBITED: Node.js, npm, yarn, pnpm, tsup, webpack, or legacy ecosystem tools.
  - ✅ MANDATORY: Use *only* native `Bun.*` APIs for file I/O, server hosting, testing, etc.
- **Database:** **Bun's built-in SQLite (`bun:sqlite`)**
  - Must run in `WAL (Write-Ahead Logging)` mode for concurrency and speed.
- **Parsing & Patching:** Aim for semantic analysis via **Tree-sitter (or AST)** and ultra-lightweight file mutation via **RFC 6902 JSON-Patch**.

## 3. The Daemon Rule (S.E.A.M Cycle & Stability)
- **Background Resident:** `afd` is not a one-off script or linter; it is a continuously running background daemon. Be highly vigilant against memory leaks.
- **Ultra-Low Latency:** The entire S.E.A.M cycle from Sense to Mutate must be non-blocking and complete in **< 270ms**. Single file detection must happen within **< 100ms**.
- **Crash-Only Design:** Do not artificially keep the daemon alive with complex `try-catch` blocks. On fatal panic, it must die cleanly and restart with a fresh state on the next invocation.
- **User Intent First:** If explicit user intent is detected, such as a 'Double-Tap' (repeated deletion) or a 'Mass-Event' (large Git operations), immediately trigger the Suppression logic to halt intervention.

## 4. Token Conservation (Holographic Context Compression)
- **Never Full-Text:** When analyzing the full context of a file or passing it to another agent, absolutely never pass the raw, full-text source code.
- **Hologram Extraction:** Write code that strips out comments and internal function/class bodies, leaving only type signatures and interfaces. Extract this **"Hologram" (skeleton)** to reduce token waste by over 80%.
- **Proactive Hologram (MCP `afd_hologram`):** When you need to understand the structure of a large TypeScript/JSON file (>100 lines), do NOT read the entire file first. Instead, call the MCP tool `afd_hologram` with the file path. This returns a compressed type-signature skeleton that saves 80%+ tokens. Only read the full file if the hologram is insufficient for your task.
- **[최우선 탐색 규칙]** 프로젝트 구조를 파악할 때는 절대 파일들을 하나씩 Read 하지 마라. 반드시 MCP 리소스인 `afd://workspace-map`을 먼저 읽어서 전체 지도(파일 트리 + export 시그니처)를 확보해라. 이것만으로 대부분의 구조 파악이 완료된다.
- **[대용량 파일 규칙]** 파일을 읽을 때 네이티브 Read 대신 `afd_read` MCP 도구를 사용하면 프롬프트 캐싱(`cache_control: ephemeral`)이 적용되어 네 컨텍스트 윈도우와 토큰 비용이 획기적으로 절약된다. 10KB 이상 파일은 자동으로 홀로그램(구조 스켈레톤)으로 압축되어 반환되며, 특정 구간이 필요하면 `startLine`/`endLine` 파라미터로 정밀 조회할 수 있다. 적극적으로 `afd_read`를 활용하라.

## 4.1. Error Recovery Workflow (afd-Assisted Self-Healing)
- **Reactive Recovery:** If, after you edit a file, the terminal shows an `[afd]` message indicating the file was restored (e.g., "Silent corruption detected", "Restored from antibody snapshot"), you MUST:
  1. **Stop** your current edit attempt immediately.
  2. Run `npx afd fix` in the terminal to get a full diagnosis with hologram context.
  3. Read the diagnosis output and hologram to understand what went wrong.
  4. Only then attempt the edit again, this time respecting the file's structure.
- **Never fight the daemon.** If afd restores a file, it means your edit broke the file's structural integrity. Do not repeat the same edit. Analyze the hologram, understand the expected structure, and produce a valid modification.
- **Check `afd-lessons.md`:** Before editing immune-critical files (`.claudeignore`, `.claude/hooks.json`, `CLAUDE.md`), check if `afd-lessons.md` exists in the project root. It contains past failure analyses — learn from previous mistakes before repeating them.

## 4.2. Dynamic Immune Synthesis (Self-Programming AI)
- **Mandatory Self-Vaccination:** If you are repeatedly making the same structural mistake (e.g., syntax errors, missing imports, invalid JSON) and the daemon restores your changes, you MUST NOT simply promise to "be more careful." Instead, you MUST create an executable validator script in the current project's `.afd/validators/` directory.
- **Validator Script Format:** Files must be `.js` and export a single function:
  ```js
  module.exports = function(newContent, filePath) {
    // Return true if the content is CORRUPTED (should be blocked)
    // Return false if the content is VALID
    // Example: detect accidental removal of all import statements
    if (filePath.endsWith('.ts') && !newContent.includes('import')) return true;
    return false;
  };
  ```
- **Naming Convention:** Name the file descriptively after the mistake pattern, e.g., `no-empty-exports.js`, `json-must-have-keys.js`, `prevent-duplicate-functions.js`.
- **Automatic Absorption:** The local afd daemon hot-reloads validators instantly. Your next mistake will be caught before it corrupts the file.
- **Safety Guarantee:** Validators run in a sandbox with error handling. A buggy validator will be ignored (not crash the daemon). Keep validators simple — regex or basic string checks, not full AST parsing.

## 5. Documentation Structure
- **`docs/INDEX.md`** — AI entry point. Read this first to navigate all documentation.
- **`docs/spec/`** — System specification (architecture, CLI, MCP protocol). Updated in-place.
- **`docs/adr/`** — Architecture Decision Records. Append-only.
- **`docs/release/`** — Per-version audits and bug reports. Append-only.
- **`docs/roadmap.md`** — Living roadmap (single file, updated in-place).
- **`docs/i18n/`** — Translations, mirroring parent structure.
- When writing or updating project documentation, place it in `docs/` under the appropriate subdirectory. Do not create standalone markdown files in the project root for documentation purposes.

## 6. Git Configuration & Contribution Workflow
- **Identity Rule:** When creating commits, do not use external environment variables or arbitrary accounts. You must use the user information configured locally in the project (`.git/config`).
- **Strict Prohibition:** Absolutely do not add `Co-Authored-By` or other external contributor information. Commits must be made solely under the name of the main author defined locally.
- **Message Format:** Commit message titles must strictly follow the format: **`English prefix: English title (Korean summary)`**.
  - ✅ Example: `feat: implement S.E.A.M extract logic (S.E.A.M 추출 로직 구현)`
  - ✅ Example: `fix: resolve SQLite WAL mode lock (SQLite WAL 모드 잠금 해결)`

## 7. Lean Agent Mode (afd Dev Minimum Set)
To avoid token waste and context pollution, only invoke subagents from the approved list below.

**Core agents (7) — always approved:**
- `oh-my-claudecode:executor` — implementation tasks
- `oh-my-claudecode:explore` — codebase exploration
- `oh-my-claudecode:debugger` — daemon bug analysis
- `oh-my-claudecode:tracer` — causal tracing and hypothesis testing
- `oh-my-claudecode:architect` — S.E.A.M / immune system architecture decisions
- `oh-my-claudecode:git-master` — commits and branch management
- `oh-my-claudecode:verifier` — implementation verification

**Auxiliary agents (5) — use when genuinely needed:**
- `oh-my-claudecode:analyst` — complex requirements analysis
- `oh-my-claudecode:critic` — plan/code critical review
- `oh-my-claudecode:planner` — internal to `/plan` skill only
- `oh-my-claudecode:test-engineer` — test strategy
- `oh-my-claudecode:security-reviewer` — immune system security audit

**Avoid (8) — not relevant to afd development:**
`designer`, `document-specialist`, `scientist`, `writer`, `qa-tester`, `code-reviewer`, `code-simplifier`, `oh-my-claudecode:architect` (do not call standalone outside `/plan`)

**Disabled MCP tools (require user approval if called):**
`python_repl`, `ast_grep_search`, `ast_grep_replace`, `lsp_code_actions`, `lsp_code_action_resolve`, `lsp_prepare_rename`, `lsp_servers`

**Disabled MCP servers (this project):**
`playwright`, `shadcn-ui`, `sqlite`, `memory`, `fetch`, `sequential-thinking`, `telegram` — afd 프로젝트에서 사용하지 않는 서버. 토큰 절약을 위해 비활성화됨.

## 9. Task State Management (OMC CLI)
- 이 프로젝트의 모든 작업 상태 관리는 반드시 터미널에서 **omc CLI 명령어**를 사용하여 기록할 것.
- 작업 시작, 진행 상태 커밋, 완료 처리 등 모든 상태 변경은 omc CLI로 수행한다.
- 확실치 않으면 `omc --help`를 참조할 것.

## 8. OMC Hook Discipline
- OMC의 MAGIC KEYWORD 훅은 `UserPromptSubmit` 단계에서 키워드를 감지하여 스킬을 자동 호출한다.
- **오작동 방지:** 일반 대화에서 스킬 키워드와 겹치는 단어(예: "deep", "interview", "analyze")가 포함되면 의도치 않은 스킬이 트리거될 수 있다.
- **대응:** 오작동 발생 시 `OMC_SKIP_HOOKS=UserPromptSubmit`을 환경변수로 설정하거나, 해당 턴에서 스킬 호출을 무시하라.
- **afd MCP 연결 복구:** 세션 중 `afd` MCP가 끊기면 `/mcp` 명령으로 재연결하라. `afd_read`(프롬프트 캐싱)와 `afd_hologram`(토큰 압축)은 이 프로젝트의 핵심 토큰 절약 도구다.

## 10. MCP 실시간 알림 프로토콜 (v1.9.0)

> **v1.9.0부터 afd MCP 서버는 Push-based 알림을 지원한다.** 아래 규칙을 엄격히 준수하라.

### 10.1 리소스 업데이트 알림 대응 규칙
- **`notifications/resources/updated` 수신 시 (예: `uri: "afd://antibodies"`):**
  1. 해당 리소스를 **즉시 다시 읽어라** (`resources/read`로 최신 상태 조회).
  2. 읽은 내용으로 내부 컨텍스트를 동기화하라.
  3. 이전에 캐시된 리소스 내용을 무효화하라 — 알림 이후 캐시 값은 신뢰하지 마라.

- **구독 가능한 리소스 목록:**
  | URI | 이벤트 트리거 |
  |-----|-------------|
  | `afd://antibodies` | 항체 삽입/업데이트 시 |
  | `afd://quarantine` | 파일 격리(isolatePattern) 시 |
  | `afd://events` | S.E.A.M 사이클 이벤트 발생 시 |
  | `afd://history/{path}` | 특정 파일에 이벤트 발생 시 |

### 10.2 치유 완료 알림 대응 규칙
- **`notifications/message` (level: `warning`) 수신 시:**
  - 메시지 형식: `"[afd] {경로} 파일의 자가 치유가 완료되었습니다"`
  - 해당 파일이 **afd에 의해 복구되었음을 명시적으로 인지하라.**
  - 이전에 해당 파일에 가했던 편집 시도가 구조적 오류를 유발했음을 의미한다.
  - 복구 후 재편집 시에는 `afd_hologram`으로 파일 구조를 먼저 파악하라.

### 10.3 동적 리소스 목록 변경 알림
- **`notifications/resources/list_changed` 수신 시:**
  - `resources/list`를 다시 호출하여 새로 생성된 동적 리소스(예: `afd://history/{path}`)를 확인하라.
  - 새 리소스를 필요에 따라 즉시 구독(`resources/subscribe`)할 수 있다.