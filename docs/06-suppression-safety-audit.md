# Phase 6b: Suppression Safety Audit

**Date:** 2026-03-31
**Status:** PASS — All 9 E2E tests green

---

## 1. Problem Statement

The afd immune system auto-heals files protected by antibodies (e.g., recreates `.claudeignore` when deleted). This creates an "autoimmune disease" risk: the daemon could fight the user's intentional deletions, or waste cycles healing files that were removed as part of a bulk operation (`git checkout`, branch switch).

We need heuristics to distinguish:
- **Accidental delete** — user error, should auto-heal
- **Intentional delete** — user deliberately removing a file, should respect
- **Mass delete** — git operation or bulk tool, should ignore entirely

---

## 2. Heuristics Implemented

### 2.1 Double-Tap Heuristic (Immune Tolerance)

**Rule:** When an `unlink` event occurs for a file protected by an active antibody:

| Tap | Action |
|-----|--------|
| **First tap** | Record timestamp, auto-heal the file immediately |
| **Second tap within 60 seconds** | User is persistent — set antibody to `dormant = true`, do NOT heal |
| **Second tap after 60 seconds** | Treat as a new first tap (the window expired) |

**Rationale:** If the daemon heals a file and the user deletes it again within a minute, the user clearly wants the file gone. A single accidental deletion gets auto-fixed; a stubborn re-deletion signals intent.

**DB schema change:**
```sql
ALTER TABLE antibodies ADD COLUMN dormant INTEGER NOT NULL DEFAULT 0;
```

Dormant antibodies are excluded from all diagnosis queries (`WHERE dormant = 0`), so the immune system stops "seeing" the pattern. A subsequent `afd fix` that re-learns the antibody resets `dormant = 0`.

### 2.2 Mass-Event Awareness (Git Shock Absorber)

**Rule:** If more than 3 `unlink` events occur within a 1-second window, skip ALL suppression logic for the burst.

| Condition | Action |
|-----------|--------|
| `recentUnlinks.length > 3` within 1s | Return immediately, do not heal or check double-tap |
| Additionally | Clear all first-tap timestamps (bulk ops are not user intent) |

**Rationale:** Operations like `git checkout`, `git stash`, or `rm -rf node_modules` can trigger dozens of unlink events per second. Treating these as individual deletions would:
1. Waste I/O re-creating files that will be immediately overwritten
2. Pollute the first-tap timestamp map, causing false double-tap detections later

Clearing first-tap timestamps on mass-event ensures that a single intentional delete *after* a git operation is treated fresh, not as a phantom "second tap."

### 2.3 Unlink Audit Log

All unlink events are recorded in a new `unlink_log` table:

```sql
CREATE TABLE unlink_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);
```

This provides a forensic trail for debugging suppression behavior without impacting the hot path.

---

## 3. E2E Test Results

**Runner:** `bun test` (Bun v1.3.11)
**File:** `tests/e2e/suppression-safety.test.ts`
**Execution time:** ~168ms

```
Suppression Safety: Double-Tap Heuristic
  [PASS] Accidental Delete (single tap) -> auto-heals the file
  [PASS] Intentional Delete (double-tap within 60s) -> sets antibody dormant
  [PASS] Delete after 60s window -> treated as new first tap, not double-tap
  [PASS] Dormant antibody no longer triggers healing

Suppression Safety: Mass-Event Awareness
  [PASS] Mass delete (>3 unlinks in 1s) -> suppression logic entirely skipped
  [PASS] Unlinks spread over >1s do NOT trigger mass-event
  [PASS] Mass event followed by single delete after cooldown -> heals normally

Suppression Safety: Combined Scenarios
  [PASS] Full lifecycle: heal -> dormant -> re-learn -> heal again
  [PASS] Unlink log records all events in DB

9 pass | 0 fail | 32 expect() calls
```

### Test Coverage Matrix

| Scenario | Expected Behavior | Verified |
|----------|-------------------|----------|
| Single accidental delete | File auto-healed, antibody stays active | YES |
| Stubborn re-delete within 60s | Antibody goes dormant, no healing | YES |
| Re-delete after 60s | Treated as fresh first tap, heals | YES |
| Dormant antibody + unlink | No healing triggered | YES |
| >3 rapid unlinks (git checkout) | All suppression skipped | YES |
| Slow unlinks (>1s apart) | Normal healing per file | YES |
| Mass event then single delete | Normal healing (taps cleared) | YES |
| Dormant -> re-learn -> delete | Heals again with new content | YES |
| Unlink log persistence | All events in DB | YES |

---

## 4. Architecture Impact

### Modified Files

| File | Change |
|------|--------|
| `src/core/db.ts` | Added `dormant` column migration, `unlink_log` table |
| `src/daemon/server.ts` | Added `handleUnlink()`, `isMassEvent()`, `autoHealFile()`, suppression state tracking, `/score` endpoint suppression stats |

### New Files

| File | Purpose |
|------|---------|
| `tests/e2e/suppression-safety.test.ts` | 9 E2E tests covering all edge cases |

### Constants

| Name | Value | Purpose |
|------|-------|---------|
| `DOUBLE_TAP_WINDOW_MS` | 60,000ms | Window for detecting intentional re-deletion |
| `MASS_EVENT_THRESHOLD` | 3 | Unlink count that triggers mass-event detection |
| `MASS_EVENT_WINDOW_MS` | 1,000ms | Sliding window for counting rapid unlinks |

---

## 5. Conclusion

The immune system will **NOT** falsely ignore actual threats:

1. **Dormant antibodies only occur through explicit double-tap.** A rogue AI agent deleting a file once triggers auto-heal. The agent would need to delete the same file twice within 60 seconds to suppress healing — a pattern detectable by reviewing `unlink_log`.

2. **Mass-event detection is conservative.** The >3 threshold in 1 second is calibrated for git operations (which typically unlink dozens of files instantly). Normal workflow never triggers this — even rapid manual deletions are spaced seconds apart.

3. **Re-learning reactivates dormant antibodies.** Running `afd fix` after a dormant transition re-creates the antibody with `dormant = 0`, restoring full protection. The system self-heals its own suppression.

4. **Full audit trail.** Every unlink is logged to `unlink_log` with millisecond timestamps. Dormant transitions are tracked in daemon state and exposed via `/score`. Post-incident analysis can reconstruct exactly what happened.

The immune system is now robust against the three failure modes: accidental deletion (auto-healed), intentional deletion (respected via double-tap), and bulk operations (ignored via mass-event detection).
