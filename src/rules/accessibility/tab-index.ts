import { z } from 'zod';
import { defineRule } from '../define.js';
import { wcag } from '../standards.js';
import { attribute, onElement, pageElements, tagged } from './jsx.js';

export const positiveTabIndex = defineRule({
  meta: {
    id: 'SC-WEB-003',
    title: 'tabIndex above zero changes the tab order',
    category: 'accessibility',
    defaultSeverity: 'warning',
    confidence: 'high',
    heuristic: false,
    standards: [wcag('2.4.3', 'Focus Order', 'A', 'focus-order')],
    rationale:
      'A tabIndex above 0 pulls an element to the front of the tab order, ahead of everything with 0 or none, in the order of the numbers. The page then tabs in an order that no longer follows what is on the screen, and every element added later has to be numbered around the others.',
    suggestion: {
      summary:
        'Use `tabIndex={0}` to make an element focusable in its place in the page, `tabIndex={-1}` to focus it from code, and put the elements in the DOM in the order they should be reached.',
      before: '<input tabIndex={3} />',
      after: '<input />',
    },
  },
  options: z.strictObject({}),
  check(file) {
    return pageElements(file).flatMap((element) => {
      const index = attribute(element, 'tabIndex');
      const written = index?.value === 'number' || index?.value === 'string' ? index.text : '';
      return Number(written) > 0
        ? [
            onElement(
              element,
              `${tagged(element)} has tabIndex ${written}: a value above 0 takes the element out of the page's natural order.`,
              tagged(element),
            ),
          ]
        : [];
    });
  },
});
