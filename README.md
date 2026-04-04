<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=soft&color=auto&height=200&section=header&text=afd&fontSize=90" alt="afd" />
</p>

<h3 align="center">The Invisible Guardian for AI Agents</h3>
<p align="center"><strong>Self-healing environments + 97% token compression. Your AI breaks things — afd fixes them in 184ms.</strong></p>

<p align="center">
  <a href="https://github.com/dotoricode/autonomous-flow-daemon">
    <img src="demo.gif" width="850" alt="afd demo" style="border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.4);">
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.0.0-blue?style=flat-square" alt="version" />
  <a href="https://www.npmjs.com/package/@dotoricode/afd"><img src="https://img.shields.io/npm/v/@dotoricode/afd?style=flat-square&logo=npm&color=cb0000" alt="npm" /></a>
  <img src="https://img.shields.io/badge/runtime-Bun-f472b6?style=flat-square&logo=bun" alt="Bun" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT" />
  <img src="https://img.shields.io/badge/built%20for-Claude%20Code-7c3aed?style=flat-square" alt="Claude Code" />
</p>

<p align="center">
  <a href="README-ko.md">한국어</a>
</p>

---

## The Numbers Don't Lie

| Situation | Without afd | With afd |
|:----------|:------------|:---------|
| AI deletes `.claudeignore` | **30 min** manual fix | **0.2s** auto-heal |
| Hook file corrupted | Re-inject hooks, restart session | **Silent background repair** |
| `git checkout` triggers 50 events | AI goes haywire | **Mass-event suppressor** |
| AI reads 8 large files (114KB) | **~28,600 tokens** consumed | **~860 tokens** via hologram (97% saved) |
| Session token budget | Burns through context window | **~60,900 tokens saved per codebase scan** |

> `< 0.1% CPU` | `~40MB RAM` | `< 270ms` full heal cycle | You never even see it happen.

---

## One Command to Rule Them All

```bash
npx @dotoricode/afd start
```

That's it. Daemon spawns, hooks inject, MCP registers. You're protected.

```
$ afd start
  Daemon started (pid 4812, port 52413)
  Smart Discovery: Watching 7 AI-context targets
  Hook injected into .claude/hooks.json
```

---

## The Problem

Your AI agent is powerful but clumsy. It deletes `.claudeignore`, corrupts `hooks.json`, wipes `.cursorrules` — and you don't notice until everything is broken. You stop coding, diagnose the mess, manually restore files. **30 minutes gone. Flow destroyed.**

And every time it reads your codebase? Full source files pumped straight into the context window. **Thousands of tokens burned on function bodies it never needed.**

## The Solution

`afd` runs as an invisible background daemon. It watches your critical files, heals corruption in 184ms, and serves AI agents compressed type skeletons instead of raw source code. Your AI gets the structure it needs at 1/16th the token cost. Accidents get fixed before you notice. Intentional deletions are respected. Zero config, zero interference.

---

## What's New in v2.0.0 — "Deep Context Engine"

| Feature | What Changed |
|:--------|:-------------|
| **Deep Context Engine** | 4-language AST parsing (TS, Python, Go, Rust) with L2/L3 cross-file call graph |
| **True Caching** | `afd://hologram/{path}` MCP resource — Anthropic prompt caching via `cache_control` |
| **Web Dashboard** | `afd web` opens a glassmorphism-styled dashboard in your browser — single HTML, no CDN |
| **Smart Interceptor** | `afd_read` auto-compresses files >10KB (97% savings), `afd_read_raw` as fallback |
| **Honest Metrics** | Content-aware token estimator (12 extensions) replaces the old `chars÷4` formula |
| **Fixed Port** | Daemon binds to `localhost:51831` — predictable address, no more random ports |
| **Daemon Watchdog** | `daemonRequest()` retries 3× on transient failures — resilient to daemon restarts |

### Web Dashboard Preview

<!-- TODO: Replace with actual screenshot -->
> `afd web` — Opens `http://localhost:51831/dashboard` in your default browser.
>
> **Overview tab**: Today's token savings, lifetime ROI breakdown, 7-day history, live SSE event stream.
> **Context Compressor tab**: Browse any file in the project, view its hologram skeleton with syntax highlighting, explore N-Depth dependency trees.

### How the Context Compressor Works

