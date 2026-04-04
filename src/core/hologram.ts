/**
 * Hologram Engine — Language Dispatcher
 *
 * Routes file parsing to the appropriate tree-sitter extractor based on extension.
 * Falls back to L0 (full source) for unsupported languages or parse errors.
 */

import { TreeSitterEngine } from "./hologram/engine";
import { tsExtractor } from "./hologram/ts-extractor";
import { pyExtractor } from "./hologram/py-extractor";
import { goExtractor } from "./hologram/go-extractor";
import { rustExtractor } from "./hologram/rust-extractor";
import { fallbackL0 } from "./hologram/fallback";
import { generateIncrementalHologram, setCachedHologram } from "./hologram/incremental";
import { traceCallGraph } from "./hologram/call-graph";
import type { HologramResult, HologramOptions, LanguageExtractor } from "./hologram/types";
import { resolveGrammar } from "./hologram/grammar-resolver";

// Re-export types for backward compatibility
export type { HologramResult, HologramOptions } from "./hologram/types";
export { clearHologramCache } from "./hologram/incremental";

const extractors: LanguageExtractor[] = [tsExtractor, pyExtractor, goExtractor, rustExtractor];

function detectExtractor(filePath: string): LanguageExtractor | null {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return extractors.find(e => e.extensions.includes(ext)) ?? null;
}

export async function generateHologram(
  filePath: string,
  source: string,
  options?: HologramOptions,
): Promise<HologramResult> {
  const extractor = detectExtractor(filePath);

  if (!extractor) {
    return fallbackL0(filePath, source);
  }

  // Incremental diff mode
  if (options?.diffOnly) {
    try {
      return await generateIncrementalHologram(filePath, source, extractor, options);
    } catch {
      return fallbackL0(filePath, source);
    }
  }

  try {
    const engine = await TreeSitterEngine.getInstance();
    const grammar = resolveGrammar(filePath, extractor.grammarName);
    const tree = await engine.parse(source, grammar);
    const lines = extractor.extract(tree, source, options);
    tree.delete();

    // Cache for future incremental diffs
    setCachedHologram(filePath, lines);

    let hologram = lines.join("\n");

    // N-Depth: append cross-file dependency signatures
    if (options?.nDepth && options.nDepth >= 2) {
      try {
        const deps = await traceCallGraph(filePath, source, { maxDepth: options.nDepth });
        if (deps.length > 0) {
          const depLines = ["\n// [🔗 N-Depth Dependencies]"];
          const byFile = new Map<string, typeof deps>();
          for (const d of deps) {
            const arr = byFile.get(d.sourceFile) ?? [];
            arr.push(d);
            byFile.set(d.sourceFile, arr);
          }
          for (const [file, entries] of byFile) {
            const relPath = file.replace(/\\/g, "/");
            depLines.push(`// --- ${relPath} (L${entries[0].depth}) ---`);
            for (const e of entries) {
              depLines.push(e.signature);
            }
          }
          hologram += "\n" + depLines.join("\n");
        }
      } catch { /* N-Depth is best-effort; don't fail the hologram */ }
    }

    const hologramLength = hologram.length;
    const savings = source.length > 0
      ? Math.round((source.length - hologramLength) / source.length * 1000) / 10
      : 0;

    return {
      hologram,
      originalLength: source.length,
      hologramLength,
      savings,
      language: extractor.grammarName,
    };
  } catch {
    return fallbackL0(filePath, source);
  }
}
