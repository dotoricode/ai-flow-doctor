# Roadmap

> afd 프로젝트의 버전별 계획과 미래 방향.

---

## Released

### v1.0.0 — The Immortal Flow
- [x] S.E.A.M engine (Sense → Extract → Adapt → Mutate)
- [x] Magic 5 Commands (`start`, `stop`, `score`, `fix`, `sync`)
- [x] Suppression safety (Double-Tap, Mass-Event awareness)
- [x] SQLite WAL antibody storage
- [x] Hologram AST skeleton extraction (80%+ token savings)
- [x] Auto-heal via PreToolUse hook

### v1.1.0
- [x] Smart Discovery (auto-detect AI-context files beyond static targets)
- [x] Boastful Doctor persona (heal log personality)
- [x] Auto-localization (ko/en) with `afd lang`
- [x] i18n message system

### v1.2.0

#### Cross-Platform Hardening
- [x] Platform abstraction (`src/platform.ts`)
- [x] Cross-platform notifications (macOS/Linux/Windows)
- [x] CI matrix (ubuntu, macos, windows)
- [x] Hook command fallback (afd → bunx → npx)
- [x] Log rotation (5MB, 3 files)
- [x] LRU snapshot memory management (10MB cap)

#### MCP Integration
- [x] JSON-RPC dispatch for `tools/list` and `tools/call`
- [x] `afd_diagnose` tool implementation
- [x] `afd_score` tool implementation
- [x] `afd_hologram` tool implementation

### v1.3.0

#### Ecosystem Expansion
- [x] Cursor adapter: hook injection
- [x] Windsurf adapter
- [x] Codex adapter
- [x] One-Command Zero-Touch ecosystem provisioning

#### Advanced Diagnostics
- [x] AST-based semantic diff (TypeScript compiler API)
- [x] Custom diagnostic rule engine (`.afd/rules/*.yml`)
- [x] Corruption double-tap detection

#### Vaccine Network
- [x] Remote antibody sharing (`afd sync --push/--pull`)
- [x] Vaccine registry (`afd vaccine list/search/install/publish`)

#### Developer Experience
- [x] `afd doctor` — deep health analysis with `--fix`
- [x] `afd evolution` — quarantine analysis + lesson generation
- [x] `afd restart` — sequential stop + start
- [x] Guardian grade scoring (A+ to D)
- [x] Shift summary on stop (ROI metrics)

#### Multi-Workspace (Phase 8)
- [x] `findWorkspaceRoot()` — walk up directory tree
- [x] `resolveWorkspacePaths()` — all `.afd/` paths relative to workspace root
- [x] Subdirectory invocation support

#### Dynamic Immune Synthesis
- [x] Hot-reload custom validators from `.afd/validators/*.js`
- [x] `fs.watch` on validators directory with debounce
- [x] Sandboxed execution (try-catch + timeout warning)
- [x] Integration into `isCorrupted()` pipeline
- [x] Validator count in `score` and `watch` TUI

#### Bug Fixes
- [x] 15 bugs fixed (v1.2 + v1.3 audit): memory leaks, command injection, SSE cleanup, AST diff accuracy

### v1.4.0 — Security & Modular Refactor
- [x] Server module extraction (`server.ts` → modular components)
- [x] Path traversal guard, input validation, symlink protection
- [x] Version single source of truth

### v1.5.0 — Trust-Builder

#### Hologram L1 (Import-Based Semantic Compression)
- [x] Import symbol extraction via regex fast-path (`extractImportedSymbols`)
- [x] `contextFile` parameter on `afd_hologram` MCP tool and `/hologram` HTTP endpoint
- [x] L1 filtering: imported symbols → full body, others → name-only stub
- [x] N-Depth Reachability model: L1(직접)=regex, L2/L3=v2.0(Tree-sitter)

#### Antibody Passive Defense
- [x] `mistake_history` SQLite table with 30-day retention
- [x] Write-through cache (`mistakeCache: Map<string, MistakeEntry[]>`)
- [x] `/mistake-history?file=` HTTP endpoint
- [x] `pastMistakes` injection into PreToolUse a2a hook output (`diagnose --format a2a`)

#### HUD Counter + Reasons
- [x] `/mini-status` enhanced with `total_defenses` + `defense_reasons` (in-memory, < 200ms)
- [x] Status bar: `🛡️ [afd] N건 방어 (사유1, 사유2)` format

