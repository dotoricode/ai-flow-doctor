import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { resolveHookCommand } from "../platform";

export type HookOwner = "afd" | "omc" | "user";

export interface HookEntry {
  id?: string;
  matcher?: string;
  command: string;
  [key: string]: unknown;
}

export interface HooksConfig {
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
}

export interface ManagedHook {
  id: string;
  matcher: string;
  command: string;
  owner: HookOwner;
}

export interface HookConflict {
  type: "matcher-overlap" | "duplicate-id";
  hookA: ManagedHook;
  hookB: ManagedHook;
  resolution: string;
}

export interface MergeResult {
  merged: HookEntry[];
  conflicts: HookConflict[];
  changes: { added: string[]; removed: string[]; reordered: string[] };
}

export interface HookSummary {
  zones: Record<HookOwner, ManagedHook[]>;
  conflicts: HookConflict[];
  orderingOk: boolean;
  total: number;
}

/**
 * Canonical set of afd-managed hooks.
 * Only hooks in this set are removed during `stop --clean`.
 * This prevents accidental deletion of user hooks with an `afd-` prefix
 * (e.g., project-local `afd-read-gate` scripts).
 */
export const KNOWN_AFD_HOOKS = new Set(["afd-auto-heal"]);

/** afd's canonical desired hooks — authoritative source for merge. */
export function getAfdDesiredHooks(): HookEntry[] {
  return [
    {
      id: "afd-auto-heal",
      matcher: "Write|Edit|MultiEdit",
      command: resolveHookCommand(),
    },
  ];
}

/** Classify a hook's owner by id prefix. */
export function classifyOwner(id: string): HookOwner {
  if (id.startsWith("afd-")) return "afd";
  if (id.startsWith("omc-")) return "omc";
  return "user";
}

/** Classify a list of hook entries into owner zones. */
export function classifyHooks(entries: HookEntry[]): Map<HookOwner, ManagedHook[]> {
  const zones = new Map<HookOwner, ManagedHook[]>([
    ["afd", []],
    ["omc", []],
    ["user", []],
  ]);
  let anonIdx = 0;
  for (const entry of entries) {
    const id = entry.id ?? `user-anonymous-${anonIdx++}`;
    const owner = classifyOwner(id);
    zones.get(owner)!.push({
      id,
      matcher: entry.matcher ?? "",
      command: entry.command,
      owner,
    });
  }
  return zones;
}

/** Detect conflicts between hooks from different owners. */
export function detectConflicts(hooks: ManagedHook[]): HookConflict[] {
  const conflicts: HookConflict[] = [];

  // 1. Duplicate ID check
  const idMap = new Map<string, ManagedHook>();
  for (const hook of hooks) {
    if (idMap.has(hook.id)) {
      conflicts.push({
        type: "duplicate-id",
        hookA: idMap.get(hook.id)!,
        hookB: hook,
        resolution: `Remove or rename one of the duplicate '${hook.id}' hooks`,
      });
    } else {
      idMap.set(hook.id, hook);
    }
  }

  // 2. Matcher overlap check (cross-owner only, O(n^2) — safe for <20 hooks)
  for (let i = 0; i < hooks.length; i++) {
    for (let j = i + 1; j < hooks.length; j++) {
      if (hooks[i].owner === hooks[j].owner) continue;
      const matcherA = hooks[i].matcher || "*";
      const matcherB = hooks[j].matcher || "*";
      const setA = new Set(matcherA.split("|").map(s => s.trim()));
      const setB = new Set(matcherB.split("|").map(s => s.trim()));
      const aIsWild = setA.has("*") || setA.has("");
      const bIsWild = setB.has("*") || setB.has("");
      const overlap =
        aIsWild || bIsWild || [...setA].some(m => setB.has(m));
      if (overlap) {
        const shared =
          aIsWild || bIsWild
            ? "*"
            : [...setA].filter(m => setB.has(m)).join("|");
        conflicts.push({
          type: "matcher-overlap",
          hookA: hooks[i],
          hookB: hooks[j],
          resolution: `Both hooks trigger on '${shared}'. Verify they don't conflict in behavior.`,
        });
      }
    }
  }

  return conflicts;
}

