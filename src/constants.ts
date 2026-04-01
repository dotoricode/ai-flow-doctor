import { join } from "path";
import { findWorkspaceRoot } from "./core/workspace";

// Relative paths (used when cwd is already the workspace root)
export const AFD_DIR = ".afd";
export const PID_FILE = join(AFD_DIR, "daemon.pid");
export const PORT_FILE = join(AFD_DIR, "daemon.port");
export const DB_FILE = join(AFD_DIR, "antibodies.sqlite");
export const LOG_FILE = join(AFD_DIR, "daemon.log");
export const QUARANTINE_DIR = join(AFD_DIR, "quarantine");
export const WATCH_TARGETS = [
  ".claude/", "CLAUDE.md", ".cursorrules", ".claudeignore", ".gitignore",
  ".windsurfrules", ".windsurf/", "codex.md", ".codex/",
  ".cursorignore", ".windsurfignore", ".codexignore",
];

/**
 * Resolve all `.afd/` paths against the workspace root.
 * Works correctly even when CLI is invoked from a subdirectory.
 */
export function resolveWorkspacePaths(from?: string) {
  const root = findWorkspaceRoot(from);
  return {
    root,
    afdDir: join(root, AFD_DIR),
    pidFile: join(root, PID_FILE),
    portFile: join(root, PORT_FILE),
    dbFile: join(root, DB_FILE),
    logFile: join(root, LOG_FILE),
    quarantineDir: join(root, QUARANTINE_DIR),
  };
}
