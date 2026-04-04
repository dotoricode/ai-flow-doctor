import { Parser, Language, type Tree } from "web-tree-sitter";
import { resolve, dirname } from "path";

/**
 * Singleton Tree-sitter engine with grammar caching.
 * Parser.init() runs once; grammar WASMs are lazy-loaded and cached in-memory.
 */
export class TreeSitterEngine {
  private static instance: TreeSitterEngine | null = null;
  private parser: Parser | null = null;
  private grammarCache = new Map<string, Language>();
  private initPromise: Promise<void> | null = null;

  static async getInstance(): Promise<TreeSitterEngine> {
    if (!this.instance) {
      this.instance = new TreeSitterEngine();
      await this.instance.init();
    }
    return this.instance;
  }

  /** Reset singleton — for testing only */
  static resetForTest(): void {
    if (this.instance?.parser) {
      this.instance.parser.delete();
    }
    this.instance = null;
  }

  private async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      await Parser.init();
      this.parser = new Parser();
    })();
    return this.initPromise;
  }

  async parse(source: string, grammarName: string): Promise<Tree> {
    const grammar = await this.loadGrammar(grammarName);
    this.parser!.setLanguage(grammar);
    const tree = this.parser!.parse(source);
    if (!tree) throw new Error(`Failed to parse with grammar: ${grammarName}`);
    return tree;
  }

  private async loadGrammar(grammarName: string): Promise<Language> {
    const cached = this.grammarCache.get(grammarName);
    if (cached) return cached;

    const wasmPath = resolveGrammarWasm(grammarName);
    const lang = await Language.load(wasmPath);
    this.grammarCache.set(grammarName, lang);
    return lang;
  }
}

/** Map grammar names to their host package (when different from tree-sitter-{name}) */
const GRAMMAR_PACKAGE_MAP: Record<string, string> = {
  tsx: "tree-sitter-typescript", // tsx WASM lives inside tree-sitter-typescript
};

/** Resolve WASM file path from installed npm grammar package */
function resolveGrammarWasm(grammarName: string): string {
  // Grammar packages: tree-sitter-typescript, tree-sitter-python, etc.
  // WASM file is at package root: node_modules/tree-sitter-{name}/tree-sitter-{name}.wasm
  const wasmFileName = `tree-sitter-${grammarName}`;
  const packageName = GRAMMAR_PACKAGE_MAP[grammarName] ?? wasmFileName;
  try {
    // require.resolve returns bindings/node/index.js — walk up to package root
    const pkgJson = require.resolve(`${packageName}/package.json`);
    return resolve(dirname(pkgJson), `${wasmFileName}.wasm`);
  } catch {
    // Fallback: try direct node_modules path
    return resolve(process.cwd(), "node_modules", packageName, `${wasmFileName}.wasm`);
  }
}
