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
import { subscriptionManager } from "./mcp-subscriptions";
import type { DaemonContext } from "./types";
import { assertInsideWorkspace as _assertWs } from "./guards";
import { shouldAcceptRemote } from "../core/federation";
import { listMeshPeers } from "./mesh";
import { estimateTokenSavings } from "../core/token-estimator";

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
      // Defense reasons from in-memory mistakeCache (not DB query — stays under 200ms)
      const reasonSet = new Set<string>();
      for (const entries of ctx.state.mistakeCache.values()) {
        for (const e of entries) {
          reasonSet.add(e.mistake_type);
          if (reasonSet.size >= 3) break;
        }
        if (reasonSet.size >= 3) break;
      }
      const latestLog = ctx.state.autoHealLog.length > 0
        ? ctx.state.autoHealLog[ctx.state.autoHealLog.length - 1]
        : null;
      const latestDefense = latestLog
        ? { file: latestLog.file, healMs: latestLog.healMs, at: latestLog.at }
        : null;
      // session_saved_tokens_k: DB의 오늘치 stats 사용
      // (MCP 프로세스와 HTTP 데몬이 별개 프로세스라 in-memory sessionOriginalChars는 항상 0)
      const todayStr = ctx.today();
      const dailyRows = ctx.getDailyAll.all();
      const todayRow = dailyRows.find(r => r.date === todayStr);
      const sessionSavedTokensK = todayRow
        ? Math.round(estimateTokenSavings(todayRow.original_chars, todayRow.hologram_chars) / 100) / 10
        : 0;
      return Response.json({
        status: "ON",
        healed_count: ctx.state.autoHealCount,
        last_healed: last,
        total_defenses: ctx.state.autoHealCount,
        defense_reasons: [...reasonSet],
        latest_defense: latestDefense,
        saved_tokens_k: Math.round(estimateTokenSavings(ctx.state.hologramStats.totalOriginalChars, ctx.state.hologramStats.totalHologramChars) / 100) / 10,
        session_saved_tokens_k: sessionSavedTokensK,
      });
    }

    // Track HTTP API calls as telemetry
    const _apiPath = url.pathname.replace(/^\//, "");
    if (["/hologram", "/read", "/diagnose", "/score", "/evolution", "/sync"].includes(url.pathname)) {
      try { ctx.insertTelemetry.run("mcp", `http_${_apiPath}`, null, null, Date.now()); } catch { /* crash-only */ }
    }

    if (url.pathname === "/hologram") {
      const file = url.searchParams.get("file");
      if (!file) return Response.json({ error: "?file= required" }, { status: 400 });
      try {
        const absPath = resolve(file);
        _assertWs(absPath, ctx.ws.root);
        const source = readFileSync(absPath, "utf-8");
        const contextFile = url.searchParams.get("contextFile");
        const nDepthParam = url.searchParams.get("nDepth");
        const nDepth = nDepthParam ? Math.min(parseInt(nDepthParam, 10), 3) : undefined;
        const opts: Record<string, unknown> = {};
        if (contextFile) opts.contextFile = resolve(contextFile);
        if (nDepth && nDepth >= 2) opts.nDepth = nDepth;
        const result = await generateHologram(file, source, opts as any);
        ctx.persistHologramStats(result.originalLength, result.hologramLength);
        return Response.json(result);
      } catch (err: unknown) {
        return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 404 });
      }
    }

    if (url.pathname === "/files") {
      try {
        const { readdirSync, statSync } = await import("fs");
        const { join, relative } = await import("path");
        const SKIP = new Set(["node_modules", ".git", ".afd", "dist", ".next", "__pycache__", "target"]);
        const EXT = new Set(["ts","tsx","js","jsx","py","pyi","go","rs","json","md","yaml","yml","toml"]);
        const files: string[] = [];
        function walk(dir: string, depth: number) {
          if (depth > 4 || files.length > 500) return;
          let entries: string[];
          try { entries = readdirSync(dir); } catch { return; }
          for (const e of entries) {
            if (e.startsWith(".") || SKIP.has(e)) continue;
            const full = join(dir, e);
            try {
              const st = statSync(full);
              if (st.isDirectory()) walk(full, depth + 1);
              else if (st.isFile()) {
                const ext = e.split(".").pop()?.toLowerCase() ?? "";
                if (EXT.has(ext)) files.push(relative(ctx.ws.root, full).replace(/\\/g, "/"));
              }
            } catch {}
          }
        }
        walk(ctx.ws.root, 0);
        files.sort();
        return Response.json({ root: ctx.ws.root, files });
      } catch (err) {
        return Response.json({ error: String(err) }, { status: 500 });
      }
    }

    if (url.pathname === "/workspace-map") {
      const mapText = ctx.getWorkspaceMap();
      const { totalProjectBytes, mapBytes } = ctx.getWorkspaceMapStats();
      if (totalProjectBytes > 0) {
        ctx.persistCtxSavings('wsmap', totalProjectBytes, Math.max(0, totalProjectBytes - mapBytes));
      }
      return new Response(mapText, { headers: { "Content-Type": "text/plain" } });
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
        const result = await generateHologram(file, source);
        ctx.persistHologramStats(result.originalLength, result.hologramLength);
        return Response.json({ file, hologram: result.hologram, mode: "hologram", originalSize: source.length, totalLines: source.split("\n").length });
      } catch (err: unknown) {
        return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 404 });
      }
    }

    if (url.pathname === "/mistake-history") {
      const file = url.searchParams.get("file");
      if (!file) return Response.json({ error: "?file= required" }, { status: 400 });
      const normalizedFile = file.replace(/\\/g, "/");
      const cached = ctx.state.mistakeCache.get(normalizedFile);
      return Response.json({ mistakes: cached ?? [] });
    }

    if (url.pathname === "/diagnose") {
      const raw = url.searchParams.get("raw") === "true";
      const known = ctx.antibodyIds.all().map(r => r.id);
      const result = diagnose(known, { raw });
      const PROACTIVE_HOLOGRAM_THRESHOLD = 5 * 1024;

      const enriched = await Promise.all(result.symptoms.map(async (s: { fileTarget: string; [k: string]: unknown }) => {
        const snapshot = ctx.state.fileSnapshots.get(s.fileTarget)
          ?? ctx.state.fileSnapshots.get(s.fileTarget.replace(/\//g, "\\"));
        if (!snapshot) return s;
        if (snapshot.length > PROACTIVE_HOLOGRAM_THRESHOLD) {
          const hologram = await ctx.safeHologram(s.fileTarget, snapshot);
          return {
            ...s, hologram,
            contextNote: `File is ${(snapshot.length / 1024).toFixed(1)}KB — hologram skeleton provided to save tokens (${Math.round((1 - hologram.length / snapshot.length) * 100)}% reduction).`,
          };
        }
        return { ...s, context: snapshot };
      }));
      return Response.json({ ...result, symptoms: enriched });
    }

    if (url.pathname === "/antibodies") {
      return Response.json({ antibodies: ctx.listAntibodies.all() });
    }

    if (url.pathname === "/antibodies/learn" && req.method === "POST") {
      try {
        const body = await req.json() as {
          id: string; patternType: string; fileTarget: string; patches: PatchOp[];
          scope?: string; version?: number; updatedAt?: string;
        };
        const scope = body.scope ?? "local";
        const incomingVersion = body.version ?? 1;
        const updatedAt = body.updatedAt ?? new Date().toISOString();
        // Non-local antibodies are stored under their fqid to avoid collisions
        const storageId = scope === "local" ? body.id : `${scope}/${body.id}`;

        const incomingPatch = JSON.stringify(body.patches);

        type ExistingRow = { ab_version: number; updated_at: string; patch_op: string } | null;
        const existing = ctx.db.prepare(
          "SELECT ab_version, updated_at, patch_op FROM antibodies WHERE id = ?"
        ).get(storageId) as ExistingRow;

        if (existing) {
          const decision = shouldAcceptRemote(
            { version: incomingVersion, updatedAt, patch: incomingPatch },
            { version: existing.ab_version, updatedAt: existing.updated_at, patch: existing.patch_op },
          );
          if (!decision.accept) {
            return Response.json({ status: "skipped", reason: decision.reason, id: storageId });
          }
          ctx.db.prepare(
            "UPDATE antibodies SET patch_op = ?, file_target = ?, ab_version = ?, updated_at = ?, scope = ? WHERE id = ?"
          ).run(incomingPatch, body.fileTarget, incomingVersion, updatedAt, scope, storageId);
          return Response.json({ status: "updated", reason: decision.reason, id: storageId });
        }

        ctx.insertAntibody.run(storageId, body.patternType, body.fileTarget, JSON.stringify(body.patches));
        subscriptionManager.dispatchResourceUpdated("afd://antibodies");
        ctx.db.prepare(
          "UPDATE antibodies SET scope = ?, ab_version = ?, updated_at = ? WHERE id = ?"
        ).run(scope, incomingVersion, updatedAt, storageId);
        return Response.json({ status: "learned", id: storageId });
      } catch (err: unknown) {
        return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
      }
    }

    if (url.pathname === "/auto-heal/record" && req.method === "POST") {
      try {
        const body = await req.json() as { id: string; file?: string; healMs?: number };
        ctx.state.autoHealCount++;
        ctx.state.autoHealLog.push({ id: body.id, at: Date.now(), file: body.file ?? body.id, healMs: body.healMs ?? 0 });
        if (ctx.state.autoHealLog.length > 100) ctx.state.autoHealLog.shift();
        try { ctx.insertTelemetry.run("immune", "heal_hit", JSON.stringify({ antibodyId: body.id }), null, Date.now()); } catch { /* crash-only */ }
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
      const ctxDailyRaw = ctx.getCtxSavingsDaily.all() as { date: string; type: string; requests: number; original_chars: number; saved_chars: number }[];
      const ctxLifetimeRaw = ctx.getCtxSavingsLifetime.all() as { type: string; total_requests: number; total_original_chars: number; total_saved_chars: number }[];
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
        ctxSavings: {
          daily: ctxDailyRaw,
          lifetime: ctxLifetimeRaw,
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
      type AntibodyRow = { id: string; pattern_type: string; file_target: string; patch_op: string; created_at: string; scope?: string; ab_version?: number; updated_at?: string };
      const rows = ctx.listAntibodies.all() as AntibodyRow[];
      const sanitized = rows.flatMap(r => {
        let patches: PatchOp[];
        try { patches = JSON.parse(r.patch_op) as PatchOp[]; } catch { return []; }
        const cleanPatches = patches.map(p => ({
          ...p,
          path: p.path.replace(/^[A-Za-z]:/, "").replace(/\\/g, "/"),
          value: p.value?.replace(/[A-Za-z]:\\[^\s"']*/g, "<redacted>"),
        }));
        const scope = r.scope ?? "local";
        const cleanId = r.id.replace(/^[A-Za-z]:/, "").replace(/\\/g, "/");
        // fqid: non-local ids are already stored as "<scope>/<name>", local use "local/<id>"
        const fqid = scope !== "local" ? cleanId : `local/${cleanId}`;
        return [{
          id: cleanId,
          scope,
          fqid,
          patternType: r.pattern_type,
          fileTarget: r.file_target.replace(/^[A-Za-z]:/, "").replace(/\\/g, "/"),
          patches: cleanPatches,
          version: r.ab_version ?? 1,
          updatedAt: r.updated_at ?? r.created_at,
          learnedAt: r.created_at,
        }];
      });
      const payload = {
        version: "1.7", generatedAt: new Date().toISOString(),
        ecosystem: ctx.state.ecosystems[0]?.adapter.name ?? "Unknown",
        scope: "local",  // publisher scope — overridden by CLI syncRemotePush
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

    if (url.pathname === "/telemetry") {
      const days = parseInt(url.searchParams.get("days") ?? "7", 10) || 7;
      const since = Date.now() - days * 86_400_000;
      try {
        const rows = ctx.db.prepare(
          "SELECT category, action, COUNT(*) as cnt, AVG(duration_ms) as avg_ms FROM telemetry WHERE timestamp >= ? GROUP BY category, action ORDER BY cnt DESC"
        ).all(since) as { category: string; action: string; cnt: number; avg_ms: number | null }[];
        return Response.json({ days, rows });
      } catch {
        return Response.json({ days, rows: [] });
      }
    }

    if (url.pathname === "/mesh/peers") {
      return Response.json(listMeshPeers(ctx.ws.root));
    }

    if (url.pathname === "/stop") {
      cleanup();
      setTimeout(() => process.exit(0), 100);
      return Response.json({ status: "stopping" });
    }

    // ── Web Dashboard ──
    if (url.pathname === "/dashboard") {
      try {
        let html = readFileSync(resolve(import.meta.dirname, "dashboard.html"), "utf-8");
        const { getSystemLanguage } = await import("../core/locale");
        const lang = getSystemLanguage();
        const i18n = lang === "ko" ? {
          todaySavings:"오늘의 절약량",lifetimeRoi:"누적 ROI",weekHistory:"최근 7일 내역",
          immune:"면역 시스템",liveEvents:"실시간 이벤트",files:"파일 탐색",hologram:"홀로그램",
          original:"원본",actual:"실제",saved:"절약",antibodies:"항체",autoHealed:"자동 치유",
          massSkipped:"대량 이벤트 무시",dormant:"휴면 전환",estValue:"추정 가치",totalSaved:"총 절약량",
          wsmap:"워크스페이스 맵",pinpoint:"핀포인트",noData:"afd_read 또는 afd_hologram 사용 시 추적 시작",
          noHistory:"일별 기록 없음",searchFiles:"파일 검색...",selectFile:"조회할 파일을 선택하세요",
          loading:"불러오는 중...",nDepthDeps:"N-Depth 종속성",overview:"개요",explorer:"홀로그램 탐색기",
          savePct:"절약됨",lang:"ko"
        } : {
          todaySavings:"Today's Savings",lifetimeRoi:"Lifetime ROI",weekHistory:"7-Day History",
          immune:"Immune System",liveEvents:"Live Events",files:"Files",hologram:"Hologram",
          original:"Original",actual:"Actual",saved:"Saved",antibodies:"Antibodies",autoHealed:"Auto-healed",
          massSkipped:"Mass events skipped",dormant:"Dormant transitions",estValue:"Est. Value",totalSaved:"Total Saved",
          wsmap:"W/S Map",pinpoint:"Pinpoint",noData:"Use afd_read or afd_hologram to start tracking",
          noHistory:"No daily history yet",searchFiles:"Search files...",selectFile:"Select a file to explore",
          loading:"Loading...",nDepthDeps:"N-Depth Dependencies",overview:"Overview",explorer:"Hologram Explorer",
          savePct:"saved",lang:"en"
        };
        html = html.replace("/*{{I18N}}*/", "window.T=" + JSON.stringify(i18n) + ";");
        return new Response(html, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Security-Policy": "default-src 'self' 'unsafe-inline'",
          },
        });
      } catch {
        return new Response("<h1>dashboard.html not found</h1>", {
          status: 404,
          headers: { "Content-Type": "text/html" },
        });
      }
    }

    return Response.json({ error: "not found" }, { status: 404 });
  };
}
