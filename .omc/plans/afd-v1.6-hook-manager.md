# v1.6 Hook Manager Implementation Plan

**Date:** 2026-04-02
**Version Target:** v1.6.0
**Spec Source:** `.omc/specs/deep-interview-afd-roadmap.md` lines 57-59, 99-101
**Status:** APPROVED (Architect + Critic reviewed, issues resolved)

---

## 1. Exact Scope

### IN SCOPE (v1.6)
1. **Hook Registry Model** — ownership-aware data model for hook entries (owner: `afd` | `omc` | `user`)
2. **Merge Engine** — reads hooks.json, classifies entries by owner, ensures ordering: afd → omc → user
3. **Conflict Detection** — detects when two hooks from different owners target the same matcher pattern
4. **CLI: `afd hooks`** subcommand with `status` and `sync` actions
5. **Integration into `afd start`** — replace raw `injectHooks()` with Hook Manager merge
6. **Integration into `afd stop --clean`** — clean removal of afd-owned hooks only
7. **Unit tests** for merge engine and conflict detection

### OUT OF SCOPE (defer to v2.0)
- OMC hook auto-discovery from OMC plugin internals
- Hook dependency graph (hook A must run before hook B semantically)
- Remote hook registry synchronization
- PostToolUse / other hook types beyond PreToolUse
- GUI/TUI for hook management
- Automatic OMC hook enablement
- Cursor/Windsurf/Codex adapter hook refactor (v1.6 targets ClaudeCodeAdapter only)

### Note on "Magic 5 Commands" constitution
The CLAUDE.md lists `start, stop, score, fix, sync` as the Magic 5. However, the existing codebase already has 10+ utility commands (`doctor`, `diagnose`, `vaccine`, `mcp`, `lang`, `stats`, etc.) that are internal/utility commands. The `afd hooks` command follows this same pattern — it is a utility/diagnostic command, not a primary user-facing command. This is acceptable within the established precedent.

---

## 2. Technical Design

### 2.1 Hook Ownership Model

```typescript
// src/core/hook-manager.ts

type HookOwner = "afd" | "omc" | "user";

interface ManagedHook {
  id: string;
  matcher: string;
  command: string;
  owner: HookOwner;
}

interface HookZone {
  owner: HookOwner;
  priority: number; // afd=0, omc=1, user=2
  hooks: ManagedHook[];
}

interface HookConflict {
  type: "matcher-overlap" | "duplicate-id";
  hookA: ManagedHook;
  hookB: ManagedHook;
  resolution: string;
}

interface MergeResult {
  merged: ManagedHook[];
  conflicts: HookConflict[];
  changes: { added: string[]; removed: string[]; reordered: string[] };
}
```

### 2.2 Owner Classification Algorithm

**Two-layer approach (display vs. removal):**

**For display/status (`hooks status`):** id-prefix convention:
- `id` starts with `afd-` → owner = `afd`
- `id` starts with `omc-` → owner = `omc`
- Everything else → owner = `user`
- Hooks without `id` field → auto-assign `user-anonymous-{index}`, owner = `user`

**For removal (`stop --clean`):** Canonical list only:
```typescript
const KNOWN_AFD_HOOKS = new Set(["afd-auto-heal"]); // afd-read-gate is a user script
```
`removeHooks()` removes ONLY hooks whose id is in `KNOWN_AFD_HOOKS`. This prevents accidental deletion of user hooks that happen to use an `afd-` prefix (e.g., the project-local `afd-read-gate` script).

**Note on `afd-read-gate`:** This hook (`bash .claude/read-gate.sh`) is a project-local user script that was manually added with an `afd-` prefix. It is NOT managed by `injectHooks()`. In `hooks status` display it will show as `[afd]` (by prefix), but it will never be removed by `stop --clean` since it's not in `KNOWN_AFD_HOOKS`.

### 2.3 Merge Algorithm

