import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { generateValidator, generateValidators } from "../src/core/validator-generator";
import type { ValidatorGenInput } from "../src/core/validator-generator";

const TEST_DIR = join(import.meta.dir, ".tmp-validators");

beforeEach(() => { mkdirSync(TEST_DIR, { recursive: true }); });
afterEach(() => { rmSync(TEST_DIR, { recursive: true, force: true }); });

describe("validator-generator", () => {
  it("generates prevent-deletion validator for deleted files", () => {
    const result = generateValidator(
      { failureType: "deletion", originalPath: ".claude/hooks.json", corruptedContent: "DELETED", restoredContent: '{"hooks":[]}' },
      TEST_DIR,
    );
    expect(result.written).toBe(true);
    expect(result.filename).toContain("prevent-deletion");
    const code = readFileSync(join(TEST_DIR, result.filename), "utf-8");
    expect(code).toContain("module.exports");
    expect(code).toContain("hooks.json");
    // Validate the generated function catches deletion
    const fn = new Function("module", "exports", code + "\nreturn module.exports;")({ exports: {} }, {});
    expect(fn("", ".claude/hooks.json")).toBe(true);       // empty → corrupted
    expect(fn("DELETED", ".claude/hooks.json")).toBe(true); // deletion marker → corrupted
    expect(fn('{"hooks":[]}', ".claude/hooks.json")).toBe(false); // valid → ok
    expect(fn("", "other-file.ts")).toBe(false);            // wrong file → skip
  });

  it("generates prevent-empty validator for emptied files", () => {
    const result = generateValidator(
      { failureType: "corruption", originalPath: "CLAUDE.md", corruptedContent: "  \n  ", restoredContent: "# Project\nSome content..." },
      TEST_DIR,
    );
    expect(result.written).toBe(true);
    expect(result.filename).toContain("prevent-empty");
    const code = readFileSync(join(TEST_DIR, result.filename), "utf-8");
    const fn = new Function("module", "exports", code + "\nreturn module.exports;")({ exports: {} }, {});
    expect(fn("", "CLAUDE.md")).toBe(true);
    expect(fn("# Content", "CLAUDE.md")).toBe(false);
  });

  it("generates prevent-truncation validator for severely truncated files", () => {
    const restored = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n");
    const result = generateValidator(
      { failureType: "corruption", originalPath: "src/main.ts", corruptedContent: "x", restoredContent: restored },
      TEST_DIR,
    );
    expect(result.written).toBe(true);
    expect(result.filename).toContain("prevent-truncation");
    const code = readFileSync(join(TEST_DIR, result.filename), "utf-8");
    const fn = new Function("module", "exports", code + "\nreturn module.exports;")({ exports: {} }, {});
    expect(fn("one line\n", "src/main.ts")).toBe(true);  // too few lines
    expect(fn(restored, "src/main.ts")).toBe(false);       // enough lines
  });

  it("generates require-valid-json validator for corrupted JSON", () => {
    const result = generateValidator(
      { failureType: "corruption", originalPath: "package.json", corruptedContent: "{broken", restoredContent: '{"name":"afd"}' },
      TEST_DIR,
    );
    expect(result.written).toBe(true);
    expect(result.filename).toContain("require-valid-json");
    const code = readFileSync(join(TEST_DIR, result.filename), "utf-8");
    const fn = new Function("module", "exports", code + "\nreturn module.exports;")({ exports: {} }, {});
    expect(fn("{broken", "package.json")).toBe(true);      // invalid JSON
    expect(fn('{"name":"afd"}', "package.json")).toBe(false); // valid JSON
  });

  it("generates generic corruption validator as fallback", () => {
    const result = generateValidator(
      { failureType: "corruption", originalPath: "config.yaml", corruptedContent: "corrupted stuff here", restoredContent: "good: true\nvalid: yes\nlines: many" },
      TEST_DIR,
    );
    expect(result.written).toBe(true);
    expect(result.filename).toContain("prevent-corruption");
  });

  it("does not overwrite user-modified validators", () => {
    // First generate
    const input: ValidatorGenInput = { failureType: "deletion", originalPath: ".claudeignore", corruptedContent: "DELETED", restoredContent: "*.log" };
    const first = generateValidator(input, TEST_DIR);
    expect(first.written).toBe(true);

    // Simulate user modification by removing the auto-header
    const filepath = join(TEST_DIR, first.filename);
    writeFileSync(filepath, "// User customized this\nmodule.exports = function() { return false; };\n");

    // Try to regenerate — should skip
    const second = generateValidator(input, TEST_DIR);
    expect(second.written).toBe(false);
    expect(second.reason).toBe("user-modified");
  });

  it("overwrites auto-generated validators on regeneration", () => {
    const input: ValidatorGenInput = { failureType: "deletion", originalPath: ".claudeignore", corruptedContent: "DELETED", restoredContent: "*.log" };
    const first = generateValidator(input, TEST_DIR);
    expect(first.written).toBe(true);

    // Regenerate (header still present) — should overwrite
    const second = generateValidator(input, TEST_DIR);
    expect(second.written).toBe(true);
  });

  it("generates multiple validators in batch", () => {
    const inputs: ValidatorGenInput[] = [
      { failureType: "deletion", originalPath: ".claude/hooks.json", corruptedContent: "DELETED", restoredContent: "{}" },
      { failureType: "corruption", originalPath: "package.json", corruptedContent: "{bad", restoredContent: '{"name":"x"}' },
    ];
    const results = generateValidators(inputs, TEST_DIR);
    expect(results.length).toBe(2);
    expect(results.filter(r => r.written).length).toBe(2);
  });
});
