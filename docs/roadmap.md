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
- [x] `afd watch` — interactive TUI dashboard (SSE live stream)
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

---

## Future

### v1.4.0 (Planned)

#### Collective Intelligence
- [ ] Remote vaccine store (`afd sync --remote <url>`)
- [ ] Team antibody federation — share learned patterns across repos
- [ ] Antibody versioning and conflict resolution

#### Advanced Evolution
- [ ] Auto-validator generation from quarantine patterns
- [ ] Rule suggestion engine based on failure history
- [ ] Cross-project pattern correlation

#### Performance
- [ ] Tree-sitter integration for non-TS/JS semantic diff
- [ ] Incremental hologram (diff-only updates)
- [ ] Watcher event batching for high-churn directories

### Future Phases

- **MCP Phase 2:** Interactive tools (fix, sync) via MCP
- **MCP Phase 3:** Real-time notifications via MCP protocol
- **Multi-Agent Coordination:** Cross-daemon communication for monorepo setups
- **Plugin System:** Third-party validator and adapter plugins
