import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { detectEcosystem, CursorAdapter, WindsurfAdapter, CodexAdapter } from "../../src/adapters/index";

const TEST_DIR = join(import.meta.dir, "..", "__tmp_adapter_test__");

function setup() {
  mkdirSync(TEST_DIR, { recursive: true });
}

function cleanup() {
  try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
}

describe("Cursor adapter", () => {
  beforeEach(setup);
  afterEach(cleanup);

  test("detects .cursorrules", () => {
    writeFileSync(join(TEST_DIR, ".cursorrules"), "# rules");
    expect(CursorAdapter.detect(TEST_DIR)).toBe(true);
  });

  test("detects .cursor dir", () => {
    mkdirSync(join(TEST_DIR, ".cursor"), { recursive: true });
    expect(CursorAdapter.detect(TEST_DIR)).toBe(true);
  });

  test("injectHooks creates .cursor/hooks.json", () => {
    const result = CursorAdapter.injectHooks!(TEST_DIR);
    expect(result.injected).toBe(true);
    const hooks = JSON.parse(readFileSync(join(TEST_DIR, ".cursor", "hooks.json"), "utf-8"));
    expect(hooks.hooks.PreToolUse).toHaveLength(1);
    expect(hooks.hooks.PreToolUse[0].id).toBe("afd-auto-heal");
  });

  test("injectHooks is idempotent", () => {
    CursorAdapter.injectHooks!(TEST_DIR);
    const result2 = CursorAdapter.injectHooks!(TEST_DIR);
    expect(result2.injected).toBe(false);
    const hooks = JSON.parse(readFileSync(join(TEST_DIR, ".cursor", "hooks.json"), "utf-8"));
    expect(hooks.hooks.PreToolUse).toHaveLength(1);
  });
});

describe("Windsurf adapter", () => {
  beforeEach(setup);
  afterEach(cleanup);

  test("detects .windsurfrules", () => {
    writeFileSync(join(TEST_DIR, ".windsurfrules"), "# rules");
    expect(WindsurfAdapter.detect(TEST_DIR)).toBe(true);
  });

  test("does not detect empty dir", () => {
    expect(WindsurfAdapter.detect(TEST_DIR)).toBe(false);
  });

  test("injectHooks creates .windsurf/hooks.json", () => {
    const result = WindsurfAdapter.injectHooks!(TEST_DIR);
    expect(result.injected).toBe(true);
    expect(existsSync(join(TEST_DIR, ".windsurf", "hooks.json"))).toBe(true);
  });
});

describe("Codex adapter", () => {
  beforeEach(setup);
  afterEach(cleanup);

  test("detects codex.md", () => {
    writeFileSync(join(TEST_DIR, "codex.md"), "# codex");
    expect(CodexAdapter.detect(TEST_DIR)).toBe(true);
  });

  test("does not detect empty dir", () => {
    expect(CodexAdapter.detect(TEST_DIR)).toBe(false);
  });

  test("injectHooks creates .codex/hooks.json", () => {
    const result = CodexAdapter.injectHooks!(TEST_DIR);
    expect(result.injected).toBe(true);
    expect(existsSync(join(TEST_DIR, ".codex", "hooks.json"))).toBe(true);
  });
});

describe("detectEcosystem", () => {
  beforeEach(setup);
  afterEach(cleanup);

  test("detects multiple ecosystems", () => {
    mkdirSync(join(TEST_DIR, ".claude"), { recursive: true });
    writeFileSync(join(TEST_DIR, ".cursorrules"), "# rules");
    const results = detectEcosystem(TEST_DIR);
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].confidence).toBe("primary");
    expect(results[1].confidence).toBe("secondary");
  });
});
