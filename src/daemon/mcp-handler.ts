/**
 * MCP stdio handler — JSON-RPC dispatcher for tools and resources.
 * Extracted from server.ts for modularity.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { generateHologram } from "../core/hologram";
import { diagnose } from "../core/immune";
import { suggestRules } from "../core/rule-suggestion";
import { generateValidator } from "../core/validator-generator";
import type { Database } from "bun:sqlite";
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
    description: "Generate a token-efficient hologram (type skeleton) for a source file (TS, JS, Python). Use contextFile for L1 filtering. Use diffOnly for incremental updates showing only changed declarations.",
    inputSchema: {
      type: "object" as const,
      properties: {
        file: { type: "string" as const, description: "Relative or absolute file path" },
        contextFile: { type: "string" as const, description: "Optional: the file that imports from 'file'. Enables L1 filtering for higher compression." },
        diffOnly: { type: "boolean" as const, description: "Optional: return only changed declarations since last hologram call (unified-diff format). Saves tokens on repeated reads." },
      },
      required: ["file"],
    },
  },
  {
    name: "afd_suggest",
    description: "Analyze mistake_history and return high-frequency vulnerability patterns as ranked suggestions. Call this FIRST before any bug fix or refactor to check for known quarantine patterns.",
    inputSchema: {
      type: "object" as const,
      properties: {
        days: { type: "number" as const, description: "Analysis window in days (default: 30)" },
        min_frequency: { type: "number" as const, description: "Minimum occurrence count to surface a suggestion (default: 3)" },
        limit: { type: "number" as const, description: "Maximum number of suggestions to return (default: 10)" },
      },
    },
  },
  {
    name: "afd_fix",
    description: "Generate and apply an auto-validator script to '.afd/validators/' for a known failure pattern. Use after afd_suggest to protect a file from recurring mistakes.",
    inputSchema: {
      type: "object" as const,
      properties: {
        file_path: { type: "string" as const, description: "Workspace-relative path of the file to protect (e.g. 'src/core/db.ts')" },
        failure_type: { type: "string" as const, enum: ["corruption", "deletion"], description: "Category of failure: 'corruption' (bad content) or 'deletion' (file removed). Default: 'corruption'" },
        mistake_type: { type: "string" as const, description: "Optional label from afd_suggest output — embedded in the generated validator as a comment" },
      },
      required: ["file_path"],
    },
  },
  {
    name: "afd_sync",
    description: "Push local antibodies to a remote vaccine store, or pull antibodies from a remote store into the running daemon. Wraps the bidirectional HTTP sync protocol.",
    inputSchema: {
      type: "object" as const,
      properties: {
        remote: { type: "string" as const, description: "Remote vaccine store URL (http:// or https://)" },
        direction: { type: "string" as const, enum: ["push", "pull", "both"], description: "Sync direction: 'push', 'pull', or 'both' (default: 'both')" },
      },
      required: ["remote"],
    },
  },
  {
    name: "afd_read",
    description: "Smart file reader that saves tokens. Files <10KB return full content. Files >=10KB return a structural hologram instead. Use 'startLine'/'endLine' for line ranges, or 'symbols' for pinpoint symbol extraction (L1 mode).",
    inputSchema: {
      type: "object" as const,
      properties: {
        file: { type: "string" as const, description: "Relative or absolute file path" },
        startLine: { type: "number" as const, description: "Start line number (1-based, inclusive). Use with endLine to read a specific range of large files." },
        endLine: { type: "number" as const, description: "End line number (1-based, inclusive)." },
        symbols: {
          type: "array" as const,
          items: { type: "string" as const },
          description: "L1 mode: extract only these named symbols (interfaces, types, classes, functions). Returns only matching declarations, maximizing token savings.",
        },
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


async function handleMcpRequest(ctx: DaemonContext, req: { id?: unknown; method?: string; params?: Record<string, unknown> }) {
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
      resources: [
        {
          uri: "afd://workspace-map",
          name: "Workspace Map",
          description: "Project file tree with export signatures. Read this first to understand the codebase structure before reading individual files.",
          mimeType: "text/plain",
        },
        {
          uri: "afd://antibodies",
          name: "Antibody List",
          description: "Live list of all active antibodies in the daemon's immune system. Each entry includes id, pattern_type, file_target, scope, version, and dormant status.",
          mimeType: "application/json",
        },
      ],
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
    if (uri === "afd://antibodies") {
      const rows = ctx.db
        .query<
          { id: string; pattern_type: string; file_target: string; patch_op: string; dormant: number; scope: string; ab_version: number; updated_at: string; created_at: string },
          []
        >(
          "SELECT id, pattern_type, file_target, patch_op, dormant, scope, ab_version, updated_at, created_at FROM antibodies ORDER BY updated_at DESC"
        )
        .all();
      const antibodies = rows.map((r) => ({
        id: r.id,
        pattern_type: r.pattern_type,
        file_target: r.file_target,
        patch_op: r.patch_op,
        dormant: r.dormant === 1,
        scope: r.scope,
        ab_version: r.ab_version,
        updated_at: r.updated_at,
        created_at: r.created_at,
      }));
      mcpResponse(id, {
        contents: [{ uri: "afd://antibodies", mimeType: "application/json", text: JSON.stringify({ total: antibodies.length, antibodies }, null, 2) }],
      });
      return;
    }
    mcpError(id, -32602, `Unknown resource: ${uri}`);
    return;
  }

  if (method === "tools/call") {
    const toolName = params?.name as string | undefined;
    const args = (params?.arguments ?? {}) as Record<string, unknown>;

    // Track MCP tool call
    if (toolName) {
      try { ctx.insertTelemetry.run("mcp", toolName, null, null, Date.now()); } catch { /* crash-only */ }
    }

    if (toolName === "afd_diagnose") {
      const raw = args.raw === true;
      const known = ctx.antibodyIds.all().map(r => r.id);
      const result = diagnose(known, { raw });

      const PROACTIVE_THRESHOLD = 5 * 1024;
      const enriched = await Promise.all(result.symptoms.map(async (s: { fileTarget: string; [k: string]: unknown }) => {
        const snapshot = ctx.state.fileSnapshots.get(s.fileTarget)
          ?? ctx.state.fileSnapshots.get(s.fileTarget.replace(/\//g, "\\"));
        if (!snapshot) return s;
        if (snapshot.length > PROACTIVE_THRESHOLD) {
          const hologram = await ctx.safeHologram(s.fileTarget, snapshot);
          return { ...s, hologram, contextNote: `File is ${(snapshot.length / 1024).toFixed(1)}KB — hologram provided to save tokens.` };
        }
        return { ...s, context: snapshot };
      }));

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
        const contextFile = args.contextFile as string | undefined;
        const diffOnly = args.diffOnly === true;
        const opts: Record<string, unknown> = {};
        if (contextFile) opts.contextFile = resolve(contextFile);
        if (diffOnly) opts.diffOnly = true;
        const result = await generateHologram(file, source, Object.keys(opts).length > 0 ? opts as { contextFile?: string; diffOnly?: boolean } : undefined);
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
        const rawSymbols = args.symbols;
        const symbols = Array.isArray(rawSymbols)
          ? rawSymbols.filter((s): s is string => typeof s === "string")
          : undefined;

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

        // L1 Symbol Extraction: always use hologram engine regardless of file size
        if (symbols && symbols.length > 0) {
          const result = await generateHologram(file, source, { symbols });
          ctx.persistHologramStats(result.originalLength, result.hologramLength);
          const header = `// [afd L1] ${file} — symbols: [${symbols.join(", ")}]\n\n`;
          mcpResponse(id, {
            content: [{ type: "text", text: header + result.hologram, cache_control: { type: "ephemeral" } }],
          });
          return;
        }

        if (source.length < AFD_READ_THRESHOLD) {
          mcpResponse(id, {
            content: [{ type: "text", text: source, cache_control: { type: "ephemeral" } }],
          });
          return;
        }

        const result = await generateHologram(file, source);
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

    if (toolName === "afd_suggest") {
      try {
        const suggestions = suggestRules(ctx.db as unknown as Database, {
          days: typeof args.days === "number" ? args.days : undefined,
          minFrequency: typeof args.min_frequency === "number" ? args.min_frequency : undefined,
          limit: typeof args.limit === "number" ? args.limit : undefined,
        });
        mcpResponse(id, {
          content: [{ type: "text", text: JSON.stringify(suggestions, null, 2), cache_control: { type: "ephemeral" } }],
        });
      } catch (err: unknown) {
        mcpError(id, -32603, err instanceof Error ? err.message : String(err));
      }
      return;
    }

    if (toolName === "afd_fix") {
      const filePath = args.file_path as string | undefined;
      if (!filePath) { mcpError(id, -32602, "Missing required argument: file_path"); return; }
      const failureType = (args.failure_type === "deletion" ? "deletion" : "corruption") as "corruption" | "deletion";
      const mistakeType = typeof args.mistake_type === "string" ? args.mistake_type : "";
      try {
        const result = generateValidator({
          failureType,
          originalPath: filePath,
          corruptedContent: mistakeType ? `// mistake: ${mistakeType}` : "",
          restoredContent: null,
        });
        mcpResponse(id, {
          content: [{ type: "text", text: JSON.stringify({
            success: true,
            filename: result.filename,
            written: result.written,
            reason: result.reason,
            validatorPath: `.afd/validators/${result.filename}`,
          }, null, 2) }],
        });
      } catch (err: unknown) {
        mcpError(id, -32603, err instanceof Error ? err.message : String(err));
      }
      return;
    }

    if (toolName === "afd_sync") {
      const remote = args.remote as string | undefined;
      if (!remote) { mcpError(id, -32602, "Missing required argument: remote"); return; }
      const direction = (args.direction === "push" || args.direction === "pull") ? args.direction : "both";
      const TIMEOUT_MS = 10_000;

      // Validate URL
      let remoteUrl: string;
      try {
        const u = new URL(remote);
        if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("protocol must be http or https");
        remoteUrl = u.toString();
      } catch (err: unknown) {
        mcpError(id, -32602, `Invalid remote URL: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }

      const syncResults: { direction: string; status: string; detail?: string }[] = [];

      try {
        // PULL: GET remote payload → POST each antibody to /antibodies/learn
        if (direction === "pull" || direction === "both") {
          const pullRes = await fetch(remoteUrl, {
            method: "GET",
            headers: { "Accept": "application/json", "User-Agent": "afd-sync/1.8" },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          if (!pullRes.ok) {
            syncResults.push({ direction: "pull", status: "error", detail: `HTTP ${pullRes.status} ${pullRes.statusText}` });
          } else {
            const json = await pullRes.json() as { antibodies?: unknown[] };
            if (!json || !Array.isArray(json.antibodies)) {
              syncResults.push({ direction: "pull", status: "error", detail: "Invalid response: missing antibodies array" });
            } else {
              let learned = 0;
              for (const ab of json.antibodies as Record<string, unknown>[]) {
                try {
                  const learnRes = await fetch(`http://127.0.0.1:${ctx.port}/antibodies/learn`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(ab),
                    signal: AbortSignal.timeout(2000),
                  });
                  if (learnRes.ok) learned++;
                } catch { /* skip individual failures */ }
              }
              syncResults.push({ direction: "pull", status: "ok", detail: `${learned}/${json.antibodies.length} antibodies learned` });
            }
          }
        }

        // PUSH: fetch local payload via /sync → POST to remote
        if (direction === "push" || direction === "both") {
          const localRes = await fetch(`http://127.0.0.1:${ctx.port}/sync`, {
            signal: AbortSignal.timeout(2000),
          });
          if (!localRes.ok) {
            syncResults.push({ direction: "push", status: "error", detail: "Failed to fetch local payload from daemon" });
          } else {
            const localPayload = await localRes.json() as { antibodyCount?: number };
            if ((localPayload.antibodyCount ?? 0) === 0) {
              syncResults.push({ direction: "push", status: "skip", detail: "No local antibodies to push" });
            } else {
              const pushRes = await fetch(remoteUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", "User-Agent": "afd-sync/1.8" },
                body: JSON.stringify(localPayload),
                signal: AbortSignal.timeout(TIMEOUT_MS),
              });
              if (!pushRes.ok) {
                syncResults.push({ direction: "push", status: "error", detail: `HTTP ${pushRes.status} ${pushRes.statusText}` });
              } else {
                syncResults.push({ direction: "push", status: "ok", detail: `${localPayload.antibodyCount} antibodies pushed` });
              }
            }
          }
        }

        mcpResponse(id, {
          content: [{ type: "text", text: JSON.stringify({ remote: remoteUrl, results: syncResults }, null, 2) }],
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
