import { resolve } from "path";

/**
 * Guard: reject resolved paths outside the workspace root.
 * Throws if absPath is not under wsRoot.
 */
export function assertInsideWorkspace(absPath: string, wsRoot: string): void {
  const normalizedPath = absPath.replace(/\\/g, "/").toLowerCase();
  const normalizedRoot = resolve(wsRoot).replace(/\\/g, "/").toLowerCase();
  if (!normalizedPath.startsWith(normalizedRoot + "/") && normalizedPath !== normalizedRoot) {
    throw new Error("Access denied: path outside workspace");
  }
}
