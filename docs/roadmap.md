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
- [x] `src/core/hologram/` 서브모듈 구조 — engine, types, ts-extractor, py-extractor, fallback, incremental
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

---

## Future

### v1.7.0 — Collective Intelligence

#### Team Antibody Federation
- [ ] Remote vaccine store (`afd sync --remote <url>`)
- [ ] Team antibody federation — share learned patterns across repos
- [ ] Antibody versioning and conflict resolution

#### Advanced Evolution
- [ ] Auto-validator generation from quarantine patterns
- [ ] Rule suggestion engine based on failure history
- [ ] Cross-project pattern correlation

### Future Phases

- **MCP Phase 2:** Interactive tools (fix, sync) via MCP
- **MCP Phase 3:** Real-time notifications via MCP protocol
- **Multi-Agent Coordination:** Cross-daemon communication for monorepo setups
- **Plugin System:** Third-party validator and adapter plugins
