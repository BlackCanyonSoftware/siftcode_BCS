import type { Node } from 'web-tree-sitter';
import type { ClassFact, FileFacts } from '../model/types.js';
import type { GrammarId } from '../registry.js';
import { extractCalls } from './calls.js';
import { extractChains } from './chains.js';
import { extractClasses } from './classes.js';
import { extractImports } from './imports.js';
import { extractNamedValues, extractStrings } from './named.js';

export interface ExtractedFacts {
  readonly classes: readonly ClassFact[];
  readonly facts: FileFacts;
}

/**
 * Everything the design and security rules need beyond measurements: classes, imports, member
 * chains, calls, named values, and long strings.
 */
export function extractFacts(grammar: GrammarId, root: Node): ExtractedFacts {
  return {
    classes: extractClasses(grammar, root),
    facts: {
      imports: extractImports(grammar, root),
      chains: extractChains(grammar, root),
      calls: extractCalls(grammar, root),
      namedValues: extractNamedValues(grammar, root),
      strings: extractStrings(grammar, root),
    },
  };
}
