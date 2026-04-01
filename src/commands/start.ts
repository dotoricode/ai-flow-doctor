import { resolve } from "path";
import { spawn } from "child_process";
import { openSync, mkdirSync } from "fs";
import { getDaemonInfo, isDaemonAlive } from "../daemon/client";
import { WATCH_TARGETS, resolveWorkspacePaths } from "../constants";
import { detectEcosystem } from "../adapters/index";
import type { DetectionResult } from "../adapters/index";
import { detachedSpawnOptions, IS_WINDOWS } from "../platform";
import { rotateLogIfNeeded } from "../core/log-rotate";
import { getSystemLanguage } from "../core/locale";
import { getMessages, t } from "../core/i18n/messages";
import type { MessageDict } from "../core/i18n/messages";
import { discoverWatchTargets } from "../core/discovery";

const STARTUP_POLL_INTERVAL_MS = 100;
const STARTUP_POLL_MAX_MS = 3000;

interface SetupStep {
  label: string;
  newMsg: string;
  okMsg: string;
  skipMsg: string;
}

interface SetupResult {
  ecosystem: string;
  steps: { label: string; status: "new" | "ok" | "skip" }[];
}

/**
 * One-Command Zero-Touch: detect ecosystem and provision all integration
 * channels (hooks, MCP, statusLine) with idempotency.
 */
function setupEcosystem(cwd: string, msg: MessageDict): SetupResult[] {
  const ecosystems = detectEcosystem(cwd);
  const results: SetupResult[] = [];

  for (const { adapter } of ecosystems) {
    console.log(t(msg.SETUP_HEADER, { ecosystem: adapter.name }));
    const steps: SetupResult["steps"] = [];

    // 1. Hook injection
    if (adapter.injectHooks) {
      const r = adapter.injectHooks(cwd);
      const status = r.injected ? "new" : "ok";
      console.log(status === "new" ? msg.SETUP_HOOKS_NEW : msg.SETUP_HOOKS_OK);
      steps.push({ label: "hooks", status });
    }

    // 2. MCP registration
    if (adapter.registerMcp) {
      const r = adapter.registerMcp(cwd);
      const status = r.registered ? "new" : "ok";
      console.log(status === "new" ? msg.SETUP_MCP_NEW : msg.SETUP_MCP_OK);
      steps.push({ label: "mcp", status });
    } else {
      console.log(msg.SETUP_MCP_SKIP);
      steps.push({ label: "mcp", status: "skip" });
    }

    // 3. StatusLine configuration
    if (adapter.configureStatusLine) {
      const r = adapter.configureStatusLine(cwd);
      const status = r.configured ? "new" : "ok";
      console.log(status === "new" ? msg.SETUP_STATUS_NEW : msg.SETUP_STATUS_OK);
      steps.push({ label: "statusLine", status });
    } else {
      console.log(msg.SETUP_STATUS_SKIP);
      steps.push({ label: "statusLine", status: "skip" });
    }

    results.push({ ecosystem: adapter.name, steps });
  }

  if (ecosystems.length > 0) {
    console.log(msg.SETUP_DONE);
  }

  return results;
}

export async function startCommand(options?: { mcp?: boolean }) {
  // MCP stdio mode: run daemon in foreground with stdio transport
  if (options?.mcp) {
    const { main: runDaemon } = await import("../daemon/server");
    runDaemon({ mcp: true });
    return; // never reaches here — stdio loop blocks
  }

  const lang = getSystemLanguage();
  const msg = getMessages(lang);

  const paths = resolveWorkspacePaths();
  mkdirSync(paths.afdDir, { recursive: true });

  // ── Idempotency: check if already running ──
  const existing = getDaemonInfo();
  if (existing && (await isDaemonAlive(existing))) {
    console.log(msg.DAEMON_ALREADY_RUNNING);
    return;
  }

  // ── Spawn detached daemon with log redirection ──
  const daemonScript = resolve(import.meta.dirname, "../daemon/server.ts");
  const logPath = paths.logFile;
  rotateLogIfNeeded(logPath);
  const logFd = openSync(logPath, "a"); // append mode

  // On Windows, wrap in shell for proper detach; quote path for spaces
  const args = IS_WINDOWS
    ? ["run", `"${daemonScript}"`]
    : ["run", daemonScript];

  const child = spawn("bun", args, detachedSpawnOptions(logFd));

  // Detach: allow parent to exit without killing child
  child.unref();

  // ── Poll for daemon readiness instead of fixed sleep ──
  const info = await pollForDaemon(STARTUP_POLL_MAX_MS, STARTUP_POLL_INTERVAL_MS);

  if (info) {
    console.log(t(msg.DAEMON_STARTED, { pid: info.pid, port: info.port }));

    // Smart Discovery: show what we're actually watching
    const discovery = discoverWatchTargets(WATCH_TARGETS);
    console.log(t(msg.DAEMON_WATCHING, { count: discovery.targets.length }));
    console.log(`[afd] Targets: ${discovery.targets.join(", ")}`);
    console.log(t(msg.DAEMON_LOGS, { path: logPath }));

    // One-Command Zero-Touch: auto-provision all ecosystem integrations
    setupEcosystem(process.cwd(), msg);
  } else {
    console.error(t(msg.DAEMON_START_FAILED, { path: logPath }));
    process.exit(1);
  }
}

/** Poll until daemon PID/port files appear and health check passes */
async function pollForDaemon(
  maxMs: number,
  intervalMs: number,
): Promise<{ pid: number; port: number } | null> {
  const deadline = Date.now() + maxMs;

  while (Date.now() < deadline) {
    const info = getDaemonInfo();
    if (info && (await isDaemonAlive(info))) {
      return info;
    }
    await Bun.sleep(intervalMs);
  }

  return null;
}
