import { z } from 'zod';
import type { ElementFact } from '../../languages/model/types.js';
import { defineRule } from '../define.js';
import { importsModule } from '../security/shared.js';
import { wcag } from '../standards.js';
import { attribute, onElement, pageElements, tagged } from './jsx.js';

/** `<img>`, `<input type="image">`, and Next.js's `<Image>`, the elements that show a picture. */
function showsImage(element: ElementFact, nextImage: boolean): boolean {
  if (element.tag === 'img') {
    return true;
  }
  if (element.tag === 'Image') {
    return nextImage;
  }
  return element.tag === 'input' && attribute(element, 'type')?.text === 'image';
}

export const imageWithoutAlt = defineRule({
  meta: {
    id: 'SC-WEB-001',
    title: 'Image has no alt attribute',
    category: 'accessibility',
    defaultSeverity: 'warning',
    confidence: 'high',
    heuristic: false,
    standards: [wcag('1.1.1', 'Non-text Content', 'A', 'non-text-content')],
    rationale:
      'A screen reader announces an image by its alt text. Without the attribute it reads the file name, or skips the image, and a person who cannot see it does not know what it shows. A picture that adds nothing (a flourish, an icon next to text that says the same) is marked with an empty alt (`alt=""`), which tells the reader to skip it on purpose.',
    suggestion: {
      summary:
        'Add an alt attribute that says what the image shows or does, or `alt=""` if it is decoration.',
      before: '<img src="/chart.png" />',
      after: '<img src="/chart.png" alt="Sales by month, rising from 12 to 40 units" />',
    },
  },
  options: z.strictObject({}),
  check(file) {
    const nextImage = importsModule(file, 'next/image');
    return pageElements(file)
      .filter((element) => showsImage(element, nextImage))
      .filter((element) => !element.hasSpread && attribute(element, 'alt') === undefined)
      .map((element) =>
        onElement(element, `${tagged(element)} has no alt attribute.`, tagged(element)),
      );
  },
});
