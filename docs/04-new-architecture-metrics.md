# New Architecture Metrics — Autonomous Flow Daemon (afd)

> Benchmark date: 2026-03-31
> Runtime: Bun 1.3.11 / Windows 10 Pro
> Architecture: S.E.A.M Daemon (Sense → Extract → Adapt → Mutate)

---

## 1. Codebase Size Comparison

| Metric | Old (Node.js/tsup) | New (Bun Daemon) | Delta |
|--------|--------------------:|------------------:|------:|
| Total Files | ~30 | **13** | **-57%** |
| Lines of Code | ~3,700 | **1,208** | **-67%** |
| Dependencies | 12+ (tsup, esbuild, etc.) | **3** (commander, chokidar, typescript) | **-75%** |
| Build Config Files | 3 (tsconfig, tsup, etc.) | **0** | **-100%** |
| Build Step Required | Yes (tsup bundle) | **No** (Bun runs .ts directly) | Eliminated |
| Output Artifacts | dist/ (~8 chunk files) | **None** (source-executed) | Eliminated |

### File Structure (13 files, 4 directories)

```
src/                          LOC
├── cli.ts                     41   # Magic 5 Commands entry
├── constants.ts                7   # Shared paths
├── adapters/
│   └── index.ts               68   # Ecosystem detection (Claude/Cursor)
├── commands/
│   ├── start.ts               41   # Daemon spawn
│   ├── stop.ts                35   # Graceful kill
│   ├── score.ts              135   # Full diagnostic dashboard
│   ├── fix.ts                138   # Diagnose + JSON-Patch + antibody learning
│   └── sync.ts                50   # Vaccine payload export
├── core/
│   ├── db.ts                  30   # SQLite WAL (events + antibodies)
│   ├── hologram.ts           243   # TS AST skeleton extractor
│   └── immune.ts             149   # Dual-format diagnosis engine
└── daemon/
    ├── server.ts             234   # HTTP daemon (9 endpoints)
    └── client.ts              37   # IPC helper
                             ─────
                             1,208 total
```

---

## 2. Performance Benchmarks

### 2.1 Daemon Cold-Start Time

| Run | Time (ms) |
|----:|----------:|
| 1 | 1,794 |
| 2 | 1,714 |
| 3 | 1,734 |
| 4 | 1,698 |
| 5 | 1,745 |
| **Median** | **1,734 ms** |
| **Average** | **1,737 ms** |

> Note: Includes Bun process spawn + SQLite init + chokidar watcher setup + HTTP server bind + port file write + 1,500ms startup wait. Actual daemon ready time is ~200ms; the rest is the verification wait built into the CLI.

### 2.2 Hologram API (Token Savings)

| File | Original | Hologram | Savings | Latency |
|------|----------|----------|--------:|--------:|
| `core/hologram.ts` | 8,425 chars | 1,193 chars | **85.8%** | 70.52ms |
| `daemon/server.ts` | 8,038 chars | 908 chars | **88.7%** | 13.22ms |
| `core/immune.ts` | 3,935 chars | 636 chars | **83.8%** | 3.82ms |
| `commands/score.ts` | 4,898 chars | 905 chars | **81.5%** | 5.53ms |
| `commands/fix.ts` | 4,156 chars | 505 chars | **87.8%** | 5.33ms |
| `adapters/index.ts` | 1,700 chars | 648 chars | **61.9%** | 2.99ms |
| `cli.ts` | 1,010 chars | 292 chars | **71.1%** | 2.45ms |
| **Total** | **32,162 chars** | **5,087 chars** | **84.2%** | — |
| **Average** | — | — | **80.1%** | **14.84ms** |

> First request (hologram.ts) includes TS Compiler API cold-load (~70ms). Subsequent requests average **4.7ms**.

### 2.3 SQLite WAL Latency

| Operation | Runs | Median | Average |
|-----------|-----:|-------:|--------:|
| Write (INSERT antibody) | 10 | **24.84ms** | 31.40ms |
| Read (SELECT all antibodies) | 10 | **0.29ms** | 0.31ms |

> Write latency includes HTTP round-trip + JSON parse + SQLite INSERT. Read is sub-millisecond due to WAL mode's non-blocking reads.

---

## 3. Magic 5 Commands — Execution Times

| Command | Description | Median (ms) | Notes |
|---------|-------------|------------:|-------|
| `afd start` | Spawn daemon | **1,734** | Includes 1,500ms verification wait |
| `afd stop` | Kill daemon | **183** | Graceful HTTP stop + PID cleanup |
| `afd score` | Dashboard | **201** | Fetch all stats + render terminal UI |
| `afd fix` | Diagnose + patch | **177** | Diagnosis + immunity check (no patches needed) |
| `afd sync` | Export vaccine | **203** | Sanitize + write JSON payload |

> All interactive commands (score, fix, sync) respond in under **210ms** — well within the sub-second target.

---

## 4. Daemon REST Endpoints

| Method | Path | Description | Avg Latency |
|--------|------|-------------|------------:|
| GET | `/health` | Liveness check | <1ms |
| GET | `/score` | Full diagnostic stats | <1ms |
| GET | `/hologram?file=<path>` | AST skeleton extraction | ~5ms |
| GET | `/diagnose` | Run symptom detection | <1ms |
| GET | `/antibodies` | List learned patterns | <1ms |
| POST | `/antibodies/learn` | Record new antibody | ~25ms |
| GET | `/sync` | Export vaccine payload | <5ms |
| GET | `/stop` | Graceful shutdown | <1ms |

---

## 5. SQLite Schema

```sql
-- Event tracking (file watcher)
CREATE TABLE events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  type      TEXT NOT NULL,        -- add, change, unlink
  path      TEXT NOT NULL,        -- relative file path
  timestamp INTEGER NOT NULL      -- Unix epoch ms
);

-- Immune system (learned patterns)
CREATE TABLE antibodies (
  id           TEXT PRIMARY KEY,  -- e.g. "IMM-001"
  pattern_type TEXT NOT NULL,     -- missing-file, invalid-json, etc.
  file_target  TEXT NOT NULL,     -- target file path
  patch_op     TEXT NOT NULL,     -- RFC 6902 JSON-Patch array
  created_at   TEXT NOT NULL      -- datetime('now')
);

PRAGMA journal_mode = WAL;        -- Non-blocking concurrent reads
```

---

## 6. Key Efficiency Ratios

| Metric | Value |
|--------|------:|
| LOC reduction | **67%** fewer lines |
| File reduction | **57%** fewer files |
| Dependency reduction | **75%** fewer packages |
| Build step | **Eliminated** |
| Token savings (hologram) | **84.2%** average |
| Command response time | **<210ms** all commands |
| SQLite read latency | **<0.3ms** |
| Ecosystem adapters | **2** (Claude Code, Cursor) |
| Antibody patterns | **3** built-in checks |
