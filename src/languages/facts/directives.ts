import type { Node } from 'web-tree-sitter';
import type { DirectiveComment } from '../model/types.js';

/** The longest comment kept: a directive is one short line, so anything longer is not one. */
const MAX_COMMENT_LENGTH = 400;

/**
 * Comments that hold a `siftcode-ignore` directive. Taken from the syntax tree, so the same words
 * inside a string literal are not mistaken for a comment. Every supported grammar calls its
 * comment nodes `comment`.
 */
export function extractDirectives(root: Node): DirectiveComment[] {
  return root
    .descendantsOfType('comment')
    .filter(
      (node) => node.text.includes('siftcode-ignore') && node.text.length <= MAX_COMMENT_LENGTH,
    )
    .map((node) => ({
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      text: node.text,
    }));
}
