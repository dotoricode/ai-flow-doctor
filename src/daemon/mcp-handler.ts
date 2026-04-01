/**
 * MCP stdio handler — JSON-RPC dispatcher for tools and resources.
 * Extracted from server.ts for modularity.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { generateHologram } from "../core/hologram";
import { diagnose } from "../core/immune";
import type { DaemonContext } from "./types";
import { APP_VERSION } from "../version";
import { assertInsideWorkspace as _assertWs } from "./guards";

const MCP_MAX_BUFFER = 1024 * 1024; // 1 MB

const mcpToolDefs = [
  {
    name: "afd_diagnose",
    description: "Run health diagnosis on the current project. Returns symptoms and healthy checks.",
    inputSchema: {
      type: "object" as const,
      properties: {
        raw: { type: "boolean" as const, description: "If true, report all symptoms ignoring antibodies" },
      },
    },
  },
  {
    name: "afd_score",
    description: "Get daemon runtime stats: uptime, events, heals, hologram savings, suppression metrics.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "afd_hologram",
    description: "Generate a token-efficient hologram (type skeleton) for a TypeScript file.",
    inputSchema: {
      type: "object" as const,
      properties: {
        file: { type: "string" as const, description: "Relative or absolute file path" },
      },
      required: ["file"],
    },
  },
  {
    name: "afd_read",
    description: "Smart file reader that saves tokens. Files <10KB return full content. Files >=10KB return a structural hologram instead. Use 'startLine' and 'endLine' to read specific line ranges of large files at full fidelity.",
    inputSchema: {
      type: "object" as const,
      properties: {
        file: { type: "string" as const, description: "Relative or absolute file path" },
        startLine: { type: "number" as const, description: "Start line number (1-based, inclusive). Use with endLine to read a specific range of large files." },
        endLine: { type: "number" as const, description: "End line number (1-based, inclusive)." },
      },
      required: ["file"],
    },
  },
];

function mcpResponse(id: unknown, result: unknown) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function mcpError(id: unknown, code: number, message: string) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}


function handleMcpRequest(ctx: DaemonContext, req: { id?: unknown; method?: string; params?: Record<string, unknown> }) {
  const { id, method, params } = req;

  if (method === "initialize") {
    mcpResponse(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {}, resources: {} },
      serverInfo: { name: "afd", version: APP_VERSION },
    });
    return;
  }

  if (method === "notifications/initialized") return;

  if (method === "tools/list") {
    mcpResponse(id, { tools: mcpToolDefs });
    return;
  }

  if (method === "resources/list") {
    mcpResponse(id, {
      resources: [{
        uri: "afd://workspace-map",
        name: "Workspace Map",
        description: "Project file tree with export signatures. Read this first to understand the codebase structure before reading individual files.",
        mimeType: "text/plain",
      }],
    });
    return;
  }

  if (method === "resources/read") {
    const uri = params?.uri as string | undefined;
    if (uri === "afd://workspace-map") {
      mcpResponse(id, {
        contents: [{ uri: "afd://workspace-map", mimeType: "text/plain", text: ctx.getWorkspaceMap() }],
      });
      return;
    }
    mcpError(id, -32602, `Unknown resource: ${uri}`);
    return;
  }

  if (method === "tools/call") {
    const toolName = params?.name as string | undefined;
    const args = (params?.arguments ?? {}) as Record<string, unknown>;

    if (toolName === "afd_diagnose") {
      const raw = args.raw === true;
      const known = ctx.antibodyIds.all().map(r => r.id);
      const result = diagnose(known, { raw });

      const PROACTIVE_THRESHOLD = 5 * 1024;
      const enriched = result.symptoms.map((s: { fileTarget: string; [k: string]: unknown }) => {
        const snapshot = ctx.state.fileSnapshots.get(s.fileTarget)
          ?? ctx.state.fileSnapshots.get(s.fileTarget.replace(/\//g, "\\"));
        if (!snapshot) return s;
        if (snapshot.length > PROACTIVE_THRESHOLD) {
          const hologram = ctx.safeHologram(s.fileTarget, snapshot);
          return { ...s, hologram, contextNote: `File is ${(snapshot.length / 1024).toFixed(1)}KB — hologram provided to save tokens.` };
        }
        return { ...s, context: snapshot };
      });

      mcpResponse(id, {
        content: [{ type: "text", text: JSON.stringify({ ...result, symptoms: enriched }, null, 2), cache_control: { type: "ephemeral" } }],
      });
      return;
    }

    if (toolName === "afd_score") {
      const uptime = Math.floor((Date.now() - ctx.state.startedAt) / 1000);
      const eventCount = ctx.db.query("SELECT COUNT(*) as cnt FROM events").get() as { cnt: number };
      const abCount = ctx.countAntibodies.get() as { cnt: number };
      const hs = ctx.state.hologramStats;
      mcpResponse(id, {
        content: [{ type: "text", text: JSON.stringify({
          uptime,
          filesDetected: ctx.state.filesDetected,
          totalEvents: eventCount.cnt,
          antibodies: abCount.cnt,
          autoHealed: ctx.state.autoHealCount,
          hologramRequests: hs.totalRequests,
          hologramSavings: hs.totalOriginalChars > 0
            ? `${Math.round((hs.totalOriginalChars - hs.totalHologramChars) / hs.totalOriginalChars * 100)}%`
            : "0%",
          suppression: {
            massEventsSkipped: ctx.state.suppressionSkippedCount,
            dormantTransitions: ctx.state.dormantTransitions.length,
          },
        }, null, 2), cache_control: { type: "ephemeral" } }],
      });
      return;
    }

    if (toolName === "afd_hologram") {
      const file = args.file as string | undefined;
      if (!file) { mcpError(id, -32602, "Missing required argument: file"); return; }
      try {
        const absPath = resolve(file);
        _assertWs(absPath, ctx.ws.root);
        const source = readFileSync(absPath, "utf-8");
        const result = generateHologram(file, source);
        ctx.persistHologramStats(result.originalLength, result.hologramLength);
        mcpResponse(id, {
          content: [{ type: "text", text: result.hologram, cache_control: { type: "ephemeral" } }],
        });
      } catch (err: unknown) {
        mcpError(id, -32603, err instanceof Error ? err.message : String(err));
      }
      return;
    }

    if (toolName === "afd_read") {
      const file = args.file as string | undefined;
      if (!file) { mcpError(id, -32602, "Missing required argument: file"); return; }
      try {
        const AFD_READ_THRESHOLD = 10 * 1024;
        const absPath = resolve(file);
        _assertWs(absPath, ctx.ws.root);
        const source = readFileSync(absPath, "utf-8");
        const sizeKB = (source.length / 1024).toFixed(1);
        const rawStart = args.startLine;
        const rawEnd = args.endLine;
        const startLine = typeof rawStart === "number" && Number.isFinite(rawStart) ? rawStart : undefined;
        const endLine = typeof rawEnd === "number" && Number.isFinite(rawEnd) ? rawEnd : undefined;

        if (startLine !== undefined && endLine !== undefined) {
          const lines = source.split("\n");
          const start = Math.max(1, Math.floor(startLine)) - 1;
          const end = Math.min(lines.length, Math.floor(endLine));
          const slice = lines.slice(start, end).map((l, i) => `${start + i + 1}\t${l}`).join("\n");
          mcpResponse(id, {
            content: [{ type: "text", text: `// ${file} lines ${start + 1}-${end} (${sizeKB}KB total)\n${slice}`, cache_control: { type: "ephemeral" } }],
          });
          return;
        }

        if (source.length < AFD_READ_THRESHOLD) {
          mcpResponse(id, {
            content: [{ type: "text", text: source, cache_control: { type: "ephemeral" } }],
          });
          return;
        }

        const result = generateHologram(file, source);
        ctx.persistHologramStats(result.originalLength, result.hologramLength);
        const savings = Math.round((1 - result.hologramLength / result.originalLength) * 100);
        const header = `⚠️ [afd-Optimizer]: File is ${sizeKB}KB. To save tokens, only the structural hologram is provided (${savings}% reduction).\nUse afd_read with startLine/endLine to read specific sections at full fidelity.\nTotal lines: ${source.split("\n").length}\n\n`;
        mcpResponse(id, {
          content: [{ type: "text", text: header + result.hologram, cache_control: { type: "ephemeral" } }],
        });
      } catch (err: unknown) {
        mcpError(id, -32603, err instanceof Error ? err.message : String(err));
      }
      return;
    }

    mcpError(id, -32601, `Unknown tool: ${toolName}`);
    return;
  }

  mcpError(id, -32601, `Unknown method: ${method}`);
}

/** Start MCP stdio mode — blocks until stdin closes */
export function startMcpStdio(ctx: DaemonContext) {
  console.error("[afd] MCP stdio mode — awaiting JSON-RPC on stdin");

  (async () => {
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of Bun.stdin.stream()) {
      buffer += decoder.decode(chunk);
      if (buffer.length > MCP_MAX_BUFFER) {
        console.error("[afd] MCP buffer overflow — dropping buffer");
        buffer = "";
        continue;
      }
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (!line) continue;
        try { handleMcpRequest(ctx, JSON.parse(line)); } catch { /* crash-only */ }
      }
    }
  })().catch((err) => {
    console.error("[afd] MCP stdin loop error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
