import type { Node } from 'web-tree-sitter';
import type { ClassFact, FileFacts } from '../model/types.js';
import type { GrammarId } from '../registry.js';
import { extractChains } from './chains.js';
import { extractClasses } from './classes.js';
import { extractImports } from './imports.js';

export interface ExtractedFacts {
  readonly classes: readonly ClassFact[];
  readonly facts: FileFacts;
}

/** Everything the design rules need beyond measurements: classes, imports, and member chains. */
export function extractFacts(grammar: GrammarId, root: Node): ExtractedFacts {
  return {
    classes: extractClasses(grammar, root),
    facts: { imports: extractImports(grammar, root), chains: extractChains(grammar, root) },
  };
}
