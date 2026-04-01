# Architecture Overview

> afd 프로젝트의 전체 아키텍처와 핵심 설계 원칙을 기술한다.

---

## 1. System Diagram

```
┌─────────────────────────────────────────────────────────┐
│                      User / AI Agent                    │
│              afd start | stop | restart | score | fix   │
└───────────────────┬─────────────────────────────────────┘
                    │ spawn / HTTP IPC
┌───────────────────▼─────────────────────────────────────┐
│                  afd Daemon (server.ts)                  │
│  ┌────────┐  ┌─────────┐  ┌───────┐  ┌──────────┐      │
│  │ Sense  │→ │ Extract │→ │ Adapt │→ │  Mutate  │      │
│  │chokidar│  │hologram │  │ learn │  │auto-heal │      │
│  └────────┘  └─────────┘  └───────┘  └──────────┘      │
│       │           │            │           │            │
│       ▼           ▼            ▼           ▼            │
│  ┌──────────────────────────────────────────────┐       │
│  │          SQLite (bun:sqlite, WAL)            │       │
│  │  events │ antibodies │ unlink_log │ hologram │       │
│  └──────────────────────────────────────────────┘       │
│       │                                                 │
│  ┌────▼─────┐  ┌───────────┐  ┌──────────────────┐     │
│  │ SSE      │  │ Dynamic   │  │ Ecosystem        │     │
│  │ /events  │  │ Validators│  │ Adapters         │     │
│  └──────────┘  └───────────┘  └──────────────────┘     │
└─────────────────────────────────────────────────────────┘
        │ HTTP                        │ Hook injection
        ▼                             ▼
  ┌───────────┐              ┌─────────────────┐
  │ CLI       │              │ .claude/hooks   │
  │ score,fix │              │ .mcp.json       │
  │ watch,sync│              │ statusline      │
  └───────────┘              └─────────────────┘
```

---

## 2. Core Modules

### 2.1 Daemon (`src/daemon/`)

| File | Purpose |
|------|---------|
| `server.ts` | Main daemon process: chokidar file watcher, HTTP IPC server (dynamic port), SSE event stream, S.E.A.M cycle engine, MCP stdio mode, dynamic validator loader |
| `client.ts` | Daemon discovery via `.afd/daemon.pid` + `.afd/daemon.port` files; health check via `/health` endpoint; stale PID detection |

### 2.2 Commands (`src/commands/`)

| File | Command | Purpose |
|------|---------|---------|
| `start.ts` | `afd start` | Spawn detached daemon, poll for readiness, auto-provision ecosystem integrations |
| `stop.ts` | `afd stop` | Graceful shutdown via `/stop`, print shift summary, optional `--clean` rollback |
| `restart.ts` | `afd restart` | Sequential stop + start |
| `score.ts` | `afd score` | Fetch `/score` and render TUI dashboard with guardian grade |
| `fix.ts` | `afd fix` | Interactive diagnosis + JSON-Patch application + antibody learning |
| `sync.ts` | `afd sync` | Export/import antibodies for team sharing |
| `watch.ts` | `afd watch` | Real-time TUI dashboard via SSE `/events` stream |
| `diagnose.ts` | `afd diagnose` | Headless diagnosis for hook automation (`--auto-heal`) |
| `doctor.ts` | `afd doctor` | Deep health analysis with rule-based grading (A+ to D) |
| `vaccine.ts` | `afd vaccine` | Vaccine registry: list, search, install, publish |
| `evolution.ts` | `afd evolution` | Quarantine failure analysis → lesson generation |
| `mcp.ts` | `afd mcp` | Register/unregister daemon as MCP server |
| `lang.ts` | `afd lang` | Show or change display language (en, ko) |

### 2.3 Core (`src/core/`)

