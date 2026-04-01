import { existsSync } from "fs";
import { join, dirname, resolve } from "path";

/**
 * Walk upward from `from` to find the nearest directory containing `.afd/` or `.git/`.
 * Returns the absolute workspace root path, or falls back to `from` itself.
 */
export function findWorkspaceRoot(from: string = process.cwd()): string {
  let dir = resolve(from);
  const root = dirname(dir) === dir ? dir : undefined; // filesystem root guard

  while (true) {
    if (existsSync(join(dir, ".afd")) || existsSync(join(dir, ".git"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }

  // Fallback: return original directory
  return resolve(from);
}

/** Resolve an `.afd/`-relative path against the workspace root */
export function resolveAfdPath(relativePath: string, from?: string): string {
  return join(findWorkspaceRoot(from), relativePath);
}
