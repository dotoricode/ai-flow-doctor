import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, join } from "path";
import { daemonRequest, getMeshPeers } from "../daemon/client";
import { AFD_DIR } from "../constants";
import { getSystemLanguage } from "../core/locale";
import { resolveScope } from "../core/federation";
import type { FederatedAntibody, FederatedPayload } from "../core/federation";

interface SyncResponse {
  status: string;
  path: string;
  count: number;
}

// Re-export federated types under legacy names for local push/pull compatibility
type VaccinePayload = FederatedPayload;
type VaccineAntibody = FederatedAntibody;

interface SyncOptions {
  push?: boolean;
  pull?: boolean;
  remote?: string;
  localMesh?: boolean;
}

const msgs = {
  en: {
    title: "afd sync — Vaccine Network",
    ecosystem: "Ecosystem",
    antibodies: "Antibodies",
    generated: "Generated",
    payload: "Payload",
    noAntibodies: "No antibodies to export. Run `afd fix` first.",
    exported: "Vaccine payload generated.",
    pushTitle: "afd sync --push",
    pushSuccess: "Pushed to team vaccine store",
    pushCreated: "Created team vaccine store",
    pullTitle: "afd sync --pull",
    pullSuccess: "Pulled from team vaccine store",
    pullMerged: "merged",
    pullNew: "new",
    pullSkipped: "skipped (already known)",
    pullNoStore: "No team vaccine store found.",
    pullHint: "Run `afd sync --push` first to create the shared store.",
    learnedVia: "Learned via pull",
    ready: "antibody(ies) ready for global federation.",
    // Remote
    remotePushTitle: "afd sync --push --remote",
    remotePushSuccess: "Pushed to remote vaccine store",
    remotePullTitle: "afd sync --pull --remote",
    remotePullSuccess: "Pulled from remote vaccine store",
    remoteSyncTitle: "afd sync --remote (bidirectional)",
    remoteInvalidUrl: "Invalid URL. Must start with http:// or https://",
    remoteTimeout: "Request timed out (10s)",
    remoteNetworkError: "Network error",
    remoteInvalidResponse: "Invalid response payload from remote",
    remoteStatusError: "Remote returned error status",
  },
  ko: {
    title: "afd sync — 백신 네트워크",
    ecosystem: "에코시스템",
    antibodies: "항체",
    generated: "생성일",
    payload: "페이로드",
    noAntibodies: "내보낼 항체가 없습니다. `afd fix`를 먼저 실행하세요.",
    exported: "백신 페이로드 생성 완료.",
    pushTitle: "afd sync --push",
    pushSuccess: "팀 백신 저장소에 푸시 완료",
    pushCreated: "팀 백신 저장소 생성",
    pullTitle: "afd sync --pull",
    pullSuccess: "팀 백신 저장소에서 풀 완료",
    pullMerged: "병합됨",
    pullNew: "신규",
    pullSkipped: "건너뜀 (이미 존재)",
    pullNoStore: "팀 백신 저장소를 찾을 수 없습니다.",
    pullHint: "`afd sync --push`를 먼저 실행하여 공유 저장소를 생성하세요.",
    learnedVia: "풀로 학습됨",
    ready: "개 항체가 글로벌 페더레이션 준비 완료.",
    // 원격
    remotePushTitle: "afd sync --push --remote",
    remotePushSuccess: "원격 백신 저장소에 푸시 완료",
    remotePullTitle: "afd sync --pull --remote",
    remotePullSuccess: "원격 백신 저장소에서 풀 완료",
    remoteSyncTitle: "afd sync --remote (양방향 동기화)",
    remoteInvalidUrl: "올바르지 않은 URL입니다. http:// 또는 https://로 시작해야 합니다.",
    remoteTimeout: "요청 시간 초과 (10초)",
    remoteNetworkError: "네트워크 오류",
    remoteInvalidResponse: "원격 서버의 응답 페이로드가 올바르지 않습니다.",
    remoteStatusError: "원격 서버가 오류 상태를 반환했습니다.",
  },
};

const TEAM_STORE_DIR = join(AFD_DIR, "team-vaccines");
const TEAM_PAYLOAD_FILE = join(TEAM_STORE_DIR, "shared-vaccine-payload.json");

