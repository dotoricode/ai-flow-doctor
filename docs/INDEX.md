# docs/ Index

> AI entry point: read this file first to navigate the documentation.

## Structure

| Directory | Purpose | Mutability |
|-----------|---------|------------|
| `spec/` | What the system **is** — architecture, CLI, MCP protocol | Updated in-place |
| `adr/` | Why we made key decisions (Architecture Decision Records) | Append-only |
| `release/` | Per-version audits, bugs, post-mortems | Append-only |
| `i18n/` | Translations (mirrors parent structure) | Follows source |

## File Map

### spec/ — System Specification
- [architecture.md](spec/architecture.md) — Module map, S.E.A.M cycle, IPC strategy, SQLite schema, Dynamic Immune Synthesis, performance constraints
- [cli.md](spec/cli.md) — All commands (`start`, `stop`, `restart`, `score`, `fix`, `sync`, `watch`, `doctor`, `diagnose`, `vaccine`, `evolution`, `mcp`, `lang`), flags, exit codes, file layout
- [mcp.md](spec/mcp.md) — MCP stdio protocol: JSON-RPC format, `afd_diagnose` / `afd_score` / `afd_hologram` tools, Claude Code integration

### adr/ — Architecture Decision Records
- [bun-migration-metrics.md](adr/bun-migration-metrics.md) — Node.js/tsup to Bun migration benchmarks (67% LOC reduction, 84% hologram savings)
- [suppression-safety.md](adr/suppression-safety.md) — Double-tap heuristic, mass-event awareness, dormant antibody design

### release/ — Release History
- [v1.0-audit.md](release/v1.0-audit.md) — v1.0.0-rc full S.E.A.M cycle verification, vaccine payload structure
- [v1.2-v1.3-bugs.md](release/v1.2-v1.3-bugs.md) — 15 bugs (8 from v1.2, 7 from v1.3), all fixed, 87 tests passing

### Root
- [roadmap.md](roadmap.md) — Living roadmap: v1.0~v1.3 released, future phases

### i18n/
- [ko/bun-migration-metrics.md](i18n/ko/bun-migration-metrics.md) — Bun migration metrics (Korean)