#### Bug Fixes
- [x] Windows path normalization in `assertInsideWorkspace()` (backslash → forward slash)

### v1.6.0 — Hook Manager + Hologram Engine

#### Multi-Owner Hook Orchestration
- [x] `HookOwner` model: afd / omc / user zone classification by id prefix
- [x] `mergeHooks()`: ownership-aware merge engine with ordering guarantee (afd → omc → user)
- [x] `detectConflicts()`: matcher-overlap and duplicate-id detection across owners
- [x] `KNOWN_AFD_HOOKS` canonical set: safe removal on `stop --clean` (preserves user `afd-*` scripts)
- [x] `afd hooks status` — display all hooks grouped by owner, ordering check, conflict warnings
- [x] `afd hooks sync` — re-sort hooks.json to correct zone ordering, report changes
- [x] `ClaudeCodeAdapter.injectHooks` rewired through Hook Manager (correct `Write|Edit|MultiEdit` matcher)
- [x] `ClaudeCodeAdapter.removeHooks` uses `KNOWN_AFD_HOOKS` for safe targeted removal
- [x] 28 unit tests covering classification, merge, conflict detection, read/write, summary

#### Hologram Engine Overhaul
- [x] Tree-sitter (web-tree-sitter WASM) 기반 엔진으로 전면 교체 — TS compiler API 제거
- [x] 다국어 지원: TypeScript/JS (full), Python (L0 fallback), Go/Rust (fallback)
- [x] `src/core/hologram/` 서브모듈 구조 — engine, types, ts-extractor, py-extractor, go-extractor, fallback, incremental
- [x] Incremental hologram — LCS 기반 diff-only 모드 (`changedNodes`, `isDiff`)
- [x] True LRU 캐시 (최대 200 엔트리)
- [x] LCS guard: n×m > 50,000 → full diff fallback (270ms 예산 보호)

#### Event Batching
- [x] `EventBatcher` (`src/daemon/event-batcher.ts`) — 300ms 디바운스, immune 파일 fast-path
- [x] Dedup (last-event-wins), add+unlink 상쇄 처리
- [x] `flush()`, `destroy()`, `pendingCount`, `totalBatches` 통계

#### Bug Fixes (Self-Healing Audit)
- [x] P0: `autoHealFile` 경로 탈출 취약점 — `assertInsideWorkspace` 가드 추가
- [x] P0: `pick()` 빈 배열 크래시 방어
- [x] P1: validator dynamic import `?t=Date.now()` 모듈 캐시 누수 제거
- [x] P1: `unlink` 이벤트 시 `watchedFiles` Set 누수 방지
- [x] P1: hologram 마이그레이션 `db.transaction()` 원자성 보장
- [x] P1: `findAntibodyById` prepared statement 핫 패스에서 초기화 블록으로 이동

### v1.7.0 — Collective Intelligence

#### Hologram Precision Engine (prev. v1.6.1)
- [x] `isPureTypeFile()`: 최상위 AST 노드 타입만 O(n) 스캔 → 구현부 없는 파일 즉시 반환
- [x] 판정 기준: `type_alias_declaration`, `interface_declaration`, `export_statement`(선언형만) 조합
- [x] 1~2ms 이내 판정 보장 (깊은 트리 탐색 없음)
- [x] 순수 타입 파일 절감률 0% — 압축 불필요 파일에 연산 낭비 제거
- [x] `HologramOptions`에 `symbols?: string[]` 파라미터 추가
- [x] `getDeclarationName()`: export 래핑 언래핑 포함 범용 심볼명 추출
- [x] 지정 심볼만 AST에서 핀셋 추출 — 전체 홀로그램 대신 필요한 선언만 반환
- [x] `afd_read` MCP 스키마에 `symbols` 파라미터 추가 (선택적, 완전 하위 호환)
- [x] 파일 크기와 무관하게 심볼 지정 시 즉시 추출 모드 진입
- [x] 검증: `DaemonState` 단독 조회 → 10.8% → **78.8%** 절감 (7.3배 향상)
- [x] `mistakeCache` warm-up 경로 정규화 — Windows 백슬래시 → 포워드 슬래시

#### Go Language Support (prev. v1.6.2)
- [x] `src/core/hologram/go-extractor.ts` — tree-sitter-go WASM 기반 Go 파싱
- [x] 추출 대상: package, import, type(struct/interface/alias), func, method(receiver)
- [x] struct 필드 전체 보존, interface method_elem 직접 추출
- [x] 9개 테스트 (`test/hologram-go.test.ts`) 추가, 전체 154/154 통과
- [x] `tree-sitter-go@0.25.0` dependencies에 추가

