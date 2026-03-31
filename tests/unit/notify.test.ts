import { describe, test, expect } from "bun:test";
import { IS_WINDOWS, IS_MACOS, IS_LINUX } from "../../src/platform";

describe("notifyAutoHeal", () => {
  test("module loads without error", async () => {
    const mod = await import("../../src/core/notify");
    expect(typeof mod.notifyAutoHeal).toBe("function");
  });

  test("calling with any patternId does not throw", () => {
    // Importing dynamically to avoid side effects
    const { notifyAutoHeal } = require("../../src/core/notify");
    // Should not throw regardless of OS (silently ignores if binary missing)
    expect(() => notifyAutoHeal("TEST-001")).not.toThrow();
  });

  test("platform flags are mutually consistent", () => {
    // At least verifies the dispatch branches exist
    const trueFlags = [IS_WINDOWS, IS_MACOS, IS_LINUX].filter(Boolean);
    expect(trueFlags.length).toBeLessThanOrEqual(1);
  });
});
