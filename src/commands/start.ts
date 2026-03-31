import { resolve } from "path";
import { spawn } from "child_process";
import { openSync, mkdirSync } from "fs";
import { getDaemonInfo, isDaemonAlive } from "../daemon/client";
import { AFD_DIR, LOG_FILE, WATCH_TARGETS } from "../constants";
import { detectEcosystem } from "../adapters/index";
import { detachedSpawnOptions, IS_WINDOWS } from "../platform";
import { rotateLogIfNeeded } from "../core/log-rotate";
import { getSystemLanguage } from "../core/locale";
import { getMessages, t } from "../core/i18n/messages";
import { discoverWatchTargets } from "../core/discovery";

const STARTUP_POLL_INTERVAL_MS = 100;
const STARTUP_POLL_MAX_MS = 3000;

export async function startCommand(options?: { mcp?: boolean }) {
  // MCP stdio mode: run daemon in foreground with stdio transport
  if (options?.mcp) {
    const { main: runDaemon } = await import("../daemon/server");
    runDaemon({ mcp: true });
    return; // never reaches here — stdio loop blocks
  }

  const lang = getSystemLanguage();
  const msg = getMessages(lang);

  mkdirSync(AFD_DIR, { recursive: true });

  // ── Idempotency: check if already running ──
  const existing = getDaemonInfo();
  if (existing && (await isDaemonAlive(existing))) {
    console.log(msg.DAEMON_ALREADY_RUNNING);
    return;
  }

  // ── Spawn detached daemon with log redirection ──
  const daemonScript = resolve(import.meta.dirname, "../daemon/server.ts");
  const logPath = resolve(LOG_FILE);
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

    // Inject hooks into detected ecosystems
    const ecosystems = detectEcosystem(process.cwd());
    for (const { adapter } of ecosystems) {
      if (adapter.injectHooks) {
        const hookResult = adapter.injectHooks(process.cwd());
        console.log(`[afd] ${hookResult.message}`);
      }
      if (adapter.configureStatusLine) {
        const slResult = adapter.configureStatusLine(process.cwd());
        if (slResult.configured) console.log(`[afd] ${slResult.message}`);
      }
    }
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
