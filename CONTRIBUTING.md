# Contributing to afd

Welcome. **afd** is built on one principle: a single `afd start` should make any AI coding environment self-healing. If you share that goal, you belong here.

---

## Vision Roadmap

| Version | Codename | Goal |
|---------|----------|------|
| v1.0.0 | The Immortal Flow | Stable S.E.A.M core, suppression safety, Magic 5 |
| v1.3.0 | The Immune Memory | Quarantine zone, self-evolution, hologram pipeline, MCP integration |
| v1.5.0 | Trust-Builder | Hologram L1, mistake history injection, HUD defense counter |
| v1.6.0 | Hook Manager | Multi-owner hook orchestration (afd → omc → user ordering) |
| v2.0.0 | Self-Healing Workspace | Tree-sitter L2/L3 reachability, autonomous zero-intervention coding |

If you are contributing toward v2 or v3, please open a discussion issue first to align on scope.

---

## Getting Started

**Prerequisites:** [Bun](https://bun.sh) >= 1.1.0

```bash
git clone https://github.com/dotoricode/afd
cd afd
bun install
bun test          # all tests must be green before any PR
```

---

## Architecture Constraints

These are non-negotiable (see `CLAUDE.md`):

1. **Bun only** — no Node.js, no npm, no tsup. Use Bun APIs exclusively.
2. **SQLite in WAL mode** — all file events must be persisted within 100ms.
3. **Crash-only** — no complex recovery logic. Panic cleanly, restart on next call.
4. **Hologram-first** — when passing code to AI, strip comments and bodies. Skeletons only.
5. **Quarantine before heal** — always backup corrupted state to `.afd/quarantine/` before restoring.
6. **Cross-platform paths** — normalize `\` to `/` when comparing paths against maps or configs.
7. **S.E.A.M performance budget** — the full Sense → Extract → Adapt → Mutate cycle must complete in **< 270ms**. Single-file detection must be < 100ms. Any new code in the hot path requires a benchmark. Never add synchronous DB calls to the S.E.A.M cycle.
8. **HUD endpoint budget** — `/mini-status` must respond in **< 200ms**. Read from in-memory state, not from SQLite, for HUD data.

---

## Development Workflow

```bash
bun run dev                    # run CLI directly
bun test                       # run E2E suite
bun run src/cli.ts start       # start daemon in foreground
bun run src/cli.ts start --mcp # start in MCP stdio mode
bun run src/cli.ts doctor      # comprehensive health analysis
```

- All new features must include a test in `tests/`.
- S.E.A.M cycle changes require updating `docs/` accordingly.
- Suppression logic changes require updating `docs/adr/suppression-safety.md`.
- New CLI commands must be registered in `src/cli.ts` and documented in README.md + README.ko.md.

---

## Antibody-Driven Development

afd follows an **antibody-driven development** workflow for immune system changes:

1. **Reproduce** — Trigger the failure scenario and confirm afd detects and records it in `mistake_history`
2. **Inspect** — Run `afd diagnose --format a2a` on the affected file; verify `pastMistakes` appears in the output
3. **Fix** — Modify the rule or antibody; the daemon hot-reloads changes
4. **Verify** — Confirm the scenario no longer triggers the mistake record, or that the record now prevents recurrence
5. **Benchmark** — Run the S.E.A.M cycle benchmark to confirm < 270ms is maintained

```bash
# Check mistake history for a file
curl "http://localhost:<port>/mistake-history?file=src/core/db.ts"

# Run full diagnosis with mistake injection
afd diagnose --format a2a src/core/db.ts

# Benchmark S.E.A.M cycle
bun test tests/perf/
```

When adding or modifying immune rules (`.afd/rules/*.yml`), always:
- Include a test case in `tests/` that triggers the rule
- Verify the rule fires within the single-file 100ms budget
- Document the failure pattern in the PR description

---

## Pull Request Guidelines

- One concern per PR.
- Title format: `type: short description` (Conventional Commits).
- All E2E tests must pass (`bun test`).
- If adding a new Magic command, update `README.md`, `README.ko.md`, and `CHANGELOG.md`.

---

## Code of Conduct

Be direct. Be kind. No bloat. The daemon never stops — neither do we.
