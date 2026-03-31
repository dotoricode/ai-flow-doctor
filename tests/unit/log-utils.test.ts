import { describe, test, expect } from "bun:test";
import { formatTimestamp, lineDiff } from "../../src/core/log-utils";

describe("formatTimestamp", () => {
  test("formats date as HH:MM:SS.mmm", () => {
    const d = new Date(2026, 2, 31, 14, 5, 9, 42);
    expect(formatTimestamp(d)).toBe("14:05:09.042");
  });

  test("pads single digits with zeros", () => {
    const d = new Date(2026, 0, 1, 0, 0, 0, 0);
    expect(formatTimestamp(d)).toBe("00:00:00.000");
  });

  test("handles midnight boundary", () => {
    const d = new Date(2026, 0, 1, 23, 59, 59, 999);
    expect(formatTimestamp(d)).toBe("23:59:59.999");
  });

  test("returns current time when no argument", () => {
    const result = formatTimestamp();
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });
});

describe("lineDiff", () => {
  test("returns empty array for identical content", () => {
    expect(lineDiff("hello\nworld", "hello\nworld")).toEqual([]);
  });

  test("detects single line change", () => {
    const result = lineDiff("line1\nline2\nline3", "line1\nchanged\nline3");
    expect(result).toEqual([`  L2: "line2" → "changed"`]);
  });

  test("detects added lines", () => {
    const result = lineDiff("line1", "line1\nline2\nline3");
    expect(result).toEqual([
      `  L2: + "line2"`,
      `  L3: + "line3"`,
    ]);
  });

  test("detects removed lines", () => {
    const result = lineDiff("line1\nline2\nline3", "line1");
    expect(result).toEqual([
      `  L2: - "line2"`,
      `  L3: - "line3"`,
    ]);
  });

  test("detects mixed changes", () => {
    const old = "a\nb\nc";
    const updated = "a\nB\nc\nd";
    const result = lineDiff(old, updated);
    expect(result).toEqual([
      `  L2: "b" → "B"`,
      `  L4: + "d"`,
    ]);
  });

  test("truncates at maxLines (default 10)", () => {
    const old = Array.from({ length: 20 }, (_, i) => `old-${i}`).join("\n");
    const updated = Array.from({ length: 20 }, (_, i) => `new-${i}`).join("\n");
    const result = lineDiff(old, updated);
    expect(result).toHaveLength(11); // 10 diffs + truncated message
    expect(result[10]).toBe("  ... (truncated)");
  });

  test("respects custom maxLines", () => {
    const old = "a\nb\nc\nd\ne";
    const updated = "1\n2\n3\n4\n5";
    const result = lineDiff(old, updated, 3);
    expect(result).toHaveLength(4); // 3 diffs + truncated
    expect(result[3]).toBe("  ... (truncated)");
  });

  test("trims trailing whitespace in output", () => {
    const result = lineDiff("hello   ", "world   ");
    expect(result).toEqual([`  L1: "hello" → "world"`]);
  });

  test("handles empty strings", () => {
    const result = lineDiff("", "new content");
    expect(result).toEqual([`  L1: "" → "new content"`]);
  });
});
