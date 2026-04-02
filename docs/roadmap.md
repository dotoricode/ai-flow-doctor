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

### v1.6.1 — Hologram Precision Engine

#### Smart Bypass (순수 타입 파일 우회)
- [x] `isPureTypeFile()`: 최상위 AST 노드 타입만 O(n) 스캔 → 구현부 없는 파일 즉시 반환
- [x] 판정 기준: `type_alias_declaration`, `interface_declaration`, `export_statement`(선언형만) 조합
- [x] 1~2ms 이내 판정 보장 (깊은 트리 탐색 없음)
- [x] 순수 타입 파일 절감률 0% — 압축 불필요 파일에 연산 낭비 제거

#### L1 Symbol Extraction (심볼 핀셋 추출)
- [x] `HologramOptions`에 `symbols?: string[]` 파라미터 추가
- [x] `getDeclarationName()`: export 래핑 언래핑 포함 범용 심볼명 추출
- [x] 지정 심볼만 AST에서 핀셋 추출 — 전체 홀로그램 대신 필요한 선언만 반환
- [x] `afd_read` MCP 스키마에 `symbols` 파라미터 추가 (선택적, 완전 하위 호환)
- [x] 파일 크기와 무관하게 심볼 지정 시 즉시 추출 모드 진입
- [x] 검증: `DaemonState` 단독 조회 → 10.8% → **78.8%** 절감 (7.3배 향상)

#### Bug Fixes
- [x] `mistakeCache` warm-up 경로 정규화 — Windows 백슬래시 → 포워드 슬래시

### v1.6.2 — Go Language Support

#### Go Extractor
- [x] `src/core/hologram/go-extractor.ts` — tree-sitter-go WASM 기반 Go 파싱
- [x] 추출 대상: package, import, type(struct/interface/alias), func, method(receiver)
- [x] struct 필드 전체 보존, interface method_elem 직접 추출
- [x] 9개 테스트 (`test/hologram-go.test.ts`) 추가, 전체 154/154 통과
- [x] `tree-sitter-go@0.25.0` dependencies에 추가

#### Architecture Decisions (Open Questions Resolved)
- [x] `mistake_type` 저장 언어 결정 — English enum in DB, Korean at HUD render layer
- [x] HUD defense count reset 정책 결정 — in-memory session-scoped, lifetime stats via `afd score`
- [x] `mistake_history` 보존 기간 결정 — 90일 (`db.ts:97` purge threshold 30d → 90d)
- [x] Barrel file L1 support 결정 — defer to v2.0, current L0 fallback is final for v1.x
- [x] `file_path` 정규화 전략 결정 — workspace-relative POSIX forward-slash (`src/core/db.ts`)
- [x] `.omc/plans/afd-v1.5-trust-builder.md` 체크박스 전체 동기화 (23개 `[x]`, plan↔roadmap 완전 일치)

### v1.6.3 — Rust Language Support

#### Rust Extractor
- [x] `src/core/hologram/rust-extractor.ts` — tree-sitter-rust WASM 기반 Rust 파싱
- [x] 추출 대상: use, mod, struct(fields), enum(variants), trait(signatures), type alias, impl(method stubs), fn
- [x] impl Trait for Type 및 generic impl 헤더 정확 추출
- [x] 11개 테스트 (`test/hologram-rust.test.ts`) 추가, 전체 165/165 통과
- [x] `tree-sitter-rust@0.24.0` dependencies에 추가
- [x] 기존 `.rs` L0 fallback 테스트 → `.xyz` unknown extension으로 교정

---

## Future

### v1.7.0 — Collective Intelligence ✅ Released 2026-04-03

#### Team Antibody Federation
- [x] Remote vaccine store (`afd sync --remote <url>`)
- [x] Team antibody federation — share learned patterns across repos
- [x] Antibody versioning and conflict resolution

#### Advanced Evolution
- [x] Auto-validator generation from quarantine patterns
- [x] Rule suggestion engine based on failure history
- [x] Cross-project pattern correlation (`afd correlate`, `afd suggest --cross`)

### v1.8.0 — Ecosystem Expansion ✅ Released 2026-04-03

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

### Future Phases (Unscheduled)

- **MCP Phase 3:** Real-time notifications via MCP protocol
- **Dashboard UI:** Web-based real-time antibody + mistake_history viewer
