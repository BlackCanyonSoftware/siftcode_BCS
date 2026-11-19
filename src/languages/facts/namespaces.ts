import type { Node } from 'web-tree-sitter';
import type { GrammarId } from '../registry.js';

/**
 * The namespaces a C# file declares (`namespace A.B { }` and the file-scoped `namespace A.B;`).
 * Other languages have none: a JavaScript or Python import names a file, a C# `using` names a
 * namespace, and this is how a `using` is matched to the files that declare it.
 */
export function extractNamespaces(grammar: GrammarId, root: Node): string[] {
  if (grammar !== 'csharp') {
    return [];
  }
  return root
    .descendantsOfType(['namespace_declaration', 'file_scoped_namespace_declaration'])
    .map((node) => node.childForFieldName('name')?.text ?? '')
    .filter((name) => name !== '');
}
