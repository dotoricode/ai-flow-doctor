/**
 * HTTP routes for daemon IPC — extracted from server.ts.
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { generateHologram } from "../core/hologram";
import { diagnose } from "../core/immune";
import type { PatchOp } from "../core/immune";
import { buildShiftSummary } from "../core/boast";
import { analyzeQuarantine, listQuarantine, evolve } from "../core/evolution";
import { MAX_SSE_CLIENTS } from "./types";
import type { DaemonContext } from "./types";
import { assertInsideWorkspace as _assertWs } from "./guards";

/** Create the HTTP fetch handler for Bun.serve */
export function createHttpHandler(ctx: DaemonContext, cleanup: () => void) {
  return async function fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return Response.json({ status: "alive", pid: process.pid, workspace: ctx.ws.root, port: ctx.port });
    }

    if (url.pathname === "/mini-status") {
      const last = ctx.state.autoHealLog.length > 0
        ? ctx.state.autoHealLog[ctx.state.autoHealLog.length - 1].id
        : null;
      return Response.json({ status: "ON", healed_count: ctx.state.autoHealCount, last_healed: last });
    }

    if (url.pathname === "/hologram") {
      const file = url.searchParams.get("file");
      if (!file) return Response.json({ error: "?file= required" }, { status: 400 });
      try {
        const absPath = resolve(file);
        _assertWs(absPath, ctx.ws.root);
        const source = readFileSync(absPath, "utf-8");
        const result = generateHologram(file, source);
        ctx.persistHologramStats(result.originalLength, result.hologramLength);
        return Response.json(result);
      } catch (err: unknown) {
        return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 404 });
      }
    }

    if (url.pathname === "/workspace-map") {
      return new Response(ctx.getWorkspaceMap(), { headers: { "Content-Type": "text/plain" } });
    }

    if (url.pathname === "/read") {
      const file = url.searchParams.get("file");
      if (!file) return Response.json({ error: "?file= required" }, { status: 400 });
      try {
        const AFD_READ_THRESHOLD = 10 * 1024;
        const absPath = resolve(file);
        _assertWs(absPath, ctx.ws.root);
        const source = readFileSync(absPath, "utf-8");
        const rawStart = parseInt(url.searchParams.get("startLine") ?? "", 10);
        const rawEnd = parseInt(url.searchParams.get("endLine") ?? "", 10);

        if (Number.isFinite(rawStart) && Number.isFinite(rawEnd)) {
          const lines = source.split("\n");
          const s = Math.max(1, rawStart) - 1;
          const e = Math.min(lines.length, rawEnd);
          return Response.json({ file, lines: lines.slice(s, e), range: [s + 1, e], totalLines: lines.length });
        }
        if (source.length < AFD_READ_THRESHOLD) {
          return Response.json({ file, content: source, mode: "full" });
        }
        const result = generateHologram(file, source);
        ctx.persistHologramStats(result.originalLength, result.hologramLength);
        return Response.json({ file, hologram: result.hologram, mode: "hologram", originalSize: source.length, totalLines: source.split("\n").length });
      } catch (err: unknown) {
        return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 404 });
      }
    }

    if (url.pathname === "/diagnose") {
      const raw = url.searchParams.get("raw") === "true";
      const known = ctx.antibodyIds.all().map(r => r.id);
      const result = diagnose(known, { raw });
      const PROACTIVE_HOLOGRAM_THRESHOLD = 5 * 1024;

      const enriched = result.symptoms.map((s: { fileTarget: string; [k: string]: unknown }) => {
        const snapshot = ctx.state.fileSnapshots.get(s.fileTarget)
          ?? ctx.state.fileSnapshots.get(s.fileTarget.replace(/\//g, "\\"));
        if (!snapshot) return s;
        if (snapshot.length > PROACTIVE_HOLOGRAM_THRESHOLD) {
          const hologram = ctx.safeHologram(s.fileTarget, snapshot);
          return {
            ...s, hologram,
            contextNote: `File is ${(snapshot.length / 1024).toFixed(1)}KB — hologram skeleton provided to save tokens (${Math.round((1 - hologram.length / snapshot.length) * 100)}% reduction).`,
          };
        }
        return { ...s, context: snapshot };
      });
      return Response.json({ ...result, symptoms: enriched });
    }

    if (url.pathname === "/antibodies") {
      return Response.json({ antibodies: ctx.listAntibodies.all() });
    }

    if (url.pathname === "/antibodies/learn" && req.method === "POST") {
      try {
        const body = await req.json() as { id: string; patternType: string; fileTarget: string; patches: PatchOp[] };
        ctx.insertAntibody.run(body.id, body.patternType, body.fileTarget, JSON.stringify(body.patches));
        return Response.json({ status: "learned", id: body.id });
      } catch (err: unknown) {
        return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
      }
    }

    if (url.pathname === "/auto-heal/record" && req.method === "POST") {
      try {
        const body = await req.json() as { id: string };
        ctx.state.autoHealCount++;
        ctx.state.autoHealLog.push({ id: body.id, at: Date.now() });
        if (ctx.state.autoHealLog.length > 100) ctx.state.autoHealLog.shift();
        return Response.json({ status: "recorded", total: ctx.state.autoHealCount });
      } catch (err: unknown) {
        return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
      }
    }

    if (url.pathname === "/score") {
      const uptime = Math.floor((Date.now() - ctx.state.startedAt) / 1000);
      const eventCount = ctx.db.query("SELECT COUNT(*) as cnt FROM events").get() as { cnt: number };
      const abCount = ctx.countAntibodies.get() as { cnt: number };
      const hs = ctx.state.hologramStats;
      const globalSavings = hs.totalOriginalChars > 0
        ? Math.round((hs.totalOriginalChars - hs.totalHologramChars) / hs.totalOriginalChars * 1000) / 10
        : 0;
      const dailyRows = ctx.getDailyAll.all() as { date: string; requests: number; original_chars: number; hologram_chars: number }[];
      const todayRow = dailyRows.find(r => r.date === ctx.today());
      return Response.json({
        uptime,
        filesDetected: ctx.state.filesDetected,
        totalEvents: eventCount.cnt,
        lastEvent: ctx.state.lastEvent,
        lastEventAt: ctx.state.lastEventAt,
        watchedFiles: [...ctx.state.watchedFiles],
        watchTargets: ctx.discoveryTargets,
        hologram: {
          lifetime: { requests: hs.totalRequests, originalChars: hs.totalOriginalChars, hologramChars: hs.totalHologramChars, savings: globalSavings },
          today: todayRow ? {
            requests: todayRow.requests, originalChars: todayRow.original_chars, hologramChars: todayRow.hologram_chars,
            savings: todayRow.original_chars > 0 ? Math.round((todayRow.original_chars - todayRow.hologram_chars) / todayRow.original_chars * 1000) / 10 : 0,
          } : null,
          daily: dailyRows.map(r => ({ date: r.date, requests: r.requests, originalChars: r.original_chars, hologramChars: r.hologram_chars })),
        },
        immune: {
          antibodies: abCount.cnt,
          autoHealed: ctx.state.autoHealCount,
          lastAutoHeal: ctx.state.autoHealLog.length > 0 ? ctx.state.autoHealLog[ctx.state.autoHealLog.length - 1] : null,
        },
        ecosystem: {
          detected: ctx.state.ecosystems.map(e => ({ name: e.adapter.name, confidence: e.confidence, schema: e.adapter.getHarnessSchema() })),
          primary: ctx.state.ecosystems[0]?.adapter.name ?? "Unknown",
        },
        suppression: {
          massEventsSkipped: ctx.state.suppressionSkippedCount,
          dormantTransitions: ctx.state.dormantTransitions.length,
          activeTaps: ctx.state.firstTapTimestamps.size,
        },
        evolution: (() => {
          const q = listQuarantine();
          return { totalQuarantined: q.length, totalLearned: q.filter(e => e.learned).length, pending: q.filter(e => !e.learned).length };
        })(),
        dynamicImmune: {
          activeValidators: ctx.state.customValidators.size,
          validatorNames: [...ctx.state.customValidators.keys()],
        },
      });
    }

    if (url.pathname === "/evolution") {
      return Response.json(evolve());
    }

    if (url.pathname === "/evolution/status") {
      const q = listQuarantine();
      const stats = analyzeQuarantine();
      return Response.json({
        totalQuarantined: q.length, totalLearned: q.filter(e => e.learned).length, pending: stats.pending,
        lessons: stats.lessons.map(l => ({ file: l.entry.originalPath, type: l.failureType, timestamp: l.entry.timestamp, suggestion: l.suggestion })),
      });
    }

    if (url.pathname === "/sync") {
      const rows = ctx.listAntibodies.all() as { id: string; pattern_type: string; file_target: string; patch_op: string; created_at: string }[];
      const sanitized = rows.flatMap(r => {
        let patches: PatchOp[];
        try { patches = JSON.parse(r.patch_op) as PatchOp[]; } catch { return []; }
        const cleanPatches = patches.map(p => ({
          ...p,
          path: p.path.replace(/^[A-Za-z]:/, "").replace(/\\/g, "/"),
          value: p.value?.replace(/[A-Za-z]:\\[^\s"']*/g, "<redacted>"),
        }));
        return [{ id: r.id, patternType: r.pattern_type, fileTarget: r.file_target.replace(/^[A-Za-z]:/, "").replace(/\\/g, "/"), patches: cleanPatches, learnedAt: r.created_at }];
      });
      const payload = {
        version: "0.1.0", generatedAt: new Date().toISOString(),
        ecosystem: ctx.state.ecosystems[0]?.adapter.name ?? "Unknown",
        antibodyCount: sanitized.length, antibodies: sanitized,
      };
      const payloadPath = resolve(ctx.ws.afdDir, "global-vaccine-payload.json");
      writeFileSync(payloadPath, JSON.stringify(payload, null, 2), "utf-8");
      return Response.json({ status: "exported", path: payloadPath, count: sanitized.length });
    }

    if (url.pathname === "/shift-summary") {
      const uptime = Math.floor((Date.now() - ctx.state.startedAt) / 1000);
      const eventCount = ctx.db.query("SELECT COUNT(*) as cnt FROM events").get() as { cnt: number };
      const hs = ctx.state.hologramStats;
      const hologramSavedChars = Math.max(0, hs.totalOriginalChars - hs.totalHologramChars);
      return Response.json(buildShiftSummary({
        uptimeSeconds: uptime, totalEvents: eventCount.cnt, healsPerformed: ctx.state.autoHealCount,
        totalFileBytesSaved: ctx.state.totalFileBytesSaved, suppressionsSkipped: ctx.state.suppressionSkippedCount,
        dormantTransitions: ctx.state.dormantTransitions.length, hologramSavedChars,
      }));
    }

    if (url.pathname === "/events") {
      if (ctx.state.sseClients.size >= MAX_SSE_CLIENTS) {
        return Response.json({ error: "Too many SSE clients" }, { status: 429 });
      }
      let sseController: ReadableStreamDefaultController<Uint8Array> | null = null;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) { sseController = controller; ctx.state.sseClients.add(controller); },
        cancel() { if (sseController) ctx.state.sseClients.delete(sseController); },
      });
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
      });
    }

    if (url.pathname === "/stop") {
      cleanup();
      setTimeout(() => process.exit(0), 100);
      return Response.json({ status: "stopping" });
    }

    return Response.json({ error: "not found" }, { status: 404 });
  };
}
