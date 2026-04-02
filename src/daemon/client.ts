import { readFileSync, existsSync, unlinkSync } from "fs";
import { resolveWorkspacePaths } from "../constants";
import type { MeshEntry } from "./mesh";

export interface DaemonInfo {
  pid: number;
  port: number;
  workspace: string;
}

/**
 * Read daemon PID/port from the workspace-local `.afd/` directory.
 * Walks up from cwd to find the workspace root, so CLI commands
 * work correctly even when invoked from subdirectories.
 *
 * If PID file exists but process is dead, cleans up stale files.
 */
export function getDaemonInfo(): DaemonInfo | null {
  const paths = resolveWorkspacePaths();
  if (!existsSync(paths.pidFile) || !existsSync(paths.portFile)) return null;

  const pid = parseInt(readFileSync(paths.pidFile, "utf-8").trim(), 10);
  const port = parseInt(readFileSync(paths.portFile, "utf-8").trim(), 10);
  if (isNaN(pid) || isNaN(port)) return null;

  // Stale PID detection: check if process is alive at OS level
  if (!isProcessAlive(pid)) {
    try { unlinkSync(paths.pidFile); } catch {}
    try { unlinkSync(paths.portFile); } catch {}
    return null;
  }

  return { pid, port, workspace: paths.root };
}

/** Check if a process exists at OS level (does not verify it's afd) */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 = existence check
    return true;
  } catch {
    return false;
  }
}

export async function isDaemonAlive(info: DaemonInfo): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${info.port}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    const data = await res.json() as { status: string; pid: number };
    return data.status === "alive" && data.pid === info.pid;
  } catch {
    return false;
  }
}

export async function daemonRequest<T = unknown>(path: string, method?: "GET"): Promise<T>;
export async function daemonRequest<T = unknown>(path: string, method: "POST", body: unknown): Promise<T>;
export async function daemonRequest<T = unknown>(path: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<T> {
  const info = getDaemonInfo();
  if (!info) throw new Error("Daemon not running. Run `afd start` first.");
  const init: RequestInit = {
    method,
    signal: AbortSignal.timeout(5000),
  };
  if (method === "POST" && body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  const res = await fetch(`http://127.0.0.1:${info.port}${path}`, init);
  if (!res.ok) throw new Error(`Daemon returned ${res.status}`);
  return res.json() as T;
}

export async function getMeshPeers(): Promise<MeshEntry[]> {
  return daemonRequest<MeshEntry[]>("/mesh/peers");
}