export async function syncCommand(opts: SyncOptions = {}) {
  const lang = getSystemLanguage();
  const m = msgs[lang];

  if (opts.localMesh) {
    await syncLocalMesh(m);
    return;
  }

  if (opts.remote) {
    const url = validateRemoteUrl(opts.remote, m);
    if (!url) return;

    if (opts.push && !opts.pull) {
      await syncRemotePush(url, m);
    } else if (opts.pull && !opts.push) {
      await syncRemotePull(url, m);
    } else {
      // --remote alone (or both flags): bidirectional — pull first, then push
      await syncRemotePull(url, m);
      await syncRemotePush(url, m);
    }
    return;
  }

  if (opts.push) {
    await syncPush(m);
    return;
  }

  if (opts.pull) {
    await syncPull(m);
    return;
  }

  // Default: export local payload (original behavior)
  await syncExport(m);
}

// ─── Local mesh sync ─────────────────────────────────────────────────────────

/**
 * Bidirectional antibody sync across all live mesh peers (monorepo daemons).
 * For each peer:
 *   1. Pull their antibodies → POST to our /antibodies/learn
 *   2. Push our antibodies  → POST to their /antibodies/learn
 * Conflict arbitration is handled by shouldAcceptRemote() on each daemon's side.
 */
async function syncLocalMesh(m: typeof msgs.en) {
  const BOX = { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│", ml: "├", mr: "┤" };
  const W = 60;
  const hline = (l: string, r: string) => `${l}${BOX.h.repeat(W)}${r}`;
  const row = (s: string) => `${BOX.v} ${s}${" ".repeat(Math.max(0, W - 2 - s.length))} ${BOX.v}`;

  let peers: Awaited<ReturnType<typeof getMeshPeers>>;
  try {
    peers = await getMeshPeers();
  } catch {
    console.error("[afd sync] Daemon not running. Start with `afd start`.");
    process.exit(1);
  }

  console.log(hline(BOX.tl, BOX.tr));
  console.log(row(`🔗 afd sync --local-mesh`));
  console.log(hline(BOX.ml, BOX.mr));

  if (peers.length === 0) {
    console.log(row("No live mesh peers found. Start daemons in other workspaces."));
    console.log(hline(BOX.bl, BOX.br));
    return;
  }

  // Fetch our own antibodies once
  const ours = (await daemonRequest<{ antibodies: AntibodyRow[] }>("/antibodies")).antibodies;

  let totalPulled = 0;
  let totalPushed = 0;

  for (const peer of peers) {
    const baseUrl = `http://127.0.0.1:${peer.port}`;
    console.log(row(`Peer: ${peer.workspace} (port ${peer.port})`));

    // 1. Pull from peer
    try {
      const theirData = await fetchJson<{ antibodies: AntibodyRow[] }>(`${baseUrl}/antibodies`);
      for (const ab of theirData.antibodies) {
        await daemonRequest<unknown>("/antibodies/learn", "POST", {
          id: ab.id,
          patternType: ab.pattern_type,
          fileTarget: ab.file_target,
          patches: JSON.parse(ab.patch_op),
          scope: ab.scope ?? "local",
          version: ab.ab_version ?? 1,
          updatedAt: ab.updated_at,
        });
        totalPulled++;
      }
    } catch {
      console.log(row(`  ⚠ Pull failed (peer may be busy)`));
    }

    // 2. Push to peer
    try {
      for (const ab of ours) {
        await fetchJson<unknown>(`${baseUrl}/antibodies/learn`, {
          method: "POST",
          body: JSON.stringify({
            id: ab.id,
            patternType: ab.pattern_type,
            fileTarget: ab.file_target,
            patches: JSON.parse(ab.patch_op),
            scope: ab.scope ?? "local",
            version: ab.ab_version ?? 1,
            updatedAt: ab.updated_at,
          }),
          headers: { "Content-Type": "application/json" },
        });
        totalPushed++;
      }
    } catch {
      console.log(row(`  ⚠ Push failed (peer may be busy)`));
    }
  }

  console.log(hline(BOX.ml, BOX.mr));
  console.log(row(`✅ Synced ${peers.length} peer(s) — pulled ${totalPulled}, pushed ${totalPushed}`));
  console.log(hline(BOX.bl, BOX.br));
}

interface AntibodyRow {
  id: string;
  pattern_type: string;
  file_target: string;
  patch_op: string;
  scope: string;
  ab_version: number;
  updated_at: string;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as T;
}

// ─── Remote helpers ───────────────────────────────────────────────────────────

const REMOTE_TIMEOUT_MS = 10_000;

function validateRemoteUrl(raw: string, m: typeof msgs.en): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
    return u.toString();
  } catch {
    console.error(`[afd sync] ${m.remoteInvalidUrl}: ${raw}`);
    return null;
  }
}