#### Rust Language Support (prev. v1.6.3)
- [x] `src/core/hologram/rust-extractor.ts` — tree-sitter-rust WASM 기반 Rust 파싱
- [x] 추출 대상: use, mod, struct(fields), enum(variants), trait(signatures), type alias, impl(method stubs), fn
- [x] impl Trait for Type 및 generic impl 헤더 정확 추출
- [x] 11개 테스트 (`test/hologram-rust.test.ts`) 추가, 전체 165/165 통과
- [x] `tree-sitter-rust@0.24.0` dependencies에 추가
- [x] 기존 `.rs` L0 fallback 테스트 → `.xyz` unknown extension으로 교정

#### Architecture Decisions
- [x] `mistake_type` 저장 언어 결정 — English enum in DB, Korean at HUD render layer
- [x] HUD defense count reset 정책 결정 — in-memory session-scoped, lifetime stats via `afd score`
- [x] `mistake_history` 보존 기간 결정 — 90일 (`db.ts:97` purge threshold 30d → 90d)
- [x] Barrel file L1 support 결정 — defer to v2.0, current L0 fallback is final for v1.x
- [x] `file_path` 정규화 전략 결정 — workspace-relative POSIX forward-slash (`src/core/db.ts`)

#### Team Antibody Federation
- [x] Remote vaccine store (`afd sync --remote <url>`)
- [x] Team antibody federation — share learned patterns across repos
- [x] Antibody versioning and conflict resolution

#### Advanced Evolution
- [x] Auto-validator generation from quarantine patterns
- [x] Rule suggestion engine based on failure history
- [x] Cross-project pattern correlation (`afd correlate`, `afd suggest --cross`)

### v1.8.0 — Ecosystem Expansion

#### MCP Phase 2 — Interactive Tools
- [x] `afd_suggest` MCP tool: surface high-frequency vulnerability patterns from mistake_history
- [x] `afd_fix` MCP tool: apply patches interactively via Claude tool call
- [x] `afd_sync` MCP tool: push/pull remote vaccine store via MCP
- [x] MCP resource `afd://antibodies` — live antibody list via ReadMcpResource

#### Multi-Agent Coordination
- [x] Cross-daemon HTTP bridge for monorepo setups (workspace discovery)
- [x] Shared antibody namespace across sub-repos (`afd sync --local-mesh`)
- [x] Conflict arbitration protocol for concurrent daemon writes

#### Plugin System
- [x] Plugin manifest format (`.afd/plugins/*.json`)
- [x] Third-party validator adapter API (`ValidatorPlugin` interface)
- [x] `afd plugin install <npm-package>` command

### v1.9.0 — Real-time Notification Mesh + Token Dashboard

#### MCP Phase 3 — Push-based 알림 메시
- [x] `SubscriptionManager` 모듈 신설 — 구독 URI 관리 및 알림 디스패처
- [x] `initialize` 응답에 `capabilities.resources.subscribe: true` 추가
- [x] `resources/subscribe` / `resources/unsubscribe` 핸들러 구현
- [x] `notifications/resources/updated` 디스패처 구현
- [x] `afd://quarantine` 리소스 — 격리 이벤트 발생 시 자동 알림
- [x] `afd://events` 리소스 — S.E.A.M 사이클 실시간 브리지 (링 버퍼 200개)
- [x] `afd://history/{path}` URI 템플릿 — 파일별 이벤트 히스토리 구독
- [x] `insertAntibody` 훅 → `afd://antibodies` 업데이트 알림
- [x] `quarantineFile` 훅 → `afd://quarantine` 업데이트 알림
- [x] `autoHealFile` 훅 → `notifications/message` (level: warning) 한국어 알림
- [x] `notifications/resources/list_changed` — 신규 동적 리소스 생성 시 발송
- [x] `CLAUDE.md` Section 10: MCP 실시간 알림 프로토콜 에이전트 규칙 추가