```
Input: current hooks.json content + desired afd hooks
Output: merged hooks.json with ordering guarantee

1. Parse hooks.json → extract all hook entries per event type (PreToolUse, etc.)
2. Classify each entry by owner using id-prefix rules
3. For each event type:
   a. Collect afd-owned hooks (from desired list, NOT from file — afd is authoritative)
   b. Collect omc-owned hooks (from file — preserve as-is)
   c. Collect user-owned hooks (from file — preserve as-is)
   d. Concatenate: [...afd, ...omc, ...user]
4. Detect conflicts:
   a. Same matcher across different owners → warn (not block)
   b. Duplicate id → error
5. Write merged result back to hooks.json
6. Return MergeResult with change summary
```

### 2.4 Conflict Detection

Two conflict types:
1. **Matcher Overlap:** Two hooks from different owners match the same tool pattern. WARNING — both hooks run, but user should know.
2. **Duplicate ID:** Two hooks with identical `id` field. ERROR — merge refuses and reports.

---

## 3. Files to Create/Modify

### NEW FILES

#### `src/core/hook-manager.ts` (~200 lines)
Core module. Exports:
- `classifyHooks(entries: HookEntry[]): Map<HookOwner, ManagedHook[]>`
- `mergeHooks(current: HookEntry[], desired: { afd: HookEntry[] }): MergeResult`
- `detectConflicts(hooks: ManagedHook[]): HookConflict[]`
- `readHooksFile(hooksPath: string): HooksConfig`
- `writeHooksFile(hooksPath: string, config: HooksConfig): void`
- `getHookSummary(hooksPath: string): HookSummary`

#### `src/commands/hooks.ts` (~120 lines)
CLI command handler:
- `afd hooks status` — show all hooks grouped by owner, ordering, conflicts
- `afd hooks sync` — re-merge hooks.json ensuring correct ordering

#### `tests/unit/hook-manager.test.ts` (~150 lines)
Unit tests for merge engine, conflict detection, classification.

### MODIFIED FILES

#### `src/cli.ts`
- Add import for `hooksCommand`
- Add command registration at line 111 (after `statsCommand` block, BEFORE `program.parse()` at line 112):
```typescript
program
  .command("hooks [subcommand]")
  .description("Hook Manager: inspect and sync hook ordering (afd → omc → user)")
  .action(hooksCommand);
```

#### `src/adapters/index.ts`
- Modify `ClaudeCodeAdapter.injectHooks()` (lines 53-93): Replace direct JSON manipulation with `mergeHooks()`
- Modify `ClaudeCodeAdapter.removeHooks()` (lines 159-176): Owner-aware removal via hook-manager

#### `src/commands/status.ts`
- Modify `checkHooksInjected()` (lines 34-43): Use `getHookSummary()` for richer status output

#### `docs/roadmap.md`
- Add v1.6.0 section

#### `src/version.ts` + `package.json`
- Bump version to `1.6.0`

---

## 4. CLI Output Format

### `afd hooks status`
```
afd hooks — Hook Manager

  PreToolUse (4 hooks)
  ─────────────────────
  [afd]  afd-auto-heal       Write|Edit|MultiEdit
  [afd]  afd-read-gate       Read
  [omc]  omc-router          *
  [user] my-custom-hook      Write

  Ordering: OK (afd → omc → user)
  Conflicts: none
```

### `afd hooks sync`
```
afd hooks sync
  Reordered: moved omc-router before my-custom-hook
  Conflicts detected: 1
    ⚠ Matcher overlap: afd-auto-heal (Write) ↔ my-custom-hook (Write)
  hooks.json updated.
```

---

## 5. Conflict Detection Algorithm

