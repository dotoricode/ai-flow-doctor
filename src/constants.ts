import { join } from "path";

export const AFD_DIR = ".afd";
export const PID_FILE = join(AFD_DIR, "daemon.pid");
export const PORT_FILE = join(AFD_DIR, "daemon.port");
export const DB_FILE = join(AFD_DIR, "antibodies.sqlite");
export const LOG_FILE = join(AFD_DIR, "daemon.log");
export const WATCH_TARGETS = [".claude/", "CLAUDE.md", ".cursorrules"];
