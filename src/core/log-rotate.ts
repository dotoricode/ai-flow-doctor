import { existsSync, statSync, renameSync, unlinkSync } from "fs";

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_ROTATED_FILES = 3;           // daemon.log.1, .2, .3

/**
 * Rotate log file if it exceeds MAX_LOG_SIZE.
 * Keeps up to MAX_ROTATED_FILES old logs.
 *
 * daemon.log → daemon.log.1 → daemon.log.2 → daemon.log.3 (deleted)
 */
export function rotateLogIfNeeded(logPath: string): void {
  if (!existsSync(logPath)) return;

  try {
    const { size } = statSync(logPath);
    if (size < MAX_LOG_SIZE) return;

    // Shift existing rotated files: .3→delete, .2→.3, .1→.2
    for (let i = MAX_ROTATED_FILES; i >= 1; i--) {
      const src = i === 1 ? logPath : `${logPath}.${i - 1}`;
      const dst = `${logPath}.${i}`;
      if (!existsSync(src)) continue;
      if (i === MAX_ROTATED_FILES && existsSync(dst)) {
        unlinkSync(dst);
      }
      renameSync(src, dst);
    }
    // logPath has been renamed to logPath.1, fresh log will be created on open
  } catch {
    // Non-critical: if rotation fails, just keep appending
  }
}
