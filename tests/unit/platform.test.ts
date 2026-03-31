import { describe, test, expect } from "bun:test";
import { platform } from "os";
import {
  IS_WINDOWS,
  IS_MACOS,
  IS_LINUX,
  detachedSpawnOptions,
  resolveHookCommand,
} from "../../src/platform";

describe("platform detection", () => {
  const current = platform();

  test("exactly one platform flag is true", () => {
    const flags = [IS_WINDOWS, IS_MACOS, IS_LINUX];
    const trueCount = flags.filter(Boolean).length;
    // On standard OS, exactly one should be true (or zero on exotic OS)
    expect(trueCount).toBeLessThanOrEqual(1);
  });

  test("flags match os.platform()", () => {
    expect(IS_WINDOWS).toBe(current === "win32");
    expect(IS_MACOS).toBe(current === "darwin");
    expect(IS_LINUX).toBe(current === "linux");
  });
});

describe("detachedSpawnOptions", () => {
  const logFd = 3; // dummy fd

  test("always sets detached: true", () => {
    const opts = detachedSpawnOptions(logFd);
    expect(opts.detached).toBe(true);
  });

  test("routes stdio to log fd", () => {
    const opts = detachedSpawnOptions(logFd);
    expect(opts.stdio).toEqual(["ignore", logFd, logFd]);
  });

  test("includes cwd and env", () => {
    const opts = detachedSpawnOptions(logFd);
    expect(opts.cwd).toBe(process.cwd());
    expect(opts.env).toBeDefined();
  });

  if (IS_WINDOWS) {
    test("adds shell and windowsHide on Windows", () => {
      const opts = detachedSpawnOptions(logFd);
      expect(opts.shell).toBe(true);
      expect(opts.windowsHide).toBe(true);
    });
  } else {
    test("does not add shell on POSIX", () => {
      const opts = detachedSpawnOptions(logFd);
      expect(opts.shell).toBeUndefined();
    });
  }
});

describe("resolveHookCommand", () => {
  test("returns afd diagnose command", () => {
    const cmd = resolveHookCommand();
    expect(cmd).toContain("afd");
    expect(cmd).toContain("diagnose");
    expect(cmd).toContain("--format a2a");
    expect(cmd).toContain("--auto-heal");
  });

  test("does not contain absolute paths", () => {
    const cmd = resolveHookCommand();
    expect(cmd).not.toMatch(/^\/|^[A-Za-z]:\\/);
    expect(cmd).not.toContain("src/cli.ts");
  });
});
