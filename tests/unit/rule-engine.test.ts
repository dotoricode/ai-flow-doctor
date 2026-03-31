import { describe, expect, test } from "bun:test";
import { parse } from "../../src/core/yaml-minimal";
import { loadAllRules, evaluateRules } from "../../src/core/rule-engine";
import type { DiagnosticRule } from "../../src/core/rule-engine";

describe("yaml-minimal parser", () => {
  test("parses flat key-value pairs", () => {
    const result = parse("id: IMM-001\ntitle: Test Rule\nseverity: critical");
    expect(result.id).toBe("IMM-001");
    expect(result.title).toBe("Test Rule");
    expect(result.severity).toBe("critical");
  });

  test("parses nested objects", () => {
    const result = parse("condition:\n  type: file-missing\n  path: .env");
    expect((result.condition as any).type).toBe("file-missing");
    expect((result.condition as any).path).toBe(".env");
  });

  test("parses arrays of objects", () => {
    const result = parse("patches:\n  - op: add\n    path: /file\n    value: content");
    const patches = result.patches as any[];
    expect(patches).toHaveLength(1);
    expect(patches[0].op).toBe("add");
    expect(patches[0].path).toBe("/file");
  });

  test("handles comments and empty lines", () => {
    const result = parse("# comment\nid: test\n\n# another\ntitle: ok");
    expect(result.id).toBe("test");
    expect(result.title).toBe("ok");
  });

  test("parses booleans and numbers", () => {
    const result = parse("enabled: true\ncount: 42\noff: false");
    expect(result.enabled).toBe(true);
    expect(result.count).toBe(42);
    expect(result.off).toBe(false);
  });
});

describe("rule engine", () => {
  test("loads built-in rules (IMM-001~003)", () => {
    const rules = loadAllRules();
    const ids = rules.map(r => r.id);
    expect(ids).toContain("IMM-001");
    expect(ids).toContain("IMM-002");
    expect(ids).toContain("IMM-003");
  });

  test("evaluates file-missing condition correctly", () => {
    const rules: DiagnosticRule[] = [
      {
        id: "TEST-001",
        title: "Missing nonexistent file",
        description: "Test",
        severity: "warning",
        condition: { type: "file-missing", path: "this-file-does-not-exist.xyz" },
        patches: [],
      },
    ];
    const result = evaluateRules(rules, []);
    expect(result.symptoms).toHaveLength(1);
    expect(result.symptoms[0].id).toBe("TEST-001");
  });

  test("evaluates file-missing for existing file", () => {
    const rules: DiagnosticRule[] = [
      {
        id: "TEST-002",
        title: "Package.json exists",
        description: "Test",
        severity: "info",
        condition: { type: "file-missing", path: "package.json" },
        patches: [],
      },
    ];
    const result = evaluateRules(rules, []);
    expect(result.symptoms).toHaveLength(0);
    expect(result.healthy).toContain("OK");
  });

  test("respects knownAntibodies (immunized)", () => {
    const rules: DiagnosticRule[] = [
      {
        id: "TEST-003",
        title: "Test",
        description: "Test",
        severity: "critical",
        condition: { type: "file-missing", path: "nonexistent.xyz" },
        patches: [],
      },
    ];
    const result = evaluateRules(rules, ["TEST-003"]);
    expect(result.symptoms).toHaveLength(0);
    expect(result.healthy).toContain("TEST-003 (immunized)");
  });

  test("raw mode ignores antibody immunization", () => {
    const rules: DiagnosticRule[] = [
      {
        id: "TEST-004",
        title: "Test",
        description: "Test",
        severity: "critical",
        condition: { type: "file-missing", path: "nonexistent.xyz" },
        patches: [],
      },
    ];
    const result = evaluateRules(rules, ["TEST-004"], { raw: true });
    expect(result.symptoms).toHaveLength(1);
  });

  test("evaluates file-invalid-json for valid JSON", () => {
    const rules: DiagnosticRule[] = [
      {
        id: "TEST-005",
        title: "Test",
        description: "Test",
        severity: "warning",
        condition: { type: "file-invalid-json", path: "package.json" },
        patches: [],
      },
    ];
    const result = evaluateRules(rules, []);
    expect(result.symptoms).toHaveLength(0);
  });

  test("diagnose() backward compatibility via immune.ts", () => {
    const { diagnose } = require("../../src/core/immune");
    const result = diagnose(["IMM-001", "IMM-002", "IMM-003"]);
    // All 3 built-in rules should be immunized
    expect(result.symptoms).toHaveLength(0);
    expect(result.healthy.length).toBeGreaterThanOrEqual(3);
  });
});
