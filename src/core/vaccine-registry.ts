/**
 * Vaccine Registry — central antibody package system
 *
 * Manages vaccine packages that can be published, searched, and installed.
 * Registry index is stored at .afd/registry/index.json
 * Each package is a directory under .afd/registry/packages/<name>/
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { AFD_DIR } from "../constants";

export interface VaccinePackage {
  name: string;
  version: string;
  description: string;
  author: string;
  ecosystem: string;
  antibodies: VaccineAntibodyDef[];
  createdAt: string;
  signature?: string; // future: cryptographic signature
}

export interface VaccineAntibodyDef {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
  condition: {
    type: string;
    path: string;
    pattern?: string;
    minLength?: number;
  };
  patches: { op: string; path: string; value?: string }[];
}

export interface RegistryIndex {
  version: string;
  updatedAt: string;
  packages: RegistryEntry[];
}

export interface RegistryEntry {
  name: string;
  version: string;
  description: string;
  author: string;
  ecosystem: string;
  antibodyCount: number;
}

const REGISTRY_DIR = join(AFD_DIR, "registry");
const PACKAGES_DIR = join(REGISTRY_DIR, "packages");
const INDEX_FILE = join(REGISTRY_DIR, "index.json");

function ensureDirs() {
  mkdirSync(PACKAGES_DIR, { recursive: true });
}

function loadIndex(): RegistryIndex {
  if (!existsSync(INDEX_FILE)) {
    return { version: "1.0.0", updatedAt: new Date().toISOString(), packages: [] };
  }
  try {
    return JSON.parse(readFileSync(INDEX_FILE, "utf-8"));
  } catch {
    return { version: "1.0.0", updatedAt: new Date().toISOString(), packages: [] };
  }
}

function saveIndex(index: RegistryIndex) {
  ensureDirs();
  index.updatedAt = new Date().toISOString();
  writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), "utf-8");
}

/** Publish a vaccine package to the local registry */
export function publishPackage(pkg: VaccinePackage): { success: boolean; message: string } {
  ensureDirs();

  const pkgDir = join(PACKAGES_DIR, pkg.name);
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(join(pkgDir, "vaccine.json"), JSON.stringify(pkg, null, 2), "utf-8");

  // Update index
  const index = loadIndex();
  const existing = index.packages.findIndex(p => p.name === pkg.name);
  const entry: RegistryEntry = {
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    author: pkg.author,
    ecosystem: pkg.ecosystem,
    antibodyCount: pkg.antibodies.length,
  };

  if (existing >= 0) {
    index.packages[existing] = entry;
  } else {
    index.packages.push(entry);
  }
  saveIndex(index);

  return { success: true, message: `Published ${pkg.name}@${pkg.version} (${pkg.antibodies.length} antibodies)` };
}

/** Search packages in the registry */
export function searchPackages(query?: string): RegistryEntry[] {
  const index = loadIndex();
  if (!query) return index.packages;
  const q = query.toLowerCase();
  return index.packages.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.description.toLowerCase().includes(q) ||
    p.ecosystem.toLowerCase().includes(q)
  );
}

/** Get full package details */
export function getPackage(name: string): VaccinePackage | null {
  const pkgFile = join(PACKAGES_DIR, name, "vaccine.json");
  if (!existsSync(pkgFile)) return null;
  try {
    return JSON.parse(readFileSync(pkgFile, "utf-8"));
  } catch {
    return null;
  }
}

/** Install a package — writes antibody rules to .afd/rules/ */
export function installPackage(name: string): { success: boolean; installed: number; message: string } {
  const pkg = getPackage(name);
  if (!pkg) return { success: false, installed: 0, message: `Package '${name}' not found` };

  const rulesDir = join(AFD_DIR, "rules");
  mkdirSync(rulesDir, { recursive: true });

  let installed = 0;
  for (const ab of pkg.antibodies) {
    const ruleContent = buildYamlRule(ab);
    const ruleFile = join(rulesDir, `${pkg.name}-${ab.id}.yml`);
    writeFileSync(ruleFile, ruleContent, "utf-8");
    installed++;
  }

  return {
    success: true,
    installed,
    message: `Installed ${pkg.name}@${pkg.version}: ${installed} rules added to .afd/rules/`,
  };
}

/** List installed packages (by checking .afd/rules/ for package-prefixed files) */
export function listInstalled(): string[] {
  const rulesDir = join(AFD_DIR, "rules");
  if (!existsSync(rulesDir)) return [];
  if (!existsSync(PACKAGES_DIR)) return [];

  // Get all known package names from registry
  let knownPackages: string[];
  try {
    knownPackages = readdirSync(PACKAGES_DIR);
  } catch {
    return [];
  }

  const files = readdirSync(rulesDir).filter(f => f.endsWith(".yml") || f.endsWith(".yaml"));
  const installed = new Set<string>();

  for (const pkgName of knownPackages) {
    // Check if any rule file starts with this package name
    if (files.some(f => f.startsWith(`${pkgName}-`))) {
      installed.add(pkgName);
    }
  }

  return [...installed];
}

function buildYamlRule(ab: VaccineAntibodyDef): string {
  const lines: string[] = [
    `# Auto-generated by afd vaccine registry`,
    `id: ${ab.id}`,
    `title: "${ab.title}"`,
    `description: "${ab.description}"`,
    `severity: ${ab.severity}`,
    `condition:`,
    `  type: ${ab.condition.type}`,
    `  path: ${ab.condition.path}`,
  ];

  if (ab.condition.pattern) {
    lines.push(`  pattern: "${ab.condition.pattern}"`);
  }
  if (ab.condition.minLength !== undefined) {
    lines.push(`  minLength: ${ab.condition.minLength}`);
  }

  if (ab.patches.length > 0) {
    lines.push(`patches:`);
    for (const p of ab.patches) {
      lines.push(`  - op: ${p.op}`);
      lines.push(`    path: ${p.path}`);
      if (p.value !== undefined) {
        lines.push(`    value: "${p.value.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`);
      }
    }
  }

  return lines.join("\n") + "\n";
}
