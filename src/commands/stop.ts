import { getDaemonInfo, isDaemonAlive, daemonRequest } from "../daemon/client";
import { unlinkSync } from "fs";
import { resolveWorkspacePaths } from "../constants";
import { formatShiftSummary } from "../core/boast";
import type { ShiftSummary } from "../core/boast";
import { getSystemLanguage } from "../core/locale";
import { getMessages, t } from "../core/i18n/messages";
import { detectEcosystem } from "../adapters/index";

function cleanupFiles() {
  const paths = resolveWorkspacePaths();
  try { unlinkSync(paths.pidFile); } catch {}
  try { unlinkSync(paths.portFile); } catch {}
}

export async function stopCommand(options?: { clean?: boolean }) {
  const lang = getSystemLanguage();
  const msg = getMessages(lang);
  const info = getDaemonInfo();

  if (!info) {
    console.log(msg.DAEMON_NOT_RUNNING);
    return;
  }

  if (await isDaemonAlive(info)) {
    // Fetch shift summary before stopping
    try {
      const summary = await daemonRequest<ShiftSummary>("/shift-summary");
      console.log(formatShiftSummary(summary, lang));
    } catch {
      // Non-fatal: summary is a nicety, not a requirement
    }

    try {
      await daemonRequest("/stop");
      console.log(t(msg.DAEMON_STOPPED, { pid: info.pid }));
    } catch {
      try {
        process.kill(info.pid, "SIGTERM");
        console.log(t(msg.DAEMON_KILLED, { pid: info.pid }));
      } catch {
        console.log("[afd] Daemon process already gone.");
      }
    }
  } else {
    console.log(msg.DAEMON_NOT_RESPONDING);
  }

  cleanupFiles();

  // --clean: remove injected hooks and MCP registration
  if (options?.clean) {
    const cwd = process.cwd();
    const ecosystems = detectEcosystem(cwd);
    for (const { adapter } of ecosystems) {
      if (adapter.removeHooks) {
        const r = adapter.removeHooks(cwd);
        if (r.removed) console.log(`[afd] ${r.message}`);
      }
      if (adapter.unregisterMcp) {
        const r = adapter.unregisterMcp(cwd);
        if (r.removed) console.log(`[afd] ${r.message}`);
      }
    }
    console.log("[afd] Clean stop complete. All afd integrations removed.");
  }
}