```
Original (27 KB, 624 lines)          Hologram (921 chars, 18 lines)
┌──────────────────────────┐          ┌──────────────────────────┐
│ import { resolve } from  │          │ import { resolve } from  │
│ import { generateHolo... │          │ import { generateHolo... │
│                          │   97%    │ function mcpResponse(     │
│ function mcpResponse(    │ ──────>  │   id, result) {…}        │
│   id: unknown, ...) {   │  saved   │ async function handle(    │
│   // 50 lines of logic  │          │   ctx, req) {…}          │
│ }                        │          │ export function start(    │
│ // ... 600 more lines    │          │   ctx) {…}               │
└──────────────────────────┘          └──────────────────────────┘
```

Function bodies are stripped, type signatures preserved. The AI gets the structure it needs without burning tokens on implementation details.

---

## Key Features

| Feature | What it does |
|:--------|:-------------|
| **S.E.A.M Auto-Heal** | File deletion/corruption detected and restored in < 270ms |
| **Hologram Extraction** | 70-96% lighter file skeletons served to AI agents via MCP |
| **Smart Reader** | `afd_read` — small files raw, large files auto-compressed, line-range support |
| **Workspace Map** | `afd://workspace-map` — full file tree + export signatures in one call |
| **Import-Aware L1** | Only imported symbols get full signatures (85%+ savings) |
| **Double-Tap** | Delete once = heal; delete again within 30s = respected as intent |
| **Vaccine Network** | `afd sync` exports learned antibodies across projects |
| **Self-Evolution** | Quarantined failures become prevention rules automatically |
| **Mistake History** | PreToolUse hook injects past mistakes as warnings before edits |
| **HUD Counter** | Status bar shows defense count + token savings at a glance |

---

## Token Savings — Real Measured Data

The hologram system is afd's biggest value driver. Here's what we measured in a real session:

### Session Snapshot

| Metric | Value |
|:-------|:------|
| Hologram requests | 55 files analyzed |
| Target files total size | ~290 KB (55 files, avg 5.3 KB each) |
| Original token cost | ~72,500 tokens |
| After hologram compression | ~11,600 tokens |
| **Tokens saved** | **~60,900 tokens (84% reduction)** |

### How It Scales

```
Session tokens (at ctx ~15%):  ~150,000  ████████████████
Tokens saved by hologram:       ~60,900  ████████░░░░░░░░  (41% of session)
```

At ctx 50%+, file reads dominate the token budget. Without hologram, scanning 55 source files costs ~72.5K tokens. With hologram, **each file averages just 16% of its original footprint** — and the gap widens with every repeated read.

### Three Layers of Token Optimization

| Layer | Tool | Savings | How |
|:------|:-----|:--------|:----|
| **L0 Hologram** | `afd_hologram` | 80%+ | Strip function bodies, keep type signatures |
| **L1 Hologram** | `afd_hologram` + `contextFile` | 85%+ | Filter to only imported symbols |
| **Smart Reader** | `afd_read` | Auto | Files < 10KB raw, >= 10KB auto-hologram |
| **Workspace Map** | `afd://workspace-map` | N/A | Entire project structure in one call |

---

<details>
<summary><b>How S.E.A.M Works (internals)</b></summary>

Every file event flows through four stages:

```mermaid
graph LR
    S["Sense<br/><i>File Change Detected</i>"] --> E["Extract<br/><i>Detect Symptom</i>"]
    E --> A["Adapt<br/><i>Select Antibody</i>"]
    A --> M["Mutate<br/><i>Apply JSON-Patch</i>"]
    M -->|"Learn"| S
    style S fill:#3b82f6,color:#fff,stroke:none
    style E fill:#f59e0b,color:#fff,stroke:none
    style A fill:#10b981,color:#fff,stroke:none
    style M fill:#ef4444,color:#fff,stroke:none
```

| Stage | What Happens | Speed |
|:------|:-------------|:------|
| **Sense** | Chokidar watcher detects `add`, `change`, `unlink` events | < 10ms |
| **Extract** | Generates hologram (type skeleton) & runs health checks | < 5ms |
| **Adapt** | Matches symptom to antibody, quarantines corrupted state | < 1ms |
| **Mutate** | Applies RFC 6902 JSON-Patch to restore the file | < 25ms |

> Full cycle: **< 270ms** from file deletion to full recovery.

</details>

---

## Commands

