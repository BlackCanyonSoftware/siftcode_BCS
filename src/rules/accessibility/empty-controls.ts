import { z } from 'zod';
import type { ElementFact } from '../../languages/model/types.js';
import { defineRule } from '../define.js';
import { wcag } from '../standards.js';
import { anyAttribute, attribute, isEmpty, onElement, pageElements, tagged } from './jsx.js';

/** A button, or a link that goes somewhere. */
const isControl = (element: ElementFact): boolean =>
  element.tag === 'button' || (element.tag === 'a' && attribute(element, 'href') !== undefined);

export const emptyControl = defineRule({
  meta: {
    id: 'SC-WEB-005',
    title: 'Button or link has no text',
    category: 'accessibility',
    defaultSeverity: 'warning',
    confidence: 'high',
    heuristic: false,
    standards: [
      wcag('4.1.2', 'Name, Role, Value', 'A', 'name-role-value'),
      wcag('2.4.4', 'Link Purpose (In Context)', 'A', 'link-purpose-in-context'),
    ],
    rationale:
      'A button or link with nothing inside and no aria-label is announced as "button" or "link" and nothing else, so a person using a screen reader does not know what it does. Icon-only controls need a name that is not drawn.',
    suggestion: {
      summary:
        'Put text inside, or add `aria-label` (or `aria-labelledby`, or `title`) that says what the control does.',
      before: '<button onClick={close}></button>',
      after: '<button onClick={close} aria-label="Close dialog"></button>',
    },
  },
  options: z.strictObject({}),
  check(file) {
    return pageElements(file)
      .filter((element) => isControl(element) && isEmpty(element) && !element.hasSpread)
      .filter((element) => !anyAttribute(element, 'aria-label', 'aria-labelledby', 'title'))
      .map((element) =>
        onElement(
          element,
          `${tagged(element)} has nothing inside it and no aria-label, so it has no name.`,
          tagged(element),
        ),
      );
  },
});
