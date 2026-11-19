import { z } from 'zod';
import type { ElementFact } from '../../languages/model/types.js';
import { defineRule } from '../define.js';
import { wcag } from '../standards.js';
import { anyAttribute, attribute, isEmpty, onElement, pageElements, tagged } from './jsx.js';

/** Elements that mean nothing to a keyboard or a screen reader until they are given a role. */
const STATIC_TAGS = new Set([
  'div',
  'span',
  'p',
  'li',
  'ul',
  'ol',
  'section',
  'article',
  'header',
  'footer',
  'aside',
  'main',
  'td',
  'tr',
  'table',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'img',
  'svg',
]);

/** Roles that say "you can operate this", so the element must also be focusable and keyboard-operable. */
const OPERABLE_ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'radio',
  'switch',
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'treeitem',
  'textbox',
  'combobox',
  'slider',
  'spinbutton',
]);

const KEY_HANDLERS = ['onKeyDown', 'onKeyUp', 'onKeyPress'] as const;

/**
 * A handler that is not an action: `e.stopPropagation()` keeps a click from reaching what is behind,
 * and `ref.current.focus()` hands a click on the area around a field to the field, which has its
 * own keyboard support.
 */
const isGuard = (text: string): boolean => /stopPropagation|preventDefault|\.focus\(/.test(text);

/** What is wrong with a clickable static element, if anything. */
function problem(element: ElementFact): string | undefined {
  const role = attribute(element, 'role')?.text ?? '';
  if (role !== '' && !OPERABLE_ROLES.has(role)) {
    return undefined;
  }
  if (role === '') {
    return ' but no role, so a screen reader does not announce it as something to operate and the keyboard cannot reach it';
  }
  const focusable = attribute(element, 'tabIndex') !== undefined;
  const keyboard = anyAttribute(element, ...KEY_HANDLERS) !== undefined;
  if (focusable && keyboard) {
    return undefined;
  }
  const missing = focusable
    ? 'no key handler, so a keyboard cannot operate it'
    : keyboard
      ? 'no tabIndex, so a keyboard cannot reach it'
      : 'no tabIndex and no key handler, so a keyboard can neither reach nor operate it';
  return ` and role="${role}", but ${missing}`;
}

export const clickOnStaticElement = defineRule({
  meta: {
    id: 'SC-WEB-002',
    title: 'Click handler on an element a keyboard cannot use',
    category: 'accessibility',
    defaultSeverity: 'warning',
    confidence: 'medium',
    heuristic: true,
    standards: [
      wcag('2.1.1', 'Keyboard', 'A', 'keyboard'),
      wcag('4.1.2', 'Name, Role, Value', 'A', 'name-role-value'),
    ],
    rationale:
      'A `div` or `span` with an onClick works with a mouse and nothing else: it cannot be reached with Tab, cannot be activated with Enter or Space, and a screen reader does not say it is clickable. People who use a keyboard, a switch, or a screen reader cannot do what it does. A real `<button>` has all of this built in.',
    suggestion: {
      summary:
        'Use a `<button>` (or `<a href>` for navigation) and style it. If it must stay a `div`, give it a role, `tabIndex={0}`, and a key handler for Enter and Space.',
      before: '<div className="close" onClick={close}>x</div>',
      after:
        '<button type="button" className="close" onClick={close} aria-label="Close">x</button>',
    },
  },
  options: z.strictObject({}),
  check(file) {
    return pageElements(file).flatMap((element) => {
      const click = attribute(element, 'onClick');
      if (!STATIC_TAGS.has(element.tag) || !click || element.hasSpread || isGuard(click.text)) {
        return [];
      }
      // An element with nothing in it is not a control: it is an overlay that closes a dialog when
      // clicked, and the dialog closes from the keyboard another way (Escape).
      if (isEmpty(element)) {
        return [];
      }
      const reason = problem(element);
      return reason === undefined
        ? []
        : [
            onElement(
              element,
              `${tagged(element)} has an onClick handler${reason}.`,
              tagged(element),
            ),
          ];
    });
  },
});
