import { platform } from "os";
import type { SpawnOptions } from "child_process";

export const IS_WINDOWS = platform() === "win32";
export const IS_MACOS = platform() === "darwin";
export const IS_LINUX = platform() === "linux";

/**
 * Returns spawn options appropriate for detaching a background daemon.
 * On Windows, `shell: true` is required for `detached` to create a new console.
 */
export function detachedSpawnOptions(
  logFd: number,
): SpawnOptions {
  const base: SpawnOptions = {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    cwd: process.cwd(),
    env: { ...process.env },
  };

  if (IS_WINDOWS) {
    // Windows needs shell:true for detached to work properly
    // and windowsHide to prevent a console flash
    return { ...base, shell: true, windowsHide: true };
  }

  return base;
}

/**
 * Resolve the hook command for invoking afd diagnose.
 * Priority:
 *   1. Global `afd` binary (npm/bun global install)
 *   2. `bunx afd` fallback
 */
export function resolveHookCommand(): string {
  return "afd diagnose --format a2a --auto-heal";
}
