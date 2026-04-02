/**
 * Plugin Manager — third-party validator adapter system.
 *
 * Plugin manifest: .afd/plugins/<name>.json
 * Installed validator wrapper: .afd/validators/plugin-<name>.js
 *
 * Installation strategy:
 *   1. `bun add <package>` → installs to workspace node_modules
 *   2. Wrap the package's main export in .afd/validators/plugin-<name>.js
 *   3. Write manifest to .afd/plugins/<name>.json
 *   Hot-reload is automatic (existing fs.watch on validators dir)
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from "fs";
import { join, resolve } from "path";
import { spawnSync } from "child_process";
import { findWorkspaceRoot } from "./workspace";

// ── Public Types ─────────────────────────────────────────────────────────────

/**
 * Contract for third-party validator plugins.
 * The npm package's main export must satisfy this interface.
 * A plugin can export a function directly or an object with a `validate` method.
 */
export interface ValidatorPlugin {
  /** Return true if the content is CORRUPTED (should be blocked). */
  validate(newContent: string, filePath: string): boolean;
  /** Optional metadata shown by `afd plugin list`. */
  meta?: {
    name?: string;
    description?: string;
    version?: string;
  };
}

export interface PluginManifest {
  name: string;
  package: string;
  version: string;
  description: string;
  source: "npm";
  validatorFile: string;
  installDate: string;
}

// ── Paths ────────────────────────────────────────────────────────────────────

function pluginsDir(): string {
  const root = findWorkspaceRoot();
  return join(root, ".afd", "plugins");
}

function validatorsDir(): string {
  const root = findWorkspaceRoot();
  return join(root, ".afd", "validators");
}

function manifestPath(name: string): string {
  return join(pluginsDir(), `${name}.json`);
}

function wrapperPath(name: string): string {
  return join(validatorsDir(), `plugin-${name}.js`);
}

// ── Install ──────────────────────────────────────────────────────────────────

export interface InstallResult {
  success: boolean;
  message: string;
  manifest?: PluginManifest;
}

export function installPlugin(packageName: string): InstallResult {
  const root = findWorkspaceRoot();

  // 1. bun add <package>
  const addResult = spawnSync("bun", ["add", packageName], {
    cwd: root,
    encoding: "utf-8",
    stdio: "pipe",
  });

  if (addResult.status !== 0) {
    return { success: false, message: addResult.stderr?.trim() || `Failed to install ${packageName}` };
  }

  // 2. Resolve installed package entry point
  let resolvedMain: string;
  try {
    resolvedMain = require.resolve(packageName, { paths: [root] });
  } catch {
    // Fallback: try node_modules/<package>/index.js
    const fallback = join(root, "node_modules", packageName, "index.js");
    if (!existsSync(fallback)) {
      return { success: false, message: `Cannot resolve entry point for ${packageName}` };
    }
    resolvedMain = fallback;
  }

  // 3. Validate the plugin exports a usable validator
  let pluginExport: unknown;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    pluginExport = require(resolvedMain);
  } catch (e) {
    return { success: false, message: `Failed to load plugin: ${(e as Error).message}` };
  }

  const isDirectFn = typeof pluginExport === "function";
  const hasValidate = typeof (pluginExport as ValidatorPlugin)?.validate === "function";
  if (!isDirectFn && !hasValidate) {
    return {
      success: false,
      message: `Plugin must export a function or an object with a validate(newContent, filePath) method`,
    };
  }

  // 4. Read package.json for version/description
  let pkgVersion = "unknown";
  let pkgDescription = "";
  try {
    const pkgJson = JSON.parse(
      readFileSync(join(root, "node_modules", packageName, "package.json"), "utf-8")
    );
    pkgVersion = pkgJson.version ?? "unknown";
    pkgDescription = pkgJson.description ?? "";
  } catch { /* best-effort */ }

  // 5. Write wrapper into .afd/validators/
  mkdirSync(validatorsDir(), { recursive: true });
  const safeName = packageName.replace(/[^a-zA-Z0-9_-]/g, "-");
  const wrapper = buildWrapper(packageName, resolvedMain, isDirectFn);
  writeFileSync(wrapperPath(safeName), wrapper, "utf-8");

  // 6. Write manifest into .afd/plugins/
  mkdirSync(pluginsDir(), { recursive: true });
  const manifest: PluginManifest = {
    name: safeName,
    package: packageName,
    version: pkgVersion,
    description: pkgDescription,
    source: "npm",
    validatorFile: `plugin-${safeName}.js`,
    installDate: new Date().toISOString(),
  };
  writeFileSync(manifestPath(safeName), JSON.stringify(manifest, null, 2), "utf-8");

  return {
    success: true,
    message: `Installed ${packageName}@${pkgVersion} → .afd/validators/plugin-${safeName}.js`,
    manifest,
  };
}

// ── List ─────────────────────────────────────────────────────────────────────

export function listPlugins(): PluginManifest[] {
  const dir = pluginsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(dir, f), "utf-8")) as PluginManifest;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as PluginManifest[];
}

// ── Remove ───────────────────────────────────────────────────────────────────

export interface RemoveResult {
  success: boolean;
  message: string;
}

export function removePlugin(name: string): RemoveResult {
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "-");
  const mPath = manifestPath(safeName);
  const wPath = wrapperPath(safeName);

  if (!existsSync(mPath)) {
    return { success: false, message: `Plugin not found: ${name}` };
  }

  let manifest: PluginManifest;
  try {
    manifest = JSON.parse(readFileSync(mPath, "utf-8"));
  } catch {
    return { success: false, message: `Corrupt manifest for ${name}` };
  }

  // Remove wrapper
  if (existsSync(wPath)) unlinkSync(wPath);

  // Remove manifest
  unlinkSync(mPath);

  // bun remove <package>
  const root = findWorkspaceRoot();
  spawnSync("bun", ["remove", manifest.package], { cwd: root, stdio: "pipe" });

  return { success: true, message: `Removed plugin ${name} (${manifest.package})` };
}

// ── Wrapper codegen ──────────────────────────────────────────────────────────

function buildWrapper(packageName: string, resolvedMain: string, isDirectFn: boolean): string {
  const rel = resolve(resolvedMain).replace(/\\/g, "/");
  return [
    `// [afd plugin wrapper] package: ${packageName}`,
    `// Auto-generated — managed by \`afd plugin\`. Do not edit manually.`,
    `const _plugin = require(${JSON.stringify(rel)});`,
    `module.exports = function(newContent, filePath) {`,
    isDirectFn
      ? `  return _plugin(newContent, filePath);`
      : `  return _plugin.validate(newContent, filePath);`,
    `};`,
    ``,
  ].join("\n");
}