#### Token Dashboard (`afd dashboard`)
- [x] `src/commands/dashboard.ts` — live TUI (3s polling + SSE hybrid)
- [x] TODAY'S SAVINGS: hologram + wsmap + pinpoint 합산 이중 바 차트
- [x] LIFETIME ROI & BREAKDOWN: 타입별 절약량 + 추정 비용
- [x] 7-DAY HISTORY: 일별 통합 절약률 + 토큰 범위
- [x] Korean locale auto-detection (LANG/Intl.DateTimeFormat)
- [x] ctx_savings_daily / ctx_savings_lifetime DB 테이블
- [x] 소형 파일(< 10KB)도 분모에 포함하는 정직한 절약률 계산
- [x] wsmap 절약량: 실제 읽기 시점에만 기록 (백그라운드 리빌드 제외)

---

## Released (continued)

### v2.0.0 — Deep Context Engine + Web Dashboard ✅

> Language-agnostic immune system. Four languages. One dashboard. Zero config.

#### N-Depth Reachability (L2/L3 Cross-File Call Graph)
- [x] `traceCallGraph()` — Tree-sitter AST 기반 크로스 파일 심볼 추적 (L2 직접, L3 전이)
- [x] `extractCalledSymbols()` — call_expression + type_identifier + JSX element 탐지
- [x] `extractSignature()` — 단어 경계(`\b`) 매칭으로 정확한 심볼 시그니처 추출
- [x] `[🔗 N-Depth Dependencies]` 섹션 렌더링 — 파일별 그룹핑 + depth 표기

#### Barrel File Resolution
- [x] `resolveBarrelExports()` — index.ts 배럴 파일 re-export 완벽 추적
- [x] Named / Wildcard re-export 지원
- [x] 심볼 → 실제 소스 파일 매핑 + de-duplicate

#### TSX/JSX AST Parsing Stabilization
- [x] `grammar-resolver.ts` — `.tsx`/`.jsx` 확장자에 `tsx` WASM 문법 자동 선택
- [x] JSX 노드 구조 대응: `jsx_self_closing_element`/`jsx_opening_element` 태그명 추출

#### Smart Interceptor (Phase C: Automation)
- [x] `afd_read` 10KB 임계치 자동 홀로그램 반환 (27KB → 921자, 97% 압축)
- [x] `afd_read_raw` 폴백 도구 신설 — 전체 본문 필요 시 명시적 호출
- [x] `tools/call` 응답에서 `cache_control` 전면 제거 (resource 응답만 유지)

#### True Caching (Phase A: MCP Resource)
- [x] `afd://hologram/{path}` MCP 리소스 신설 — 프롬프트 캐싱 활성화
- [x] `cache_control: { type: "ephemeral" }` 리소스 응답에만 적용
- [x] `_knownHologramPaths` 동적 URI 추적 + `list_changed` 알림

#### Honest Metrics (Phase B: Token Estimator)
- [x] `src/core/token-estimator.ts` — 콘텐츠 인식 토큰 추정 엔진 (12개 확장자)
- [x] `chars ÷ 4` 허구 공식 폐기 → 확장자별 보수적 비율 (3.0~4.2)
- [x] 신뢰도 라벨 `confidence: 'heuristic'` 도입

#### Web Dashboard (GET /dashboard)
- [x] **18.7 KB single-file HTML** — 외부 CDN 의존 없는 완전 독립 대시보드
- [x] Phase 1: 토큰 절약량, 7일 히스토리, 면역 이벤트, SSE 실시간 스트림
- [x] Phase 2: Hologram Explorer (파일 탐색 + N-Depth 트리 렌더링)
- [x] Phase 3: i18n 서버 주입 (ko/en 26키), 구문 강조 (4개 언어), 글래스모피즘 UI
- [x] `/files` API: 500파일 하드캡 + depth 4 제한 — 초대형 프로젝트 safe

#### Bug Fixes
- [x] `extractSignature` substring 매칭 버그 — `Button` 검색 시 `ButtonProps` 오매칭 수정
- [x] JSX 컴포넌트 미탐지 — `<Button />`, `<Input />` call graph에서 누락 수정
- [x] `.ts` 파일 TSX 파싱 실패 수정

---

## Future

### v2.x — Next Targets
- [ ] **`afd dashboard --web` CLI flag**: browser auto-launch from terminal command
- [ ] **L3 Transitive Tracing**: 3-depth 전이 추적 실전 검증 및 성능 최적화
- [ ] **Python/Go/Rust N-Depth 실전 검증**: 대형 오픈소스 프로젝트 cross-file call graph 정확도 측정
- [ ] **Dashboard Antibody Viewer**: `afd://antibodies` MCP 리소스와 대시보드 실시간 연동
- [ ] **v2.0.0-dev.2 퍼블리시**: npm 정식 배포
