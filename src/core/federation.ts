/**
 * Federation types and scope resolution for Team Antibody Federation (v1.7).
 *
 * Namespace: "<scope>/<id>"  (e.g. "myorg/missing-import-guard")
 * Versioning: monotonic integer + ISO-8601 timestamp (LWW tiebreak)
 * Conflict policy: Remote-Wins-If-Newer (RWIN) — higher version wins;
 *   on tie, newer updatedAt wins; on tie, keep local.
 */

export interface FederatedAntibody {
  /** Local name portion, e.g. "missing-import-guard" */
  id: string;
  /** Namespace slug, e.g. "myorg". Defaults to "local" for non-federated antibodies. */
  scope: string;
  /** Globally unique: "<scope>/<id>" */
  fqid: string;
  patternType: string;
  fileTarget: string;
  patches: { op: string; path: string; value?: string }[];
  /** Monotonic integer starting at 1; incremented on each content change */
  version: number;
  /** ISO 8601 — last mutation time (used as LWW tiebreaker) */
  updatedAt: string;
  /** ISO 8601 — original learning time (immutable) */
  learnedAt: string;
}

export interface FederatedPayload {
  /** Payload format version, e.g. "1.7" */
  version: string;
  generatedAt: string;
  ecosystem: string;
  /** Scope of the publishing team/repo */
  scope: string;
  antibodyCount: number;
  antibodies: FederatedAntibody[];
}

/**
 * Resolve the local scope for this workspace:
 * 1. AFD_SCOPE env var (explicit override)
 * 2. Git remote origin → org slug
 * 3. Fallback: "local"
 */
export function resolveScope(): string {
  const envScope = process.env.AFD_SCOPE?.trim();
  if (envScope) return slugify(envScope);

  try {
    const proc = Bun.spawnSync(["git", "remote", "get-url", "origin"], { stderr: "ignore" });
    if (proc.exitCode === 0) {
      const remoteUrl = new TextDecoder().decode(proc.stdout).trim();
      return parseGitRemoteScope(remoteUrl) || "local";
    }
  } catch {
    // no git binary or no remote configured
  }

  return "local";
}

function parseGitRemoteScope(remoteUrl: string): string {
  try {
    if (remoteUrl.startsWith("git@")) {
      // git@github.com:myorg/repo.git
      const colonPart = remoteUrl.split(":")[1] ?? "";
      return slugify(colonPart.split("/")[0]);
    }
    const u = new URL(remoteUrl);
    const firstSegment = u.pathname.replace(/^\//, "").split("/")[0] ?? "";
    return slugify(firstSegment);
  } catch {
    return "";
  }
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

/**
 * RWIN decision: should the incoming (remote) antibody overwrite the local one?
 * Returns true if remote should win.
 */
export function remoteWins(
  remoteVersion: number,
  remoteUpdatedAt: string,
  localVersion: number,
  localUpdatedAt: string,
): boolean {
  if (remoteVersion > localVersion) return true;
  if (remoteVersion < localVersion) return false;
  // Same version — use updatedAt as tiebreaker (newer wins)
  return remoteUpdatedAt > localUpdatedAt;
}
