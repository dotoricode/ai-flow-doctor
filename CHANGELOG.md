# Changelog

All notable changes to **afd** are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [2.0.0] - 2026-04-04 — "Deep Context Engine"

> Language-agnostic immune system. Four languages. One dashboard. Zero config.

afd 2.0은 AI 코딩 에이전트를 위한 자가 치유 환경의 완성판입니다. 면역 시스템이 TypeScript를 넘어 Python, Go, Rust까지 동일한 깊이로 이해하며, 크로스 파일 종속성을 3-depth까지 추적합니다. 프리미엄 웹 대시보드는 CDN도 빌드 도구도 없이 단일 HTML 파일 하나로 동작합니다. 토큰 절약은 더 이상 추정이 아닌 실측에 가까운 정직한 지표로 제공됩니다.

### Added

#### Deep Context Engine — 다국어 N-Depth 종속성 추적
- **4개 언어 완전 지원**: TypeScript/JavaScript, Python, Go, Rust — Tree-sitter WASM 기반 AST 파싱
- `traceCallGraph()` — 크로스 파일 심볼 추적 (L2 직접 참조, L3 전이 참조)
- `extractCalledSymbols()` — call_expression, type_identifier, JSX element 탐지 (언어별 분기)
- `extractSignature()` — 단어 경계(`\b`) 매칭으로 `Button` ≠ `ButtonProps` 오매칭 근절
- `grammar-resolver.ts` — 확장자 기반 WASM 문법 자동 선택, TSX/JSX 완벽 대응
- 배럴 파일(index.ts) 해석: named + wildcard re-export를 실제 소스 파일까지 추적

#### True Caching — Anthropic 프롬프트 캐싱 달성
- `afd://hologram/{path}` MCP 리소스 신설 — `resources/read` 응답에 `cache_control: { type: "ephemeral" }` 적용
- 동일 파일 재조회 시 Anthropic 서버가 캐시된 홀로그램을 재사용 → **실제 API 비용 절감**
- `tools/call` 응답의 무의미한 `cache_control` 전면 제거 — 리소스 응답에서만 유효하게 적용
- `_knownHologramPaths` 동적 URI 추적 + `notifications/resources/list_changed` 자동 발송

#### Smart Interceptor — 자동 토큰 절약
- `afd_read` 10KB 초과 파일 → 홀로그램 자동 반환 (97% 압축, 27KB → 921자)
- `afd_read_raw` 폴백 도구 신설 — 전체 본문이 정말 필요할 때만 명시적 호출
- 가이드 메시지가 `startLine/endLine`, `afd_read_raw`, `afd://hologram` 리소스 세 가지 옵션을 동적 안내

#### Honest Metrics — 정직한 토큰 추정 엔진
- `src/core/token-estimator.ts` — 12개 확장자별 보수적 chars/token 비율 (3.0~4.2)
- `chars ÷ 4` 허구 공식 완전 폐기 → 콘텐츠 인식 휴리스틱으로 교체
- `confidence: 'heuristic'` 신뢰도 라벨 도입 — 대시보드 수치의 근거를 투명하게 공개
- HTTP 엔드포인트(`/mini-status`, `/score`, `/shift-summary`)가 매 요청마다 DB에서 fresh하게 읽도록 수정 — MCP ↔ HTTP 프로세스 격리로 인한 메트릭 정체 현상 해소

#### Premium Web Dashboard
- **단일 HTML 파일** — 외부 CDN 없이 완전 독립 동작
- **Tab 1 – Overview**: 오늘의 절약량 이중 바 차트, 누적 ROI 내역, 7일 히스토리 그리드, 면역 이벤트 로그, SSE 실시간 스트림
- **Tab 2 – Hologram Explorer**: 파일 트리 검색, 구문 강조 스켈레톤 뷰어, N-Depth 종속성 트리 렌더링
- **i18n**: 서버 사이드 `window.T` 주입 (26개 번역 키, ko/en 자동 감지)
- **구문 강조**: TypeScript, Python, Go, Rust 4개 언어 regex-lite 엔진 (런타임 의존 없음)
- **글래스모피즘 UI**: CSS variable 시스템, `backdrop-filter`, GitHub Dark 팔레트
- **대형 프로젝트 안전**: `/files` API 500파일 하드캡 + depth ≤ 4