/** Read hooks.json from disk, returning empty config on missing/invalid file. */
export function readHooksFile(hooksPath: string): HooksConfig {
  if (!existsSync(hooksPath)) return { hooks: {} };
  try {
    return JSON.parse(readFileSync(hooksPath, "utf-8")) as HooksConfig;
  } catch {
    return { hooks: {} };
  }
}

/** Write hooks.json to disk, creating parent directory if needed. */
export function writeHooksFile(hooksPath: string, config: HooksConfig): void {
  mkdirSync(dirname(hooksPath), { recursive: true });
  writeFileSync(hooksPath, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Merge current hook entries with the desired afd hooks.
 * Ordering guarantee: afd → omc → user.
 * afd zone is fully authoritative — desired list overwrites existing afd hooks.
 * omc and user zones are preserved as-is from the current file.
 */
export function mergeHooks(
  current: HookEntry[],
  desiredAfd: HookEntry[],
): MergeResult {
  const changes: MergeResult["changes"] = { added: [], removed: [], reordered: [] };

  const zones = classifyHooks(current);
  const afdExisting = zones.get("afd")!;
  const omcHooks = zones.get("omc")!;
  const userHooks = zones.get("user")!;

  // Build merged afd zone from desired list (authoritative)
  const mergedAfd: HookEntry[] = desiredAfd.map(desired => {
    const existing = afdExisting.find(h => h.id === desired.id);
    if (!existing) changes.added.push(desired.id!);
    return desired;
  });

  // Track explicitly removed afd hooks (only canonical ones)
  for (const existing of afdExisting) {
    if (KNOWN_AFD_HOOKS.has(existing.id) && !desiredAfd.find(d => d.id === existing.id)) {
      changes.removed.push(existing.id);
    }
  }

  // Detect reordering (only if no add/remove)
  if (changes.added.length === 0 && changes.removed.length === 0) {
    const originalOrder = current.map(h => h.id ?? "");
    const newOrder = [
      ...mergedAfd.map(h => h.id!),
      ...omcHooks.map(h => h.id),
      ...userHooks.map(h => h.id),
    ];
    const hasReordering =
      originalOrder.length !== newOrder.length ||
      originalOrder.some((id, i) => id !== (newOrder[i] ?? ""));
    if (hasReordering) {
      changes.reordered.push("hooks reordered to afd → omc → user zones");
    }
  }

  const merged: HookEntry[] = [
    ...mergedAfd,
    ...omcHooks.map(({ id, matcher, command }) => ({ id, matcher, command })),
    ...userHooks.map(({ id, matcher, command }) => ({ id, matcher, command })),
  ];

  const allManaged: ManagedHook[] = [
    ...mergedAfd.map(h => ({
      id: h.id!,
      matcher: h.matcher ?? "",
      command: h.command,
      owner: "afd" as HookOwner,
    })),
    ...omcHooks,
    ...userHooks,
  ];
  const conflicts = detectConflicts(allManaged);

  return { merged, conflicts, changes };
}

/** Get a summary of current hook state for display and status commands. */
export function getHookSummary(hooksPath: string): HookSummary {
  const config = readHooksFile(hooksPath);
  const entries = config.hooks?.PreToolUse ?? [];
  const zones = classifyHooks(entries);

  const allHooks: ManagedHook[] = [
    ...(zones.get("afd") ?? []),
    ...(zones.get("omc") ?? []),
    ...(zones.get("user") ?? []),
  ];
  const conflicts = detectConflicts(allHooks);

  // Check ordering invariant: afd(0) → omc(1) → user(2)
  const ownerPriority: Record<HookOwner, number> = { afd: 0, omc: 1, user: 2 };
  let orderingOk = true;
  let lastPriority = -1;
  for (const entry of entries) {
    const id = entry.id ?? "";
    const priority = ownerPriority[classifyOwner(id)];
    if (priority < lastPriority) {
      orderingOk = false;
      break;
    }
    lastPriority = priority;
  }

  return {
    zones: Object.fromEntries(zones) as Record<HookOwner, ManagedHook[]>,
    conflicts,
    orderingOk,
    total: entries.length,
  };
}
