import { beforeAll, describe, expect, it } from 'vitest';
import { loadCatalog, type Catalog } from '../../src/rules/licenses/catalog.js';
import { identifyLicenseText } from '../../src/rules/licenses/identify.js';
import {
  formatExpression,
  licensesIn,
  parseExpression,
  type Expression,
} from '../../src/rules/licenses/spdx.js';

let catalog: Catalog;
beforeAll(async () => {
  catalog = await loadCatalog();
});

function parsed(text: string): Expression {
  const result = parseExpression(text, catalog);
  if (!result.ok) {
    throw new Error(`"${text}" did not parse: ${result.reason}`);
  }
  return result.expression;
}

const text = (id: string): string => {
  const found = catalog.texts.get(id);
  if (found === undefined) {
    throw new Error(`no text for ${id}`);
  }
  return found;
};

describe('bundled SPDX data (US-035)', () => {
  it('lists the SPDX licenses, including deprecated ids, and says where they came from', () => {
    expect(catalog.source).toMatch(/^spdx-license-list \d+\.\d+\.\d+$/);
    expect(catalog.entries.size).toBeGreaterThan(600);
    expect(catalog.entries.get('mit')).toMatchObject({ id: 'MIT', osi: true });
    expect(catalog.entries.get('gpl-2.0')?.id).toBe('GPL-2.0');
  });

  it('has the text of every license the compatibility rules know by name', () => {
    for (const id of [
      'MIT',
      'Apache-2.0',
      'GPL-2.0-only',
      'GPL-3.0-only',
      'AGPL-3.0-only',
      'MPL-2.0',
    ]) {
      expect(catalog.texts.has(id)).toBe(true);
    }
  });
});

describe('SPDX license expressions (US-035, US-037)', () => {
  it('parses a single license, with its official letter case', () => {
    expect(parsed('mit')).toEqual({ kind: 'license', id: 'MIT', known: true });
    expect(parsed('Apache-2.0')).toEqual({ kind: 'license', id: 'Apache-2.0', known: true });
  });

  it('gives AND higher precedence than OR, and honors parentheses', () => {
    expect(formatExpression(parsed('MIT OR Apache-2.0 AND ISC'))).toBe('MIT OR Apache-2.0 AND ISC');
    expect(parsed('MIT OR Apache-2.0 AND ISC')).toMatchObject({
      kind: 'or',
      right: { kind: 'and' },
    });
    expect(parsed('(MIT OR Apache-2.0) AND ISC')).toMatchObject({
      kind: 'and',
      left: { kind: 'or' },
    });
    expect(formatExpression(parsed('(MIT OR Apache-2.0) AND ISC'))).toBe(
      '(MIT OR Apache-2.0) AND ISC',
    );
  });

  it('maps deprecated ids and the + suffix to current ids', () => {
    expect(licensesIn(parsed('GPL-2.0')).map((l) => l.id)).toEqual(['GPL-2.0-only']);
    expect(licensesIn(parsed('GPL-2.0+')).map((l) => l.id)).toEqual(['GPL-2.0-or-later']);
    expect(licensesIn(parsed('LGPL-2.1 OR AGPL-3.0+')).map((l) => l.id)).toEqual([
      'LGPL-2.1-only',
      'AGPL-3.0-or-later',
    ]);
  });

  it('keeps a WITH exception on its license', () => {
    expect(parsed('GPL-2.0-only WITH Classpath-exception-2.0')).toEqual({
      kind: 'license',
      id: 'GPL-2.0-only',
      known: true,
      exception: 'Classpath-exception-2.0',
    });
  });

  it('marks an id that is not on the SPDX list, and a LicenseRef, as not known', () => {
    expect(parsed('Frobnicate-1.0')).toMatchObject({ known: false });
    expect(parsed('LicenseRef-Custom')).toMatchObject({ id: 'LicenseRef-Custom', known: false });
  });

  it.each([
    ['', 'empty'],
    ['MIT License', 'free text'],
    ['Apache 2.0', 'free text'],
    ['MIT or Apache-2.0', 'a lower-case operator'],
    ['(MIT', 'an unclosed parenthesis'],
    ['MIT AND', 'a missing operand'],
    ['MIT WITH', 'a missing exception'],
    ['MIT) OR ISC', 'a stray parenthesis'],
  ])('reports "%s" (%s) as not valid, instead of guessing', (input) => {
    expect(parseExpression(input, catalog).ok).toBe(false);
  });
});