#### Zero-Friction DX — 마찰 없는 개발자 경험
- **`afd web`** — OS 기본 브라우저로 대시보드 자동 오픈 (1초 데몬 대기 → 즉시 오픈)
- **고정 포트 51831** — 매번 달라지던 포트 대신 예측 가능한 고정 주소 (`localhost:51831/dashboard`)
- **데몬 워치독** — `daemonRequest()` 3회 재시도 (1초 간격), 일시적 데몬 재시작에도 연결 안정
- **`afd setup`** — 대화형 원커맨드 설정 (Y/n 4단계: 데몬 → MCP → CLAUDE.md → 헬스체크)
- **`@dotoricode/afd`** npm 스코프 패키지 — `npx @dotoricode/afd setup` 어디서든 즉시 실행

### Fixed

- `extractSignature` substring 오매칭 — `Button` 검색 시 `ButtonProps` 미끼 결과 제거
- JSX 컴포넌트 미탐지 — `<Button />`, `<Input />` call graph 정상 추적
- `.ts` 파일 TSX 파싱 실패 — `tsx` WASM 문법 자동 적용
- Windows MCP 설치 — `cmd /c npx` 래퍼로 Claude Code 호환성 확보
- Hook command 폴백 — `bunx`/`npx`가 `@dotoricode/afd`를 정확히 호출
- `rule-suggestion` 테스트 타임아웃 — 디스크 SQLite → 인메모리 + 인덱스 (6.85s → 245ms)
- `afd setup` 데몬 체크 — `isDaemonAlive()` `await` 누락 + 인자 미전달로 항상 truthy 반환, 데몬 시작 건너뜀
- 메트릭 정체 — HTTP 데몬이 인메모리 캐시 대신 매번 DB에서 읽도록 수정 (MCP 프로세스 격리 문제)

### Meta

- **217/217 tests passing** — zero-defect
- **151.5 KB** tarball, 77 files
- **고정 포트** 51831 (OS 할당 폴백)
- **대시보드** 단일 HTML (Phase 1–3 complete)

---

## [1.10.0] - 2026-04-04 — "Polyglot Shield"

> Multi-language N-Depth, responsive dashboard, and one-command setup.

### Added

- **Multi-language N-Depth Reachability**: Python, Go, Rust cross-file call graph tracing (L2/L3)
  - Python: `from X import Y`, `__init__.py` package resolution
  - Go: `import "./pkg"`, package directory scanning, exported symbol matching
  - Rust: `use path::symbol`, `mod.rs` convention, crate root detection
  - Language-aware `extractCalledSymbols` + `extractSignature` for all 4 languages
  - `grammar-resolver.ts`: `detectLang()` + extension-to-grammar mapping
  - 7 new polyglot tests (all green)
- **`afd setup` command**: interactive one-command project configuration
  - Step-by-step with Y/n confirmation: daemon start, MCP registration, CLAUDE.md injection, health check
  - Auto-skips already-configured steps
  - Bilingual (EN/KO)
  - CLAUDE.md injection teaches Claude to use `afd_read`/`afd_hologram`/`workspace-map`

### Changed

- **Responsive Dashboard TUI**: terminal-adaptive layout with Alt Screen Buffer
  - Dynamic width/height from `process.stdout.columns`/`rows`
  - 2-pass rendering: build all sections, then trim to fit terminal height
  - Alt Screen (`\x1b[?1049h`) for fullscreen TUI — clean restore on exit
  - Windows/Warp fallback: 1s PowerShell size polling (SIGWINCH unreliable)
  - Min-width 50 cols fallback message

### Fixed

- **MCP install on Windows**: `cmd /c npx` wrapper for Claude Code compatibility
- **Hook command fallback**: `bunx`/`npx` now invokes `@dotoricode/afd` (not bare `afd`)
- **rule-suggestion test timeout**: disk SQLite → in-memory + indexes (6.85s → 245ms)

---

## [1.9.3] - 2026-04-04 — "Public Launch"

> The daemon goes public. `@dotoricode/afd` is now on npm.

### Changed

- **npm Scoped Package**: renamed from `autonomous-flow-daemon` to `@dotoricode/afd`
- **bin/afd.js**: node shim wrapper that delegates to `bun run` — compatible with `npx` execution
- **Hook command fallback**: `bunx`/`npx` now invokes `@dotoricode/afd` instead of bare `afd`

