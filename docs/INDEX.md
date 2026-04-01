# docs/ Index

> AI entry point: read this file first to navigate the documentation.

## Structure

| Directory | Purpose | Mutability |
|-----------|---------|------------|
| `spec/` | What the system **is** — architecture, CLI, MCP protocol | Updated in-place |
| `adr/` | Why we made key decisions (Architecture Decision Records) | Append-only |
| `release/` | Per-version audits, bugs, post-mortems | Append-only |
| `ideas/` | Pre-ADR idea pool — draft → review → accept/reject | Living (채택 시 ADR 승격) |
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

### bug-report/ — Bug Audit Reports
- [AUDIT-GUIDE.md](bug-report/AUDIT-GUIDE.md) — Audit process, severity criteria, tag system
- [2026-04-01-full-audit.md](bug-report/2026-04-01-full-audit.md) — Full codebase audit: 67 findings (5 critical, 15 high, 28 medium, 19 low)

### ideas/ — Idea Pool (Pre-ADR)
- [README.md](ideas/README.md) — 카테고리 구조, 상태 라벨, 워크플로우
- [scoring/s-rank-immune-maturity.md](ideas/scoring/s-rank-immune-maturity.md) — S 랭크: 면역 성숙도 기반 최고 등급 설계
- [scoring/feature-usage-telemetry.md](ideas/scoring/feature-usage-telemetry.md) — 기능별 사용 빈도 측정 (개발자용 로컬 텔레메트리)

### Root
- [roadmap.md](roadmap.md) — Living roadmap: v1.0~v1.3 released, future phases

### i18n/
- [ko/bun-migration-metrics.md](i18n/ko/bun-migration-metrics.md) — Bun migration metrics (Korean)
