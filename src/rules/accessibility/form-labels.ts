import { z } from 'zod';
import type { AnalyzedFile, ElementFact } from '../../languages/model/types.js';
import { defineRule } from '../define.js';
import { wcag } from '../standards.js';
import { anyAttribute, attribute, onElement, pageElements, tagged } from './jsx.js';

/** Types of `<input>` that are not text the user fills in, or carry their own name (`value`). */
const NOT_A_FIELD = new Set(['hidden', 'submit', 'button', 'reset', 'image']);

const FORM_TAGS = new Set(['input', 'select', 'textarea']);

/** Whether the element is something the user types into or chooses from, and nothing says otherwise. */
function isField(element: ElementFact): boolean {
  // A `hidden` field is not shown (a file input opened from a button), so it needs no label.
  if (!FORM_TAGS.has(element.tag) || element.hasSpread || attribute(element, 'hidden')) {
    return false;
  }
  const type = attribute(element, 'type');
  if (type?.value === 'expression') {
    return false;
  }
  return !NOT_A_FIELD.has(type?.text ?? '');
}

/** What the file's `<label>`s point at: the ids they name, and whether any names one it cannot tell. */
function labelTargets(elements: readonly ElementFact[]) {
  const ids = new Set<string>();
  let unknown = false;
  for (const label of elements.filter((element) => element.tag === 'label')) {
    const target = anyAttribute(label, 'htmlFor', 'for');
    if (target?.value === 'string') {
      ids.add(target.text);
    } else if (target) {
      unknown = true;
    }
  }
  return { ids, unknown };
}

/** Whether something gives the field a name a screen reader can read. */
function isNamed(
  element: ElementFact,
  labels: { readonly ids: ReadonlySet<string>; readonly unknown: boolean },
): boolean {
  if (anyAttribute(element, 'aria-label', 'aria-labelledby', 'title')) {
    return true;
  }
  if (element.ancestors.includes('label')) {
    return true;
  }
  const id = attribute(element, 'id');
  if (id?.value === 'expression') {
    return true; // an id made at run time: a label may point at it from elsewhere
  }
  return id !== undefined && (labels.ids.has(id.text) || labels.unknown);
}

export const unlabeledFormField = defineRule({
  meta: {
    id: 'SC-WEB-004',
    title: 'Form field has no label',
    category: 'accessibility',
    defaultSeverity: 'warning',
    confidence: 'medium',
    heuristic: true,
    standards: [
      wcag('3.3.2', 'Labels or Instructions', 'A', 'labels-or-instructions'),
      wcag('1.3.1', 'Info and Relationships', 'A', 'info-and-relationships'),
      wcag('4.1.2', 'Name, Role, Value', 'A', 'name-role-value'),
    ],
    rationale:
      'A field with no label is announced by a screen reader as "edit text" and nothing more, and clicking its caption does not focus it. A placeholder is not a label: it disappears when the person types and is not read as a name by every screen reader. The check looks inside one file, so a label written in another component is not seen.',
    suggestion: {
      summary:
        'Give the field a `<label htmlFor>` that points at its id, wrap it in a `<label>`, or add `aria-label` (or `aria-labelledby`) when the design has no visible caption.',
      before: '<input type="email" placeholder="Email" />',
      after: '<label htmlFor="email">Email</label>\n<input id="email" type="email" />',
    },
  },
  options: z.strictObject({}),
  check(file: AnalyzedFile) {
    const elements = pageElements(file);
    const labels = labelTargets(elements);
    return elements
      .filter((element) => isField(element) && !isNamed(element, labels))
      .map((element) =>
        onElement(
          element,
          `${tagged(element)} has no label: no aria-label, no <label> around it, and no <label htmlFor> for its id.`,
          tagged(element),
        ),
      );
  },
});