| File | Purpose |
|------|---------|
| `db.ts` | SQLite initialization via `bun:sqlite` in WAL mode; table creation + schema migrations |
| `immune.ts` | Re-exports rule engine; defines `Symptom`, `DiagnosisResult`, `PatchOp` types |
| `rule-engine.ts` | Loads built-in + YAML-based diagnostic rules from `.afd/rules/*.yml` |
| `hologram.ts` | TypeScript AST-based file summarizer; strips function bodies, keeps type signatures |
| `semantic-diff.ts` | AST-aware diff engine; `semanticDiff()` detects breaking vs. non-breaking changes |
| `boast.ts` | Heal metrics calculation, "boastful doctor" persona log formatting, shift summary |
| `discovery.ts` | Smart discovery: scans beyond static `WATCH_TARGETS` for AI-context files |
| `evolution.ts` | Quarantine management; failure pattern analysis; `evolve()` promotes patterns to antibodies |
| `vaccine-registry.ts` | Portable antibody payload import/export across workspaces |
| `config.ts` | Per-workspace `.afd/config.yml` loader |
| `locale.ts` | System locale detection and persistence |
| `log-utils.ts` | `formatTimestamp()`, `lineDiff()` helpers |
| `log-rotate.ts` | Log rotation when `.afd/daemon.log` exceeds 5MB (keeps 3 backups) |
| `lru-map.ts` | Byte-capped LRU map for in-memory file snapshot cache (10 MB cap) |
| `notify.ts` | Desktop notification dispatch on heal events (macOS/Linux/Windows) |
| `workspace.ts` | `findWorkspaceRoot()` — walks up directory tree to locate workspace root |
| `yaml-minimal.ts` | Minimal YAML parser (no external dep) for rule files |
| `i18n/messages.ts` | Localized message strings (en/ko) with template interpolation |

### 2.4 Adapters (`src/adapters/`)

| Adapter | Detection | Capabilities |
|---------|-----------|-------------|
| `ClaudeCodeAdapter` | `.claude/` dir or `CLAUDE.md` | Hook injection, MCP registration, StatusLine config, removal |
| `CursorAdapter` | `.cursorrules` or `.cursor/` | Hook injection |
| `WindsurfAdapter` | `.windsurfrules` or `.windsurf/` | Hook injection |
| `CodexAdapter` | `codex.md` or `.codex/` | Hook injection |

All adapters implement the `EcosystemAdapter` interface. `detectEcosystem(cwd)` returns all matching adapters with `"primary"` / `"secondary"` confidence.

### 2.5 Platform (`src/platform.ts`)

Cross-platform abstraction for:
- `detachedSpawnOptions()` — Platform-specific options for daemon child process
- `resolveHookCommand()` — Resolves `afd` → `bunx` → `npx` fallback chain
- `IS_WINDOWS` — Platform detection constant

---

## 3. S.E.A.M Cycle

The daemon continuously runs the **S.E.A.M** (Sense → Extract → Adapt → Mutate) cycle for every file change event.

### 3.1 Sense

- **File Watcher:** `chokidar` watches all targets discovered by Smart Discovery
- **Events:** `add`, `change`, `unlink`, `addDir`, `unlinkDir`
- **Guards:** Ignores `.afd/` internal paths and self-writes (debounced 100ms)
- **Snapshot:** On `add`, captures file content into LRU memory cache
- **Diff:** On `change`, computes semantic diff (AST for TS/JS) or text diff against snapshot

### 3.2 Extract

- **Hologram Generation:** Strips function bodies, keeps type signatures (80%+ token savings)
- **Antibody Lookup:** Checks if changed file is immune-critical (`.claudeignore`, `.claude/hooks.json`, `CLAUDE.md`)
- **Context Enrichment:** Diagnose endpoint enriches symptoms with hologram context

### 3.3 Adapt

- **Auto-Seed:** On startup, seeds antibodies for all existing immune-critical files
- **Re-Seed:** On normal change to immune files, updates stored antibody content
- **Corruption Detection:** Detects empty files, invalid JSON, 90%+ content reduction
- **Dynamic Validators:** Custom `.afd/validators/*.js` scripts hot-reloaded via `fs.watch`
- **Dormant Transitions:** Double-tap detection marks antibodies as dormant (user intent)

### 3.4 Mutate

- **Auto-Heal (unlink):** Restores deleted immune files from stored antibody patches
- **Auto-Heal (corruption):** Reverts silently corrupted files from memory snapshot
- **Quarantine:** Saves corrupted content to `.afd/quarantine/` before restoration
- **Self-Write Guard:** Marks restored files to avoid triggering re-detection loops

