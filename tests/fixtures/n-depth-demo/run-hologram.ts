/**
 * N-Depth Hologram Rendering Test Runner
 *
 * Calls generateHologram on App.ts with nDepth: 2 and prints the result.
 */
import { resolve } from "path";
import { generateHologram } from "../../../src/core/hologram";

const appPath = resolve(import.meta.dir, "App.tsx");
const appSource = await Bun.file(appPath).text();

console.log("=== N-Depth Hologram Rendering Test ===\n");
console.log(`Target: ${appPath}`);
console.log(`Source length: ${appSource.length} bytes\n`);

// Run hologram extraction with N-Depth enabled
const result = await generateHologram(appPath, appSource, { nDepth: 2 });

console.log("--- Hologram Result ---");
console.log(`Language: ${result.language}`);
console.log(`Original: ${result.originalLength} bytes`);
console.log(`Hologram: ${result.hologramLength} bytes`);
console.log(`Savings: ${result.savings}%`);
console.log();
console.log("--- Rendered Hologram ---");
console.log(result.hologram);
