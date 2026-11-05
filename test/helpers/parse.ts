import type { SyntaxParser } from '../../src/languages/parser.js';
import type { GrammarId } from '../../src/languages/registry.js';

/** Parses source that is expected to be valid; fails the test with a clear message if it is not. */
export async function parseOk(parser: SyntaxParser, grammar: GrammarId, source: string) {
  const result = await parser.parse(grammar, source);
  if (result.outcome !== 'ok') {
    throw new Error(
      `Expected ${grammar} source to parse cleanly, got ${result.outcome}:\n${source}`,
    );
  }
  return result;
}