describe('license text identification (US-035)', () => {
  it.each([...catalog_ids()])('recognizes the SPDX text of %s as itself, word for word', (id) => {
    const result = identifyLicenseText(text(id), catalog);

    expect(result).toMatchObject({ kind: 'match', verbatim: true });
    expect(result.kind === 'match' && result.ids).toContain(id);
  });

  it('ignores the copyright line, spacing, and a title', () => {
    const mit = text('MIT')
      .replace(/^MIT License\s*/i, 'The MIT License (MIT)\n\n')
      .replace(/Copyright.*\n/, 'Copyright (c) 2019 Ada Lovelace and contributors\n')
      .replace(/\n/g, '\r\n  ');

    expect(identifyLicenseText(mit, catalog)).toMatchObject({
      kind: 'match',
      ids: ['MIT'],
      verbatim: true,
    });
  });

  it('accepts the Apache License without its optional appendix', () => {
    const apache = text('Apache-2.0');
    const withoutAppendix = apache.slice(0, apache.indexOf('APPENDIX'));

    expect(identifyLicenseText(withoutAppendix, catalog)).toMatchObject({
      kind: 'match',
      ids: ['Apache-2.0'],
    });
  });

  it('tells GPL-2.0 from GPL-3.0, and reports licenses with identical text together', () => {
    const gpl3 = identifyLicenseText(text('GPL-3.0-only'), catalog);

    expect(identifyLicenseText(text('GPL-2.0-only'), catalog)).toMatchObject({
      ids: expect.arrayContaining(['GPL-2.0-only']) as string[],
    });
    expect(gpl3.kind === 'match' && gpl3.ids).toEqual(['GPL-3.0-only', 'GPL-3.0-or-later']);
    expect(identifyLicenseText(text('MIT-0'), catalog)).toMatchObject({ ids: ['MIT-0'] });
  });

  it('reports a license with a clause added as a modified version', () => {
    const modified = `${text('MIT')}\n\nUse of the Software for any commercial purpose, including offering it as a paid hosted service, requires a separate written agreement with the copyright holders.`;

    expect(identifyLicenseText(modified, catalog)).toMatchObject({
      kind: 'modified',
      ids: ['MIT'],
    });
  });

  it('reports a file with several full licenses as multiple', () => {
    const both = `${text('MIT')}\n\n----\n\n${text('Apache-2.0')}`;

    expect(identifyLicenseText(both, catalog)).toMatchObject({
      kind: 'multiple',
      ids: expect.arrayContaining(['Apache-2.0', 'MIT']) as string[],
    });
  });

  it.each([
    [
      'ordinary prose',
      'This project is free for personal use. Ask the author before using it at work or selling anything made with it. We might change these terms later without telling anybody about it.',
    ],
    ['a one-line name', 'MIT'],
    ['an empty file', ''],
  ])('does not recognize %s', (_label, input) => {
    expect(identifyLicenseText(input, catalog)).toEqual({ kind: 'unrecognized' });
  });
});

/** The ids of the bundled texts, read synchronously from the same JSON the catalog loads. */
function catalog_ids(): string[] {
  return [
    'MIT',
    'Apache-2.0',
    'BSD-2-Clause',
    'BSD-3-Clause',
    'ISC',
    'MPL-2.0',
    'GPL-2.0-only',
    'LGPL-2.1-only',
    'AGPL-3.0-only',
    'Unlicense',
    'CC0-1.0',
    '0BSD',
    'Zlib',
    'BSL-1.0',
    'SSPL-1.0',
    'BUSL-1.1',
  ];
}

describe('license files that hold more than one thing (US-035)', () => {
  it('reports a standard license followed by extra terms as multiple, naming the standard one', () => {
    const brandTerms = [
      'The logos, wordmarks and artwork in the brand folder are not covered by the license above.',
      'They may be shown to refer to the project but may not be modified, sold, or used to suggest that a product or a service is endorsed by the authors.',
      'Every use of a mark requires the written permission of its owner, and permission for one use is not permission for another.',
      'Anyone who receives a copy of the project receives these marks only for the purpose of using the project itself and for no other purpose at all.',
      'The owners may withdraw permission at any time by writing to the address in the repository, after which every further use must stop at once.',
      'Nothing in these terms transfers ownership of a mark, and nothing in them limits the rights the law gives the owners of the marks.',
    ].join(' ');
    const mixed = `${text('MIT')}\n\nBRAND ASSETS\n\n${brandTerms}`;

    expect(identifyLicenseText(mixed, catalog)).toEqual({ kind: 'multiple', ids: ['MIT'] });
  });
});
