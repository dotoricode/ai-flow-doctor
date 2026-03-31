# CLI Reference

> `afd` — Autonomous Flow Daemon CLI.

---

## Global Options

| Flag | Description |
|------|-------------|
| `-V, --version` | Show version |
| `-h, --help` | Show help |

---

## Commands

### `afd start`

Start the background daemon and auto-provision all ecosystem integrations (One-Command Zero-Touch).

| Option | Description |
|--------|-------------|
| `--mcp` | Run in MCP stdio mode (foreground, JSON-RPC on stdin/stdout) |

**Auto-provisioning on start:**
1. Detects ecosystems (Claude Code, Cursor, Windsurf, Codex)
2. Injects `PreToolUse` auto-heal hook into each ecosystem's hooks file
3. Registers `afd` MCP server in `.mcp.json` (Claude Code)
4. Configures StatusLine integration
5. Prints checklist of what was set up

### `afd stop`

Stop the running daemon. Prints shift summary (heals, tokens saved, uptime).

| Option | Description |
|--------|-------------|
| `--clean` | Remove all injected hooks and MCP registrations (rollback) |

### `afd score`

Display daemon diagnostics dashboard (uptime, events, heals, hologram stats, antibodies).

### `afd fix`

Interactive symptom fixing — diagnoses issues and applies JSON-Patch fixes.

### `afd sync`

Export/import antibodies for team sharing.

| Option | Description |
|--------|-------------|
| `--push` | Push local antibodies to team vaccine store |
| `--pull` | Pull antibodies from team vaccine store |
| `--remote <url>` | Remote vaccine store URL (future) |

### `afd doctor`

Deep health analysis with rule-based grading (A+ to D) and auto-fix.

| Option | Description |
|--------|-------------|
| `--fix` | Auto-fix detected issues |

### `afd watch`

Real-time TUI dashboard — live S.E.A.M event stream via SSE.

### `afd diagnose`

Headless diagnosis for hook automation.

| Option | Description |
|--------|-------------|
| `--format <type>` | Output format: `a2a` or `human` (default: `human`) |
| `--auto-heal` | Auto-apply patches for known antibodies |

### `afd vaccine [subcommand] [arg]`

Vaccine registry: `list`, `search`, `install`, `publish`.

### `afd evolution`

Analyze quarantined failures and generate `afd-lessons.md` for AI agents.

### `afd mcp [subcommand]`

MCP server management (install into Claude Code config).

### `afd lang [language]`

Show or change display language (`en`, `ko`).

| Option | Description |
|--------|-------------|
| `--list` | Show all supported languages |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Daemon failed to start or command error |

## Files

| Path | Purpose |
|------|---------|
| `.afd/daemon.pid` | Running daemon PID |
| `.afd/daemon.port` | HTTP IPC port |
| `.afd/daemon.log` | Daemon log (rotated at 5MB) |
| `.afd/antibodies.sqlite` | Learned antibody database |
| `.afd/quarantine/` | Corrupted file backups |
| `.afd/global-vaccine-payload.json` | Exported vaccine payload |
| `.mcp.json` | MCP server registration (auto-managed) |
| `.claude/hooks.json` | PreToolUse hook (auto-managed) |