```typescript
function detectConflicts(hooks: ManagedHook[]): HookConflict[] {
  const conflicts: HookConflict[] = [];

  // 1. Duplicate ID check
  const idMap = new Map<string, ManagedHook>();
  for (const hook of hooks) {
    if (idMap.has(hook.id)) {
      conflicts.push({ type: "duplicate-id", hookA: idMap.get(hook.id)!, hookB: hook,
        resolution: `Remove or rename one of the duplicate '${hook.id}' hooks` });
    }
    idMap.set(hook.id, hook);
  }

  // 2. Matcher overlap check (cross-owner only)
  for (let i = 0; i < hooks.length; i++) {
    for (let j = i + 1; j < hooks.length; j++) {
      if (hooks[i].owner === hooks[j].owner) continue;
      const setA = new Set((hooks[i].matcher || "*").split("|"));
      const setB = new Set((hooks[j].matcher || "*").split("|"));
      const aIsWild = setA.has("*") || setA.has("");
      const bIsWild = setB.has("*") || setB.has("");
      const overlap = aIsWild || bIsWild || [...setA].some(m => setB.has(m));
      if (overlap) {
        const shared = aIsWild || bIsWild ? "*" : [...setA].filter(m => setB.has(m)).join("|");
        conflicts.push({ type: "matcher-overlap", hookA: hooks[i], hookB: hooks[j],
          resolution: `Both hooks trigger on '${shared}'. Verify no logic conflicts.` });
      }
    }
  }

  return conflicts;
}
```

---

## 6. Tests

```typescript
// tests/unit/hook-manager.test.ts
describe("Hook Manager", () => {
  test("classifies afd- prefix as afd owner");
  test("classifies omc- prefix as omc owner");
  test("classifies unknown prefix as user owner");
  test("assigns id to hooks without id field");
  test("merges empty file with afd hooks");
  test("preserves existing user hooks after afd hooks");
  test("preserves existing omc hooks between afd and user");
  test("reorders misplaced hooks to correct zone order");
  test("updates afd hook command if changed");
  test("removes stale afd hooks not in desired list");
  test("is idempotent — merge twice produces same result");
  test("detects duplicate id across owners");
  test("detects matcher overlap across owners");
  test("ignores matcher overlap within same owner");
  test("handles wildcard matcher overlap");
  test("reports no conflicts for non-overlapping matchers");
  test("reads valid hooks.json");
  test("handles missing hooks.json gracefully");
  test("handles malformed hooks.json gracefully");
  test("writes valid JSON with 2-space indent");
});
```

---

## 7. Acceptance Criteria (Testable)

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `afd hooks status` shows all hooks grouped by owner | Run on project with mixed hooks |
| 2 | `afd hooks sync` re-sorts with afd first, omc second, user last | Reorder hooks.json manually, run sync, verify |
| 3 | Conflict detection warns on matcher overlap between owners | Add user hook with `Write` matcher, run status |
| 4 | Conflict detection errors on duplicate hook id | Add `afd-auto-heal` duplicate, run sync |
| 5 | `afd start` uses Hook Manager for injection | Verify code path; delete hooks.json, run start, check order |
| 6 | `afd stop --clean` removes only afd-owned hooks | Add user hook, run stop, verify user hook remains |
| 7 | Unit tests pass: `bun test tests/unit/hook-manager.test.ts` | CI green |
| 8 | Existing adapter tests pass: `bun test` | CI green |
| 9 | hooks sync < 50ms | CLI action, not in hot path |
| 10 | hooks.json without `id` fields handled gracefully | Bare entries auto-assigned id |

---

## 8. Implementation Order

1. Create `src/core/hook-manager.ts` — pure logic
2. Create `tests/unit/hook-manager.test.ts` — verify logic
3. Create `src/commands/hooks.ts` — CLI surface
4. Modify `src/cli.ts` — register command
5. Modify `src/adapters/index.ts` — rewire inject/remove through hook-manager
6. Modify `src/commands/status.ts` — enrich status display
7. Run `bun test`
8. Bump version — package.json + version.ts
9. Update docs/roadmap.md

---

## Key References (from Architect Analysis)

- `src/adapters/index.ts:23` — `AFD_HOOK_MARKER` constant
- `src/adapters/index.ts:53-93` — `injectHooks()` to replace
- `src/adapters/index.ts:159-176` — `removeHooks()` to make owner-aware
- `src/adapters/index.ts:209-353` — Cursor/Windsurf/Codex duplicated logic (DRY target)
- `src/commands/status.ts:34-43` — `checkHooksInjected()` to enrich
- `src/cli.ts:112` — command registration location
- `src/platform.ts:41-49` — `resolveHookCommand()`
- `tests/unit/adapters.test.ts:1-45` — existing test pattern to follow