---

## 4. Suppression Safety

### 4.1 Double-Tap Heuristic

When a protected file is deleted:
1. **First tap:** Auto-heal immediately, record timestamp
2. **Second tap within 30s:** User is intentional → mark antibody dormant, stop healing
3. **After 30s window:** Treat as a fresh first tap

Same logic applies to corruption detection (corruption double-tap).

### 4.2 Mass-Event Detection

If >3 `unlink` events occur within 1 second (e.g., `git checkout`):
- Skip all suppression logic for the burst
- Clear first-tap timestamps to prevent false double-tap detections

---

## 5. IPC Strategy

| Transport | Use Case |
|-----------|----------|
| **HTTP** (dynamic port) | CLI ↔ Daemon communication; port written to `.afd/daemon.port` |
| **SSE** (`/events`) | Live event streaming to `afd watch` TUI (max 20 clients) |
| **stdio** (JSON-RPC) | MCP mode for Claude Code tool integration (`--mcp` flag) |
| **PID file** | `.afd/daemon.pid` for process discovery and liveness check |

No Unix sockets — HTTP on `127.0.0.1` with dynamic port for cross-platform compatibility.

---

## 6. Data Layer

### 6.1 SQLite (`bun:sqlite`, WAL mode)

Database file: `.afd/antibodies.sqlite`

### 6.2 Tables

```sql
CREATE TABLE events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  type      TEXT NOT NULL,        -- add, change, unlink
  path      TEXT NOT NULL,        -- relative file path
  timestamp INTEGER NOT NULL      -- Unix epoch ms
);

CREATE TABLE antibodies (
  id           TEXT PRIMARY KEY,  -- e.g. "IMM-001"
  pattern_type TEXT NOT NULL,     -- missing-file, invalid-json, auto-seed
  file_target  TEXT NOT NULL,     -- target file path
  patch_op     TEXT NOT NULL,     -- RFC 6902 JSON-Patch array (JSON)
  dormant      INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL      -- datetime('now')
);

CREATE TABLE unlink_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE TABLE hologram_lifetime (
  id                  INTEGER PRIMARY KEY CHECK (id = 1),
  total_requests      INTEGER NOT NULL DEFAULT 0,
  total_original_chars INTEGER NOT NULL DEFAULT 0,
  total_hologram_chars INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE hologram_daily (
  date           TEXT PRIMARY KEY,  -- "YYYY-MM-DD"
  requests       INTEGER NOT NULL DEFAULT 0,
  original_chars INTEGER NOT NULL DEFAULT 0,
  hologram_chars INTEGER NOT NULL DEFAULT 0
);

PRAGMA journal_mode = WAL;
```

---

## 7. Dynamic Immune Synthesis

Custom validator scripts in `.afd/validators/*.js` are hot-reloaded at runtime:

- **Format:** `module.exports = function(newContent, filePath) { return boolean; }`
- **Loading:** `fs.watch` on `.afd/validators/` triggers `loadValidators()` with ES module cache-busting
- **Sandbox:** Each validator runs in try-catch with execution time warning (>500ms)
- **Integration:** Called at the top of `isCorrupted()` — any validator returning `true` blocks the change

---

## 8. Performance Constraints

| Metric | Target |
|--------|--------|
| Full S.E.A.M cycle | < 270ms |
| Single file detection | < 100ms |
| CLI command response | < 210ms |
| CPU usage (idle) | < 0.1% |
| Memory (baseline) | ~40MB |
| File snapshot cache | 10MB LRU cap |
| SSE clients | Max 20 |
| MCP buffer | Max 1MB |

---

## 9. File System Layout

```
.afd/
├── daemon.pid                  # Running daemon PID
├── daemon.port                 # HTTP IPC port number
├── daemon.log                  # Daemon log (rotated at 5MB, 3 backups)
├── antibodies.sqlite           # SQLite database (WAL mode)
├── quarantine/                 # Corrupted file backups (timestamped)
├── validators/                 # Custom validator scripts (hot-reloaded)
├── rules/                      # Custom diagnostic rules (YAML)
├── config.yml                  # Per-workspace config (optional)
└── global-vaccine-payload.json # Exported vaccine payload
```
