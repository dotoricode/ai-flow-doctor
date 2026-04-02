import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const MESH_DIR = join(homedir(), ".afd");
const MESH_FILE = join(MESH_DIR, "mesh.json");

export interface MeshEntry {
  workspace: string;
  port: number;
  pid: number;
  registeredAt: number;
}

function readRegistry(): MeshEntry[] {
  if (!existsSync(MESH_FILE)) return [];
  try {
    return JSON.parse(readFileSync(MESH_FILE, "utf-8")) as MeshEntry[];
  } catch {
    return [];
  }
}

function writeRegistry(entries: MeshEntry[]): void {
  mkdirSync(MESH_DIR, { recursive: true });
  writeFileSync(MESH_FILE, JSON.stringify(entries, null, 2));
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function registerMesh(workspace: string, port: number, pid: number): void {
  const entries = readRegistry().filter(e => e.workspace !== workspace && isAlive(e.pid));
  entries.push({ workspace, port, pid, registeredAt: Date.now() });
  writeRegistry(entries);
}

export function deregisterMesh(workspace: string): void {
  const entries = readRegistry().filter(e => e.workspace !== workspace && isAlive(e.pid));
  writeRegistry(entries);
}

export function listMeshPeers(currentWorkspace: string): MeshEntry[] {
  return readRegistry().filter(e => e.workspace !== currentWorkspace && isAlive(e.pid));
}
