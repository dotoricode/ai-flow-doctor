import { describe, expect, test, afterAll } from "bun:test";
import { rmSync, existsSync } from "fs";
import { join } from "path";
import {
  publishPackage,
  searchPackages,
  installPackage,
  getPackage,
  listInstalled,
} from "../../src/core/vaccine-registry";
import type { VaccinePackage } from "../../src/core/vaccine-registry";

// Tests run from project root, so .afd/ is the real directory
// We'll use the actual registry in .afd/ for testing

const testPkg: VaccinePackage = {
  name: "test-security",
  version: "1.0.0",
  description: "Test security rules",
  author: "afd-test",
  ecosystem: "Claude Code",
  antibodies: [
    {
      id: "SEC-001",
      title: "No .env in repo",
      description: "Ensure .env is gitignored",
      severity: "critical",
      condition: { type: "file-missing-line", path: ".gitignore", pattern: "^\\.env$" },
      patches: [],
    },
    {
      id: "SEC-002",
      title: "No secrets in code",
      description: "Check for hardcoded API keys",
      severity: "warning",
      condition: { type: "file-contains", path: "src/**", pattern: "AKIA[0-9A-Z]{16}" },
      patches: [],
    },
  ],
  createdAt: new Date().toISOString(),
};

describe("vaccine registry", () => {
  afterAll(() => {
    // Clean up test artifacts
    try { rmSync(join(".afd", "rules", "test-security-SEC-001.yml"), { force: true }); } catch {}
    try { rmSync(join(".afd", "rules", "test-security-SEC-002.yml"), { force: true }); } catch {}
    try { rmSync(join(".afd", "registry", "packages", "test-security"), { recursive: true, force: true }); } catch {}
  });

  test("publish and retrieve package", () => {
    const result = publishPackage(testPkg);
    expect(result.success).toBe(true);

    const pkg = getPackage("test-security");
    expect(pkg).not.toBeNull();
    expect(pkg!.name).toBe("test-security");
    expect(pkg!.antibodies).toHaveLength(2);
  });

  test("search packages", () => {
    publishPackage(testPkg);

    const all = searchPackages();
    expect(all.length).toBeGreaterThanOrEqual(1);

    const found = searchPackages("security");
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found[0].name).toBe("test-security");

    const notFound = searchPackages("xyznonexistent");
    expect(notFound).toHaveLength(0);
  });

  test("install package creates rules", () => {
    publishPackage(testPkg);

    const result = installPackage("test-security");
    expect(result.success).toBe(true);
    expect(result.installed).toBe(2);

    // Check rule files exist
    expect(existsSync(join(".afd", "rules", "test-security-SEC-001.yml"))).toBe(true);
    expect(existsSync(join(".afd", "rules", "test-security-SEC-002.yml"))).toBe(true);
  });

  test("install nonexistent package fails", () => {
    const result = installPackage("does-not-exist");
    expect(result.success).toBe(false);
  });

  test("list installed packages", () => {
    publishPackage(testPkg);
    installPackage("test-security");

    const installed = listInstalled();
    expect(installed).toContain("test-security");
  });
});
