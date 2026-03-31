/**
 * Persistent user configuration — ~/.afdrc
 *
 * JSON file with user preferences. Created on first `afd lang` call.
 * Read is sync and cached; write is sync (rare operation).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

export interface AfdConfig {
  lang?: string;
}

const RC_PATH = join(homedir(), ".afdrc");

let configCache: AfdConfig | null = null;

/** Read ~/.afdrc. Returns empty object if missing or invalid. */
export function readConfig(): AfdConfig {
  if (configCache) return configCache;
  if (!existsSync(RC_PATH)) {
    configCache = {};
    return configCache;
  }
  try {
    configCache = JSON.parse(readFileSync(RC_PATH, "utf-8"));
    return configCache!;
  } catch {
    configCache = {};
    return configCache;
  }
}

/** Write a key to ~/.afdrc. Merges with existing config. */
export function writeConfig(partial: Partial<AfdConfig>): AfdConfig {
  const current = readConfig();
  const merged = { ...current, ...partial };
  mkdirSync(dirname(RC_PATH), { recursive: true });
  writeFileSync(RC_PATH, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  configCache = merged;
  return merged;
}

/** Get the RC file path (for display). */
export function getConfigPath(): string {
  return RC_PATH;
}
