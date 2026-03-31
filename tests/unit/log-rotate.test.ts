import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { rotateLogIfNeeded } from "../../src/core/log-rotate";

const TMP = join(".afd-test-tmp", "log-rotate");

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  try { rmSync(TMP, { recursive: true, force: true }); } catch {}
});

describe("rotateLogIfNeeded", () => {
  test("does nothing if file does not exist", () => {
    expect(() => rotateLogIfNeeded(join(TMP, "nope.log"))).not.toThrow();
  });

  test("does nothing if file is under 5MB", () => {
    const logPath = join(TMP, "daemon.log");
    writeFileSync(logPath, "small content");
    rotateLogIfNeeded(logPath);
    expect(existsSync(logPath)).toBe(true);
    expect(readFileSync(logPath, "utf-8")).toBe("small content");
  });

  test("rotates file when over 5MB", () => {
    const logPath = join(TMP, "daemon.log");
    // Create a 6MB file
    const bigContent = "x".repeat(6 * 1024 * 1024);
    writeFileSync(logPath, bigContent);

    rotateLogIfNeeded(logPath);

    // Original should be gone (renamed to .1)
    expect(existsSync(logPath)).toBe(false);
    expect(existsSync(`${logPath}.1`)).toBe(true);
    expect(readFileSync(`${logPath}.1`, "utf-8").length).toBe(bigContent.length);
  });

  test("shifts existing rotated files", () => {
    const logPath = join(TMP, "daemon.log");

    // Create existing rotated files
    writeFileSync(`${logPath}.1`, "old-1");
    writeFileSync(`${logPath}.2`, "old-2");

    // Create oversized current log
    writeFileSync(logPath, "x".repeat(6 * 1024 * 1024));

    rotateLogIfNeeded(logPath);

    expect(existsSync(`${logPath}.1`)).toBe(true); // current → .1
    expect(existsSync(`${logPath}.2`)).toBe(true);  // old .1 → .2
    expect(existsSync(`${logPath}.3`)).toBe(true);  // old .2 → .3
    expect(readFileSync(`${logPath}.2`, "utf-8")).toBe("old-1");
    expect(readFileSync(`${logPath}.3`, "utf-8")).toBe("old-2");
  });

  test("deletes oldest when exceeding max rotated files", () => {
    const logPath = join(TMP, "daemon.log");

    writeFileSync(`${logPath}.1`, "old-1");
    writeFileSync(`${logPath}.2`, "old-2");
    writeFileSync(`${logPath}.3`, "old-3-should-be-deleted");

    writeFileSync(logPath, "x".repeat(6 * 1024 * 1024));

    rotateLogIfNeeded(logPath);

    // .3 should now contain old-2, old-3 was pushed out
    expect(readFileSync(`${logPath}.3`, "utf-8")).toBe("old-2");
  });
});
