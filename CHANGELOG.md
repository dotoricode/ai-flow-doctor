# Changelog

All notable changes to **afd** are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [2.0.0-dev.1] - 2026-04-04 — "Deep Context Engine"

> afd becomes language-agnostic. Four languages. One immune system.

### Added

- **Polyglot N-Depth Reachability** — cross-file call graph tracing for TS/JS, Python, Go, Rust
  - Language-aware import resolvers: `from X import Y`, `import "pkg"`, `use crate::X`
  - AST-based called-symbol extraction per language (Tree-sitter)
  - `grammar-resolver.ts`: `detectLang()` auto-dispatches parser by extension
  - Python: `__init__.py` package resolution, dotted module paths
  - Go: package directory scanning, exported symbol matching (capitalized)
  - Rust: `mod.rs` convention, `super::`/`crate::` path resolution
- **`afd setup`** — interactive one-command project configuration
  - Y/n per step: daemon start → MCP register → CLAUDE.md inject → health check
  - CLAUDE.md block teaches Claude to prefer `afd_read`/`afd_hologram`/`workspace-map`
  - Bilingual (EN/KO), idempotent (auto-skips already-configured steps)
- **Responsive Dashboard TUI** — terminal-adaptive fullscreen layout
  - Alt Screen Buffer (`\x1b[?1049h`) for clean fullscreen/restore
  - 2-pass rendering: build sections → trim to fit `rows × cols`
  - Windows/Warp: 1s PowerShell size polling (SIGWINCH fallback)
  - Min-width 50 cols, progressive section collapse on short terminals
- **npm Scoped Package** — published as `@dotoricode/afd`
  - `npx @dotoricode/afd setup` works out of the box

### Fixed

- MCP install on Windows: `cmd /c npx` wrapper
- Hook command fallback: `bunx`/`npx` → `@dotoricode/afd`
- `rule-suggestion` test: disk SQLite → `:memory:` + indexes (6.85s → 245ms)

### Meta

- **217/217 tests passing** (zero-defect)
- Build size: 138 KB (tarball)

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
