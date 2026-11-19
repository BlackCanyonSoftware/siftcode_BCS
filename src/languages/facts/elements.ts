import type { Node } from 'web-tree-sitter';
import type { AttributeFact, ElementFact } from '../model/types.js';
import type { GrammarId } from '../registry.js';

const MAX_TEXT = 80;

/**
 * The JSX elements of a JavaScript, TypeScript, or TSX file, with their attributes and what is
 * inside them. Other languages have none. Only the shape rules need: which tag, which attributes
 * and how they are given, and whether there is content, not the content itself.
 */
export function extractElements(grammar: GrammarId, root: Node): ElementFact[] {
  if (grammar !== 'javascript' && grammar !== 'typescript' && grammar !== 'tsx') {
    return [];
  }
  return root.descendantsOfType(['jsx_opening_element', 'jsx_self_closing_element']).map(describe);
}

const tagOf = (opening: Node): string => opening.childForFieldName('name')?.text ?? '';

function describe(opening: Node): ElementFact {
  const attributes: AttributeFact[] = [];
  let hasSpread = false;
  for (const child of opening.namedChildren) {
    if (child.type === 'jsx_attribute') {
      attributes.push(describeAttribute(child));
    } else if (child.type === 'jsx_expression') {
      hasSpread = true;
    }
  }
  const selfClosing = opening.type === 'jsx_self_closing_element';
  return {
    tag: tagOf(opening),
    line: opening.startPosition.row + 1,
    attributes,
    hasSpread,
    selfClosing,
    children: selfClosing ? EMPTY : childrenOf(opening),
    ancestors: ancestorTags(opening),
  };
}

const EMPTY = { text: false, expressions: 0, elements: [] as readonly string[] };

function describeAttribute(node: Node): AttributeFact {
  const [name, value] = node.namedChildren;
  if (!name) {
    return { name: '', value: 'none', text: '' };
  }
  if (!value) {
    return { name: name.text, value: 'none', text: '' };
  }
  const literal = value.type === 'jsx_expression' ? value.namedChildren[0] : value;
  if (literal?.type === 'string') {
    return { name: name.text, value: 'string', text: literal.text.slice(1, -1).slice(0, MAX_TEXT) };
  }
  if (literal?.type === 'number') {
    return { name: name.text, value: 'number', text: literal.text.slice(0, MAX_TEXT) };
  }
  return { name: name.text, value: 'expression', text: value.text.slice(0, MAX_TEXT) };
}

/** What is between an opening tag and its closing tag: text, `{...}` expressions, and child elements. */
function childrenOf(opening: Node): ElementFact['children'] {
  const element = opening.parent;
  if (element?.type !== 'jsx_element') {
    return EMPTY;
  }
  let text = false;
  let expressions = 0;
  const elements: string[] = [];
  for (const child of element.namedChildren) {
    if (child.type === 'jsx_text') {
      text ||= child.text.trim() !== '';
    } else if (child.type === 'jsx_expression') {
      expressions += 1;
    } else if (child.type === 'jsx_element') {
      elements.push(child.namedChildren[0] ? tagOf(child.namedChildren[0]) : '');
    } else if (child.type === 'jsx_self_closing_element') {
      elements.push(tagOf(child));
    }
  }
  return { text, expressions, elements };
}

/** The tags of the elements this one is inside, nearest first. */
function ancestorTags(opening: Node): string[] {
  const tags: string[] = [];
  // An opening tag is the first child of its own element, which is not one of its ancestors.
  const start = opening.type === 'jsx_opening_element' ? opening.parent?.parent : opening.parent;
  for (let node = start; node; node = node.parent) {
    if (node.type === 'jsx_element' && node.namedChildren[0]) {
      tags.push(tagOf(node.namedChildren[0]));
    }
  }
  return tags;
}