---

## [1.9.0] - 2026-04-03 — "Notification Mesh"

> Push-based real-time MCP notifications and a token savings dashboard.

### Added

- **MCP Phase 3 — Push-based Notifications**
  - `SubscriptionManager` module for URI-based resource subscriptions
  - `resources/subscribe` / `resources/unsubscribe` handlers
  - `notifications/resources/updated` dispatcher for `afd://antibodies`, `afd://quarantine`, `afd://events`, `afd://history/{path}`
  - `notifications/message` (level: warning) on auto-heal completion
  - `notifications/resources/list_changed` on dynamic resource creation

- **Token Dashboard (`afd dashboard`)**
  - Live TUI with 3-second polling + SSE hybrid
  - TODAY'S SAVINGS: hologram + wsmap + pinpoint combined bar chart
  - LIFETIME ROI & BREAKDOWN: per-type savings + estimated cost
  - 7-DAY HISTORY: daily savings rate + token range
  - `ctx_savings_daily` / `ctx_savings_lifetime` DB tables

---

## [1.8.0] - 2026-04-03 — "Ecosystem Expansion"

> Interactive MCP tools, multi-agent coordination, and a plugin system.

### Added

- **MCP Phase 2 — Interactive Tools**: `afd_suggest`, `afd_fix`, `afd_sync` MCP tools + `afd://antibodies` resource
- **Multi-Agent Coordination**: cross-daemon HTTP bridge, shared antibody namespace (`afd sync --local-mesh`), concurrent write arbitration
- **Plugin System**: `.afd/plugins/*.json` manifest, `ValidatorPlugin` adapter API, `afd plugin install`

---

## [1.7.0] - 2026-04-02 — "Collective Intelligence"

> Precision hologram engine, Go/Rust language support, and team antibody federation.

### Added

- **Hologram Precision Engine**: `isPureTypeFile()` O(n) scan, `symbols` parameter for pinpoint extraction, `getDeclarationName()` for generic symbol name resolution
- **Go Language Support**: `go-extractor.ts` — package, import, type, func, method extraction via tree-sitter-go WASM
- **Rust Language Support**: `rust-extractor.ts` — use, mod, struct, enum, trait, impl, fn extraction via tree-sitter-rust WASM
- **Team Antibody Federation**: remote vaccine store, cross-repo pattern sharing, antibody versioning
- **Advanced Evolution**: auto-validator generation, rule suggestion engine, cross-project correlation (`afd correlate`, `afd suggest --cross`)

### Fixed

- `mistakeCache` warm-up path normalization on Windows (backslash → forward slash)

---

## [1.6.0] - 2026-04-02 — "Hook Manager"

> Multi-owner hook orchestration and a rewritten hologram engine.

### Added

- **Multi-Owner Hook Orchestration**: `HookOwner` model with zone classification, ownership-aware merge engine, conflict detection, `afd hooks status/sync`
- **Hologram Engine Overhaul**: tree-sitter (web-tree-sitter WASM) replaces TS compiler API, multilingual support (TS/JS full, Python/Go/Rust fallback)
- **Incremental Hologram**: LCS-based diff-only mode with 270ms budget guard
- **Event Batching**: 300ms debounce + dedup, immune file fast-path, add+unlink cancellation

### Fixed

- P0: `autoHealFile` path traversal vulnerability — `assertInsideWorkspace` guard
- P0: `pick()` empty array crash defense
- P1: validator dynamic import module cache leak
- P1: `unlink` event `watchedFiles` Set leak
- P1: hologram migration `db.transaction()` atomicity

---

## [1.5.0] - 2026-04-02 — "Trust-Builder"

> The immune system now speaks. Three pillars that make afd's defenses visible, self-improving, and smarter.

### Added

- **Hologram L1 — Import-Based Semantic Compression**
  - New optional `contextFile` parameter on `afd_hologram` MCP tool and `/hologram` HTTP endpoint
  - `extractImportedSymbols()` function: regex fast-path parsing of named imports, default imports, and namespace imports from the context file
  - L1 filtering in `generateHologram()`: directly imported symbols receive full type signatures; non-imported exports are reduced to name-only stubs with guide text `// details omitted — read directly if needed`
  - Namespace imports (`import * as X`) trigger full L0 hologram (safe default, no false filtering)
  - Silent fallback to L0 when `contextFile` is missing, unreadable, or yields zero import results
  - Compression target: 85%+ with contextFile (vs ~80% L0 baseline)
  - L1 is MCP/HTTP path only — S.E.A.M hot path remains L0 to protect the 270ms budget