async function syncRemotePush(url: string, m: typeof msgs.en) {
  // 1. Export latest local payload via daemon
  let result: SyncResponse;
  try {
    result = await daemonRequest<SyncResponse>("/sync");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[afd sync] ${msg}`);
    process.exit(1);
  }

  if (result.count === 0) {
    console.log(`[afd sync] ${m.noAntibodies}`);
    return;
  }

  const localPayloadPath = resolve(AFD_DIR, "global-vaccine-payload.json");
  const rawPayload: VaccinePayload = JSON.parse(readFileSync(localPayloadPath, "utf-8"));

  // Stamp publisher scope on all antibodies before sending
  const publisherScope = resolveScope();
  const now = new Date().toISOString();
  const payload: VaccinePayload = {
    ...rawPayload,
    version: "1.7",
    scope: publisherScope,
    antibodies: rawPayload.antibodies.map(ab => ({
      ...ab,
      scope: publisherScope,
      fqid: `${publisherScope}/${ab.id}`,
      version: ab.version ?? 1,
      updatedAt: ab.updatedAt ?? ab.learnedAt ?? now,
    })),
  };

  // 2. POST to remote
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "afd-sync/1.7" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
    });
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    console.error(`[afd sync] ${isTimeout ? m.remoteTimeout : m.remoteNetworkError}: ${url}`);
    process.exit(1);
  }

  if (!res.ok) {
    console.error(`[afd sync] ${m.remoteStatusError} ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const BOX = { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│", ml: "├", mr: "┤" };
  const W = 50;
  const line = (l: string, r: string) => `${l}${BOX.h.repeat(W)}${r}`;
  const row = (s: string) => `${BOX.v}  ${s}${" ".repeat(Math.max(0, W - 2 - s.length))}${BOX.v}`;

  console.log(line(BOX.tl, BOX.tr));
  console.log(row(`📤 ${m.remotePushTitle}`));
  console.log(line(BOX.ml, BOX.mr));
  console.log(row(`${m.antibodies}: ${payload.antibodyCount}`));
  console.log(row(`URL: ${url}`));
  console.log(line(BOX.ml, BOX.mr));
  console.log(row(`✅ ${m.remotePushSuccess}`));
  console.log(line(BOX.bl, BOX.br));
}

async function syncRemotePull(url: string, m: typeof msgs.en) {
  // 1. GET payload from remote
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json", "User-Agent": "afd-sync/1.7" },
      signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
    });
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    console.error(`[afd sync] ${isTimeout ? m.remoteTimeout : m.remoteNetworkError}: ${url}`);
    process.exit(1);
  }

  if (!res.ok) {
    console.error(`[afd sync] ${m.remoteStatusError} ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  let remotePayload: VaccinePayload;
  try {
    const json = await res.json();
    if (!json || !Array.isArray(json.antibodies)) throw new Error("missing antibodies array");
    remotePayload = json as VaccinePayload;
  } catch {
    console.error(`[afd sync] ${m.remoteInvalidResponse}`);
    process.exit(1);
  }

  // 2. Learn each antibody into the running daemon (same as local pull)
  let newCount = 0;
  let skippedCount = 0;
  const results: { id: string; status: string }[] = [];

  for (const ab of remotePayload.antibodies) {
    try {
      const learnRes = await fetch(
        `http://127.0.0.1:${getDaemonPort()}/antibodies/learn`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: ab.id,
            scope: ab.scope ?? remotePayload.scope ?? "remote",
            version: ab.version ?? 1,
            updatedAt: ab.updatedAt ?? ab.learnedAt,
            patternType: ab.patternType,
            fileTarget: ab.fileTarget,
            patches: ab.patches,
          }),
          signal: AbortSignal.timeout(2000),
        }
      );
      if (learnRes.ok) {
        results.push({ id: ab.id, status: m.pullNew });
        newCount++;
      } else {
        results.push({ id: ab.id, status: m.pullSkipped });
        skippedCount++;
      }
    } catch {
      results.push({ id: ab.id, status: m.pullSkipped });
      skippedCount++;
    }
  }

  const BOX = { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│", ml: "├", mr: "┤" };
  const W = 50;
  const line = (l: string, r: string) => `${l}${BOX.h.repeat(W)}${r}`;
  const row = (s: string) => `${BOX.v}  ${s}${" ".repeat(Math.max(0, W - 2 - s.length))}${BOX.v}`;

  console.log(line(BOX.tl, BOX.tr));
  console.log(row(`📥 ${m.remotePullTitle}`));
  console.log(line(BOX.ml, BOX.mr));
  console.log(row(`URL: ${url}`));
  console.log(line(BOX.ml, BOX.mr));

  for (const r of results) {
    const icon = r.status === m.pullNew ? "✅" : "⏭️";
    console.log(row(`${icon} ${r.id}: ${r.status}`));
  }

  console.log(line(BOX.ml, BOX.mr));
  console.log(row(`✅ ${m.remotePullSuccess}: ${newCount} ${m.pullMerged}, ${skippedCount} ${m.pullSkipped}`));
  console.log(line(BOX.bl, BOX.br));
}

