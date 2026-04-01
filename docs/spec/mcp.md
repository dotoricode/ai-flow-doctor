# MCP Integration

> Model Context Protocol (MCP) stdio transport — afd를 Claude Code의 네이티브 도구로 통합.

---

## 1. Overview

afd daemon은 `--mcp` 플래그로 실행 시 stdin/stdout JSON-RPC 기반 MCP 서버로 동작한다. Claude Code가 이를 네이티브 도구로 인식하여 에이전트가 직접 `afd_diagnose`, `afd_score`, `afd_hologram`을 호출할 수 있다.

**Protocol Version:** `2024-11-05`

```
Claude Code ←→ stdin/stdout (JSON-RPC) ←→ afd daemon (MCP mode)
                                              │
                                         chokidar watcher
                                         SQLite (WAL)
                                         S.E.A.M cycle
```

---

## 2. MCP Tools

### 2.1 `afd_diagnose`

Run health diagnosis on the current project.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "raw": {
      "type": "boolean",
      "description": "If true, report all symptoms ignoring antibodies"
    }
  }
}
```

**Response:** Diagnosis result with symptoms and healthy checks.

```json
{
  "content": [{
    "type": "text",
    "text": "{\"symptoms\": [...], \"healthy\": [...]}"
  }]
}
```

### 2.2 `afd_score`

Get daemon runtime statistics.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {}
}
```

**Response:** Uptime, events, antibodies, hologram savings, suppression metrics.

```json
{
  "content": [{
    "type": "text",
    "text": "{\"uptime\": 120, \"filesDetected\": 5, \"totalEvents\": 42, \"antibodies\": 3, \"autoHealed\": 1, \"hologramRequests\": 7, \"hologramSavings\": \"84%\", \"suppression\": {\"massEventsSkipped\": 0, \"dormantTransitions\": 0}}"
  }]
}
```

### 2.3 `afd_hologram`

Generate a token-efficient hologram (type skeleton) for a TypeScript file.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "file": {
      "type": "string",
      "description": "Relative or absolute file path"
    }
  },
  "required": ["file"]
}
```

**Response:** Compressed type-signature skeleton.

```json
{
  "content": [{
    "type": "text",
    "text": "export interface Foo { ... }\nexport function bar(x: string): void;"
  }]
}
```

**Error (missing file):**
```json
{
  "error": { "code": -32602, "message": "Missing required argument: file" }
}
```

---

## 3. JSON-RPC Protocol

### 3.1 Request Format

All requests are newline-delimited JSON-RPC 2.0:

```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "afd_score", "arguments": {}}}
```

### 3.2 Response Format

```json
{"jsonrpc": "2.0", "id": 1, "result": {"content": [{"type": "text", "text": "..."}]}}
```

### 3.3 Error Format

```json
{"jsonrpc": "2.0", "id": 1, "error": {"code": -32601, "message": "Unknown tool: foo"}}
```

### 3.4 Supported Methods

| Method | Description |
|--------|-------------|
| `initialize` | MCP handshake; returns protocol version + capabilities |
| `notifications/initialized` | Client notification (no response) |
| `tools/list` | Returns available tool definitions with input schemas |
| `tools/call` | Dispatches to tool handler by `params.name` |

### 3.5 Safety

- **Buffer limit:** 1 MB max stdin buffer. Payloads without newline exceeding this are dropped.
- **Malformed JSON:** Silently ignored (crash-only design).
- **Unhandled errors:** Logged to stderr, then `process.exit(1)`.

---

## 4. Integration with Claude Code

### 4.1 Registration

`afd start` auto-registers the MCP server in `.mcp.json`:

```json
{
  "mcpServers": {
    "afd": {
      "command": "bun",
      "args": ["run", "/path/to/src/daemon/server.ts", "--mcp"],
      "cwd": "/workspace/root"
    }
  }
}
```

### 4.2 Manual Registration

```bash
afd mcp install
```

### 4.3 Removal

```bash
afd stop --clean    # Removes hooks + MCP registration
```

### 4.4 MCP stdio Mode

When `--mcp` is passed to `afd start`, the daemon runs in the foreground:
- **stdout** is reserved for JSON-RPC responses
- **stderr** is used for S.E.A.M cycle logs (via `console.error`)
- File watcher runs concurrently with the stdin reader loop

---

## 5. Usage from AI Agent

Once registered, AI agents can call afd tools directly:

```
Agent: "I need to check the project health"
→ Calls MCP tool: afd_diagnose

Agent: "Let me inspect the structure of server.ts"
→ Calls MCP tool: afd_hologram { file: "src/daemon/server.ts" }

Agent: "How efficient is the hologram system?"
→ Calls MCP tool: afd_score
```

The hologram tool is particularly valuable: it returns an 80%+ compressed skeleton of any TS file, allowing the agent to understand file structure without consuming full-text tokens.
