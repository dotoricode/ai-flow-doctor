import { readFileSync, existsSync } from "fs";
import { PID_FILE, PORT_FILE } from "../constants";

export interface DaemonInfo {
  pid: number;
  port: number;
}

export function getDaemonInfo(): DaemonInfo | null {
  if (!existsSync(PID_FILE) || !existsSync(PORT_FILE)) return null;
  const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
  const port = parseInt(readFileSync(PORT_FILE, "utf-8").trim(), 10);
  if (isNaN(pid) || isNaN(port)) return null;
  return { pid, port };
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

export async function daemonRequest<T = unknown>(path: string): Promise<T> {
  const info = getDaemonInfo();
  if (!info) throw new Error("Daemon not running. Run `afd start` first.");
  const res = await fetch(`http://127.0.0.1:${info.port}${path}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Daemon returned ${res.status}`);
  return res.json() as T;
}