async function syncExport(m: typeof msgs.en) {
  let result: SyncResponse;
  try {
    result = await daemonRequest<SyncResponse>("/sync");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[afd sync] ${msg}`);
    process.exit(1);
  }

  if (result.count === 0) {
    console.log(`[afd sync] ${m.noAntibodies}`);
    return;
  }

  const payloadPath = resolve(AFD_DIR, "global-vaccine-payload.json");
  const payload = JSON.parse(readFileSync(payloadPath, "utf-8"));
  renderPayloadBox(payload, m);
  console.log(`\n[afd sync] ${m.exported} ${result.count} ${m.ready}`);
}

async function syncPush(m: typeof msgs.en) {
  // First, export latest payload
  let result: SyncResponse;
  try {
    result = await daemonRequest<SyncResponse>("/sync");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[afd sync] ${msg}`);
    process.exit(1);
  }

  if (result.count === 0) {
    console.log(`[afd sync] ${m.noAntibodies}`);
    return;
  }

  // Copy to team store
  const localPayloadPath = resolve(AFD_DIR, "global-vaccine-payload.json");
  const localPayload = readFileSync(localPayloadPath, "utf-8");

  mkdirSync(TEAM_STORE_DIR, { recursive: true });

  // Merge with existing team payload if present
  let teamPayload: VaccinePayload;
  if (existsSync(TEAM_PAYLOAD_FILE)) {
    try {
      teamPayload = JSON.parse(readFileSync(TEAM_PAYLOAD_FILE, "utf-8"));
    } catch {
      teamPayload = JSON.parse(localPayload);
    }
    // Merge: add new antibodies, update existing ones
    const newPayload = JSON.parse(localPayload) as VaccinePayload;
    const existingIds = new Set(teamPayload.antibodies.map(a => a.id));
    for (const ab of newPayload.antibodies) {
      if (existingIds.has(ab.id)) {
        // Update existing
        const idx = teamPayload.antibodies.findIndex(a => a.id === ab.id);
        if (idx >= 0) teamPayload.antibodies[idx] = ab;
      } else {
        teamPayload.antibodies.push(ab);
      }
    }
    teamPayload.antibodyCount = teamPayload.antibodies.length;
    teamPayload.generatedAt = new Date().toISOString();
  } else {
    teamPayload = JSON.parse(localPayload);
    console.log(`[afd sync] ${m.pushCreated}`);
  }

  writeFileSync(TEAM_PAYLOAD_FILE, JSON.stringify(teamPayload, null, 2), "utf-8");

  const BOX = { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│", ml: "├", mr: "┤" };
  const W = 50;
  const line = (l: string, r: string) => `${l}${BOX.h.repeat(W)}${r}`;
  const row = (s: string) => `${BOX.v}  ${s}${" ".repeat(Math.max(0, W - 2 - s.length))}${BOX.v}`;

  console.log(line(BOX.tl, BOX.tr));
  console.log(row(`📤 ${m.pushTitle}`));
  console.log(line(BOX.ml, BOX.mr));
  console.log(row(`${m.antibodies}: ${teamPayload.antibodyCount}`));
  console.log(row(`${m.payload}: ${TEAM_PAYLOAD_FILE}`));
  console.log(line(BOX.ml, BOX.mr));
  console.log(row(`✅ ${m.pushSuccess}`));
  console.log(line(BOX.bl, BOX.br));
}

