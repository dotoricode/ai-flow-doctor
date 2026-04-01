import { resolve } from "path";

/**
 * Guard: reject resolved paths outside the workspace root.
 * Throws if absPath is not under wsRoot.
 */
export function assertInsideWorkspace(absPath: string, wsRoot: string): void {
  const root = resolve(wsRoot);
  if (!absPath.startsWith(root + "/") && absPath !== root) {
    throw new Error("Access denied: path outside workspace");
  }
}
