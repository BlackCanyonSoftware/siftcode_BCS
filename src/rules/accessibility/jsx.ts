import type { AnalyzedFile, AttributeFact, ElementFact } from '../../languages/model/types.js';
import { isTestFile, isVendored } from '../shared.js';

/** The attribute `name` of an element, if it is written (JSX names are case-sensitive: `tabIndex`). */
export const attribute = (element: ElementFact, name: string): AttributeFact | undefined =>
  element.attributes.find((candidate) => candidate.name === name);

/** The first of `names` that the element has. */
export const anyAttribute = (
  element: ElementFact,
  ...names: readonly string[]
): AttributeFact | undefined =>
  element.attributes.find((candidate) => names.includes(candidate.name));

/** Test code, Storybook stories, and vendored code are left alone. */
const STORY = /\.stories\.[a-z]+$/i;

/** The elements of a file that these rules look at: none in test code, stories, or vendored code. */
export function pageElements(file: AnalyzedFile): readonly ElementFact[] {
  const out = isTestFile(file.path) || isVendored(file.path) || STORY.test(file.path);
  return out ? [] : file.facts.elements;
}

/** A hit on one element, at its opening tag. */
export function onElement(element: ElementFact, message: string, key: string) {
  return { startLine: element.line, endLine: element.line, message, key };
}

/** `<img>` as written in a message. */
export const tagged = (element: ElementFact): string => `<${element.tag}>`;

/** Nothing inside: no text, no `{...}`, no child element (an icon may carry the name). */
export const isEmpty = ({ children }: ElementFact): boolean =>
  !children.text && children.expressions === 0 && children.elements.length === 0;