| Command | What it does |
|:--------|:-------------|
| `afd start` | Daemon spawn + Smart Discovery + Hook injection + MCP registration |
| `afd stop` | Shift summary report & graceful shutdown (`--clean` to remove hooks & MCP) |
| `afd score` | Health dashboard with evolution & hologram metrics |
| `afd fix` | Symptom detection with hologram context & antibody learning |
| `afd sync` | Vaccine payload export/import (`--push`, `--pull`, `--remote <url>`) |
| `afd restart` | Stop + start in one command |
| `afd status` | Quick health check — daemon, hooks, MCP, defenses |
| `afd doctor` | Comprehensive health analysis with auto-fix recommendations |
| `afd evolution` | Analyze quarantined failures & generate prevention rules |
| `afd mcp install` | Register afd as MCP server in project + global config |
| `afd vaccine` | List, search, install, publish community antibodies |
| `afd dashboard` | Live TUI — daily token savings, lifetime ROI, 7-day trend |
| `afd web` | Open web dashboard in default browser (`localhost:51831/dashboard`) |
| `afd lang` | Switch display language (`afd lang ko` / `afd lang en`) |

---

<details>
<summary><b>Advanced Intelligence</b></summary>

### Double-Tap Heuristic

`afd` distinguishes **accidents** from **intent**:

```
$ rm .claudeignore            # First tap -> afd heals it silently
$ rm .claudeignore            # Second tap within 30s -> "You meant it."
  [afd] Antibody IMM-001 retired. Double-tap detected. Standing down.
```

| Scenario | Response |
|:---------|:---------|
| Single delete (accident) | Auto-heal + record first tap |
| Re-delete within 30s (intent) | Antibody goes dormant, deletion respected |
| 3+ deletes in 1s (git checkout) | Mass-event detected, all suppression paused |

### Vaccine Network

```bash
afd sync              # Export to .afd/global-vaccine-payload.json
afd sync --push       # Push vaccines to remote
afd sync --pull       # Pull vaccines from remote
```

The payload is sanitized (no absolute paths, no secrets) and portable.

### Self-Evolution

```bash
afd evolution
```

Analyzes quarantined failures and writes prevention rules to `afd-lessons.md`. AI agents read this before editing immune-critical files — turning past failures into future prevention.

</details>

---

## MCP Setup

`afd` provides seven MCP tools and four resources:

| MCP Tool | Purpose |
|:---------|:--------|
| `afd_read` | Smart reader — <10KB raw, ≥10KB auto-hologram, line ranges, symbol extraction |
| `afd_read_raw` | Full-text fallback — explicit uncompressed read when hologram is insufficient |
| `afd_hologram` | Type skeleton generator (TS, JS, Python, Go, Rust) — prefer `afd://hologram` resource |
| `afd_diagnose` | Health diagnosis with symptoms and hologram context |
| `afd_score` | Runtime stats: uptime, heals, hologram savings |
| `afd_suggest` | Surface high-frequency vulnerability patterns from mistake history |
| `afd_fix` | Generate auto-validator scripts for known failure patterns |

| MCP Resource | Purpose |
|:-------------|:--------|
| `afd://workspace-map` | Full file tree with export signatures in one call |
| `afd://hologram/{path}` | Prompt-cached hologram — `cache_control: ephemeral` for Anthropic caching |
| `afd://antibodies` | Live antibody list (subscribable, push notifications) |
| `afd://events` | Real-time S.E.A.M event stream (subscribable) |

```bash
afd mcp install    # Registers in .mcp.json + ~/.claude.json
```

---

<details>
<summary><b>Tech Stack</b></summary>

| Layer | Technology | Why |
|:------|:-----------|:----|
| Runtime | **Bun** | Native TypeScript, fast SQLite, single binary |
| Database | **Bun SQLite (WAL)** | 0.29ms reads, 24ms writes, crash-safe |
| Parsing | **Tree-sitter** | Multilingual AST — TS, JS, Python, Go, Rust |
| Watching | **Chokidar** | Cross-platform, battle-tested file watcher |
| Patching | **RFC 6902 JSON-Patch** | Deterministic, composable file mutations |
| CLI | **Commander.js** | Standard, zero-surprise command parsing |

</details>

---

## Installation

```bash
# Fastest (no install)
npx @dotoricode/afd start

# With Bun (recommended for development)
bun install
bun link
afd start
```

### Requirements

- **Bun** >= 1.0
- **OS**: Windows, macOS, Linux
- **Target**: Claude Code, Cursor, Windsurf, Codex (ecosystem auto-detected)

---

## License

MIT
