import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Language, Parser } from 'web-tree-sitter';
import { firstConditionalBranch } from './conditional-compilation.js';
import { extractUnits, measureFile } from './extract.js';
import { extractFacts } from './facts/index.js';
import type { ClassFact, CodeMetrics, CodeUnit, FileFacts } from './model/types.js';
import { grammarFileName, type GrammarId } from './registry.js';

/** `grammars/` sits two levels above this file in both `src/` and `dist/`. */
const GRAMMAR_DIR = fileURLToPath(new URL('../../grammars/', import.meta.url));

/** Upper bound for parsing one file, so a hostile or huge file cannot stall a scan. */
export const PARSE_TIMEOUT_MS = 5_000;

/**
 * How parsing a file went:
 * - `ok`: the file parsed cleanly
 * - `syntax-error`: a tree was produced but contains error nodes (tree-sitter recovers)
 * - `timeout`: parsing was cancelled after {@link PARSE_TIMEOUT_MS}
 */
export type ParseOutcome = 'ok' | 'syntax-error' | 'timeout';

/**
 * A file is only measured when it parsed cleanly: figures from half-parsed code would be
 * unreliable, so files with syntax errors or timeouts carry no units or metrics.
 */
export type ParseResult =
  | {
      readonly outcome: 'ok';
      /** Named functions and methods, each measured. */
      readonly units: readonly CodeUnit[];
      /** Measurements of the whole file. */
      readonly metrics: CodeMetrics;
      /** Named classes, structs, and records. */
      readonly classes: readonly ClassFact[];
      /** Imports and member-access chains, for the rules that run on the file. */
      readonly facts: FileFacts;
      /**
       * C# only: the file does not parse as written, so it was read as the first branch of its `#if`
       * blocks. The code under `#else` and `#elif` is not in the units, metrics, or facts.
       */
      readonly conditionalCompilation?: true;
    }
  | { readonly outcome: 'syntax-error' | 'timeout' };

let initialization: Promise<void> | undefined;

function initializeTreeSitter(): Promise<void> {
  initialization ??= Parser.init();
  return initialization;
}

/**
 * Parses source text with tree-sitter grammars. Holds native-heap resources, so call
 * {@link SyntaxParser.dispose} when finished.
 */
export class SyntaxParser {
  private readonly parser = new Parser();
  private readonly languages = new Map<GrammarId, Language>();

  static async create(): Promise<SyntaxParser> {
    await initializeTreeSitter();
    return new SyntaxParser();
  }

  async parse(grammar: GrammarId, source: string): Promise<ParseResult> {
    const result = await this.parseOnce(grammar, source);
    if (result.outcome !== 'syntax-error' || grammar !== 'csharp') {
      return result;
    }
    // A C# file that only fails because of its `#if` blocks is read as their first branch.
    const firstBranch = firstConditionalBranch(source);
    if (firstBranch === undefined) {
      return result;
    }
    const retry = await this.parseOnce(grammar, firstBranch);
    return retry.outcome === 'ok' ? { ...retry, conditionalCompilation: true } : result;
  }

  private async parseOnce(grammar: GrammarId, source: string): Promise<ParseResult> {
    this.parser.setLanguage(await this.loadLanguage(grammar));
    const deadline = Date.now() + PARSE_TIMEOUT_MS;
    const tree = this.parser.parse(source, null, {
      progressCallback: () => Date.now() > deadline,
    });
    if (tree === null) {
      this.parser.reset();
      return { outcome: 'timeout' };
    }
    try {
      const root = tree.rootNode;
      if (root.hasError) {
        return { outcome: 'syntax-error' };
      }
      return {
        outcome: 'ok',
        units: extractUnits(grammar, root),
        metrics: measureFile(grammar, root),
        ...extractFacts(grammar, root),
      };
    } finally {
      tree.delete();
    }
  }

  dispose(): void {
    this.parser.delete();
    this.languages.clear();
  }

  private async loadLanguage(grammar: GrammarId): Promise<Language> {
    const cached = this.languages.get(grammar);
    if (cached) {
      return cached;
    }
    const file = join(GRAMMAR_DIR, grammarFileName(grammar));
    try {
      const language = await Language.load(file);
      this.languages.set(grammar, language);
      return language;
    } catch (cause) {
      throw new Error(
        `Could not load the ${grammar} grammar from ${file}. Run "npm run build:grammars".`,
        { cause },
      );
    }
  }
}
