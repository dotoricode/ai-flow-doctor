# Open Questions

## afd-v1.5-trust-builder — 2026-04-02 → **RESOLVED 2026-04-02**

---

### Q1: `mistake_type` Storage Language (Korean vs. English)

**Status: ✅ DECIDED**

**Decision: English in DB/code, Korean at presentation layer only.**

**Reasoning:**
- `mistake_type` is used as a raw string in SQL WHERE/GROUP-BY clauses and Set operations (`reasonSet.add(e.mistake_type)` in `http-routes.ts:33`). English ASCII enum values are collision-free, encoding-safe, and trivially indexable.
- Storing Korean in SQLite is technically fine but mixes concerns: storage format bleeding into query logic. If the HUD label changes (e.g., `타입 불일치` → `형식 오류`), every DB row would need migration.
- **Rule:** `mistake_type` values in SQLite and all internal code use lowercase English slugs (e.g., `"type_mismatch"`, `"file_deletion"`, `"structure_corruption"`). The HUD display layer translates these to Korean at render time via a static lookup map.

---

### Q2: HUD Defense Count Reset Policy (In-memory vs. SQLite cumulative)

**Status: ✅ DECIDED**

**Decision: In-memory (session-scoped). `autoHealCount` resets on daemon restart. Lifetime count is accessible via `afd score`.**

**Reasoning:**
- The HUD counter (`[afd] N건 방어`) communicates *active protection in the current session*, not historical totals. A counter of "3,847건 방어" from 6 months of history is noise, not signal.
- On daemon restart, the AI agent environment is reset — showing a stale historical count would be misleading about the current session's health.
- Lifetime statistics (total heals, most-healed files, mistake type distribution) belong in `afd score` output, which already queries `mistake_history` from SQLite.
- **Rule:** `state.autoHealCount` stays in-memory and resets on each `afd start`. No change to current architecture needed. `afd score` is the authoritative lifetime stats surface.

---

### Q3: `mistake_history` Retention Period (90 days vs. Indefinite)

**Status: ✅ DECIDED**

**Decision: 90 days.** (Current code uses 30 days — update to 90.)

**Reasoning:**
- Indefinite retention causes unbounded SQLite file growth. A single active project generating 10 heals/day for 5 years = ~18,250 rows. Fine for SQLite, but provides negligible pattern value after 90 days (AI agent behaviors change with model updates, codebase evolves).
- 90 days aligns with typical sprint/quarter cycles — enough for meaningful pattern detection across multiple development phases.
- 30 days (current) is too aggressive: a developer returning from a 4-week vacation loses all context. 90 days is the correct balance.
- **Rule:** Change the purge threshold in `db.ts:97` from `30 * 86400000` to `90 * 86400000`. Matches telemetry retention.

---

### Q4: Barrel File (`index.ts`) Hologram L1 Support

**Status: ✅ DECIDED**

**Decision: Defer to v2.0. Out of scope for v1.x.**

**Reasoning:**
- Barrel file tracing requires: (1) parse the barrel's `export * from "..."` / `export { X } from "..."` statements, (2) resolve each re-export to its source module, (3) apply L1 filtering per source file. This is a multi-hop resolution problem — effectively a mini module resolver.
- Token ROI is marginal: most barrel imports expose a well-known subset of symbols. The current L1 behavior gracefully degrades to L0 when no imported symbols are matched from the barrel, which is acceptable and safe.
- Complexity cost outweighs benefit for v1.x. The effort required is better invested in Go/Rust extractor coverage (more files, more savings).
- **Rule:** Current behavior is final for v1.x — when `contextFile` is a barrel, L1 falls through to L0 (full hologram). No regression, no action needed. Track in v2.0 backlog.

---

### Q5: `file_path` Normalization Strategy

**Status: ✅ DECIDED**

**Decision: Always store as POSIX forward-slash paths, relative to workspace root.**

**Reasoning:**
- `http-routes.ts:203` uses `.replace(/\//g, "\\")` for *OS-level file operations* (sending paths to the OS on Windows), not for storage. Storage and OS representation must be decoupled.
- Cross-platform lookup correctness: `queryMistakesByFile("src/core/db.ts")` must return the same results on Windows (where the actual path is `src\core\db.ts`) and macOS/Linux. This requires a canonical storage format.
- Absolute paths (`D:\00_work\...`) are machine-specific and break when the repo is cloned elsewhere. Workspace-relative paths are portable.
- **Rule (canonical):**
  1. On INSERT: normalize `filePath` → strip workspace root prefix → replace all `\` with `/`
  2. On SELECT/query: apply the same normalization to the query argument before executing
  3. The warm-up in `server.ts:150` already normalizes backslash→forward-slash. Extend this to also strip the absolute prefix using `workspacePaths.root`.
  4. Storage format example: `src/core/db.ts` (never `D:\\00_work\\autonomous-flow-daemon\\src\\core\\db.ts`)

---

## Summary Table

| # | Question | Decision | Priority |
|:---:|---|---|:---:|
| Q1 | `mistake_type` language | **English in DB**, Korean at HUD render | P1 |
| Q2 | Defense count reset | **In-memory (session-scoped)**, lifetime → `afd score` | P1 |
| Q3 | Retention period | **90 days** (update from 30d in `db.ts:97`) | P1 |
| Q4 | Barrel file L1 | **Defer to v2.0**, current L0 fallback is acceptable | P2 |
| Q5 | `file_path` format | **Workspace-relative POSIX** (`src/core/db.ts`) | P1 |