async function syncPull(m: typeof msgs.en) {
  if (!existsSync(TEAM_PAYLOAD_FILE)) {
    console.log(`[afd sync] ${m.pullNoStore}`);
    console.log(`[afd sync] ${m.pullHint}`);
    return;
  }

  let teamPayload: VaccinePayload;
  try {
    teamPayload = JSON.parse(readFileSync(TEAM_PAYLOAD_FILE, "utf-8"));
  } catch {
    console.error("[afd sync] Failed to parse team vaccine payload.");
    process.exit(1);
  }

  // Learn each antibody into the daemon
  let newCount = 0;
  let skippedCount = 0;
  const results: { id: string; status: string }[] = [];

  for (const ab of teamPayload.antibodies) {
    try {
      // Try to learn via daemon API
      const res = await fetch(`http://127.0.0.1:${getDaemonPort()}/antibodies/learn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: ab.id,
          patternType: ab.patternType,
          fileTarget: ab.fileTarget,
          patches: ab.patches,
        }),
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        results.push({ id: ab.id, status: m.pullNew });
        newCount++;
      } else {
        results.push({ id: ab.id, status: m.pullSkipped });
        skippedCount++;
      }
    } catch {
      results.push({ id: ab.id, status: m.pullSkipped });
      skippedCount++;
    }
  }

  const BOX = { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│", ml: "├", mr: "┤" };
  const W = 50;
  const line = (l: string, r: string) => `${l}${BOX.h.repeat(W)}${r}`;
  const row = (s: string) => `${BOX.v}  ${s}${" ".repeat(Math.max(0, W - 2 - s.length))}${BOX.v}`;

  console.log(line(BOX.tl, BOX.tr));
  console.log(row(`📥 ${m.pullTitle}`));
  console.log(line(BOX.ml, BOX.mr));

  for (const r of results) {
    const icon = r.status === m.pullNew ? "✅" : "⏭️";
    console.log(row(`${icon} ${r.id}: ${r.status}`));
  }

  console.log(line(BOX.ml, BOX.mr));
  console.log(row(`✅ ${m.pullSuccess}: ${newCount} ${m.pullMerged}`));
  console.log(line(BOX.bl, BOX.br));
}

function getDaemonPort(): number {
  const { getDaemonInfo } = require("../daemon/client");
  const info = getDaemonInfo();
  if (!info) throw new Error("Daemon not running");
  return info.port;
}

function renderPayloadBox(payload: VaccinePayload, m: typeof msgs.en) {
  const BOX = { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│", ml: "├", mr: "┤" };
  const W = 48;
  const line = (l: string, r: string) => `${l}${BOX.h.repeat(W)}${r}`;
  const row = (s: string) => `${BOX.v}  ${s}${" ".repeat(Math.max(0, W - 2 - s.length))}${BOX.v}`;

  console.log(line(BOX.tl, BOX.tr));
  console.log(row(`${m.title}`));
  console.log(line(BOX.ml, BOX.mr));
  console.log(row(`${m.ecosystem}  : ${payload.ecosystem}`));
  console.log(row(`${m.antibodies} : ${payload.antibodyCount}`));
  console.log(row(`${m.generated}  : ${payload.generatedAt.substring(0, 19)}`));
  console.log(line(BOX.ml, BOX.mr));

  for (const ab of payload.antibodies) {
    const patches = ab.patches.map(p => `${p.op} ${p.path}`).join(", ");
    console.log(row(`[${ab.id}] ${ab.patternType.padEnd(18)} ${patches.substring(0, 14)}`));
  }

  console.log(line(BOX.ml, BOX.mr));
  console.log(row(`${m.payload}: .afd/global-vaccine-payload.json`));
  console.log(line(BOX.bl, BOX.br));
}
