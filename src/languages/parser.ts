import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Language, Parser } from 'web-tree-sitter';
import { extractUnits } from './extract.js';
import type { CodeUnit } from './model/types.js';
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

export interface ParseResult {
  readonly outcome: ParseOutcome;
  /** Named functions and methods found; empty when parsing timed out. */
  readonly units: readonly CodeUnit[];
}

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
    this.parser.setLanguage(await this.loadLanguage(grammar));
    const deadline = Date.now() + PARSE_TIMEOUT_MS;
    const tree = this.parser.parse(source, null, {
      progressCallback: () => Date.now() > deadline,
    });
    if (tree === null) {
      this.parser.reset();
      return { outcome: 'timeout', units: [] };
    }
    try {
      return {
        outcome: tree.rootNode.hasError ? 'syntax-error' : 'ok',
        units: extractUnits(grammar, tree.rootNode),
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