- **Antibody Passive Defense — Mistake History Injection**
  - New `mistake_history` SQLite table: `file_path`, `mistake_type`, `description` (max 200 chars), `antibody_id`, `timestamp`
  - Indexes on `file_path` and `timestamp` for sub-millisecond query performance
  - Write-through cache: `mistakeCache: Map<string, MistakeEntry[]>` loaded on daemon startup, updated on every insert
  - Per-file cap of 5 most recent entries enforced at write time
  - 30-day TTL purge on daemon startup (consistent with `telemetry` table pattern)
  - Direct DB insert on auto-heal events (not via HTTP POST): records `mistake_type` from `symptom.patternType` and `description` from `symptom.title`
  - New GET `/mistake-history?file=<path>` HTTP endpoint (returns max 5 entries, most recent first)
  - `pastMistakes` field injected into `afd diagnose --format a2a` output on both the healthy path (proactive warning) and the auto-heal path (reactive)
  - `pastMistakes` is omitted entirely when no history exists (zero token overhead)
  - Path normalization: `file_path` stored with forward slashes (cross-platform safe)

- **HUD Defense Counter + Reasons**
  - `/mini-status` endpoint enhanced with `total_defenses: number` and `defense_reasons: string[]` (in-memory only, no DB query — always under 200ms)
  - `defense_reasons` derived from in-memory `state.autoHealLog` (capped at 100 entries), returning up to 3 most recent unique `mistake_type` values
  - Status bar format: `[afd] {N}건 방어 ({reason1}, {reason2}, ...)` when defenses exist; `[afd] ON` when none
  - Existing `healed_count` and `last_healed` fields preserved for backward compatibility

### Fixed

- **Windows path normalization in `assertInsideWorkspace()`**: backslash (`\`) separators in Windows paths are now normalized to forward slashes before workspace boundary checks, fixing false-positive "outside workspace" errors on Windows

---

## [1.0.0] - 2026-03-31 — "The Immortal Flow"

> [afd] 🛡️ AI agent deleted '.claudeignore' | 🩹 Self-healed in 184ms | Context preserved.

**Zero-config immunity for your AI development flow.**

### Phase 1–3: Core S.E.A.M Engine & Magic 5 Commands

- Introduced the **S.E.A.M Cycle** (Scan → Evaluate → Act → Monitor) as the central execution loop
- Implemented the **Magic 5 Commands**: `start`, `stop`, `score`, `fix`, `sync`
- Built `src/core/db.ts`: WAL-mode SQLite for sub-100ms file event persistence
- Built `src/core/hologram.ts`: AST-based skeleton extraction for token-efficient AI handoff
- Built `src/core/immune.ts`: Immune tolerance heuristics — suppression logic for noisy events
- Implemented `src/daemon/server.ts` and `src/daemon/client.ts`: Unix socket IPC for daemon ↔ CLI communication
- Chokidar-backed file watcher with 100ms debounce in `src/daemon/server.ts`

### Phase 4–5: Multilingual UI & Status Line Integration

- Added bilingual terminal UI (EN/KO) with chalk-based color output
- Integrated **Status Line** hook injection for Claude Code, Cursor, and Copilot adapters
- Added adapter layer (`src/adapters/`) for ecosystem-specific configuration
- Published `README.md` (English) and `README.ko.md` (Korean) with full documentation

### Phase 6a–6b: Suppression Safety — Double-Tap & Mass-Event Logic

- Added **Double-Tap suppression**: prevents re-triggering the same file within the cooldown window
- Added **Mass-Event suppression**: drops bulk filesystem events (threshold: ≥ 5 files / 500ms) to prevent runaway AI calls
- Added configurable `suppressionCooldownMs` and `massEventThreshold` / `massEventWindowMs`
- Full E2E safety suite: 9 tests across suppression scenarios — all green
- Published `docs/06-suppression-safety-audit.md` and `docs/05-release-audit.md`

---

## [0.1.0] - 2026-01-01 — Initial prototype

- Project scaffold with Bun runtime
- Basic CLI skeleton and daemon concept
