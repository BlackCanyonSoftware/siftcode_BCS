import { z } from 'zod';
import { defineRule } from '../define.js';
import { wcag } from '../standards.js';
import { attribute, onElement, pageElements } from './jsx.js';

export const documentWithoutLanguage = defineRule({
  meta: {
    id: 'SC-WEB-006',
    title: 'Page has no language',
    category: 'accessibility',
    defaultSeverity: 'warning',
    confidence: 'high',
    heuristic: false,
    standards: [wcag('3.1.1', 'Language of Page', 'A', 'language-of-page')],
    rationale:
      'A screen reader picks the voice and the pronunciation rules from the page language. Without `lang` on the html element it reads the page in whatever language the reader is set to, which turns most text into noise for a person who needs the right one.',
    suggestion: {
      summary: 'Add `lang` to the html element, with the language of the page.',
      before: '<html>',
      after: '<html lang="en">',
    },
  },
  options: z.strictObject({}),
  check(file) {
    return pageElements(file)
      .filter((element) => element.tag === 'html' && !element.hasSpread)
      .filter((element) => attribute(element, 'lang') === undefined)
      .map((element) => onElement(element, '<html> has no lang attribute.', '<html>'));
  },
});
