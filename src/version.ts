import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let version = "0.0.0-unknown";
try {
  const raw = readFileSync(resolve(import.meta.dirname, "..", "package.json"), "utf-8");
  const pkg = JSON.parse(raw);
  if (typeof pkg.version === "string" && pkg.version) {
    version = pkg.version;
  }
} catch {
  // Bundled binary or missing package.json — fallback silently
}

export const APP_VERSION: string = version;
