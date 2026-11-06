import { describe, expect, it } from 'vitest';
import { scan } from '../../src/core/scan.js';
import { loadCatalog, type Catalog } from '../../src/rules/licenses/catalog.js';
import { onlyRule, useProjects } from '../helpers/project.js';

const projects = useProjects();

const catalog: Catalog = await loadCatalog();

/** The SPDX text of a license, with the copyright placeholders filled in. */
function licenseText(id: string, holder = 'Ada Lovelace'): string {
  const text = catalog.texts.get(id);
  if (text === undefined) {
    throw new Error(`no text for ${id}`);
  }
  return text.replace('<year>', '2026').replace('<copyright holders>', holder);
}

const CODE = { 'src/app.ts': 'export const answer = 42;\n' };
const manifest = (fields: Record<string, unknown>): Record<string, string> => ({
  'package.json': JSON.stringify({ name: 'demo', ...fields }),
});

/** Scans a Git-repository-shaped project with only rule `id` switched on. */
async function findingsFor(id: string, files: Record<string, string>, git = true) {
  const folder = await projects.create({
    ...CODE,
    ...files,
    ...(git ? { '.git/HEAD': 'ref: refs/heads/main\n' } : {}),
  });
  return (await scan(folder, { config: onlyRule(id) })).findings;
}

const NOT_ADVICE = 'not legal advice';

describe('SC-LIC-001 no license (US-035)', () => {
  it('flags a project with code and no license file or declaration, anchored on the README', async () => {
    const findings = await findingsFor('SC-LIC-001', { 'README.md': '# Demo\n' });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ path: 'README.md', severity: 'warning' });
    expect(findings[0]?.message).toContain('no permission');
    expect(findings[0]?.message).toContain(NOT_ADVICE);
  });

  it.each([
    ['a LICENSE file', { LICENSE: licenseText('MIT') }],
    ['a COPYING file', { COPYING: licenseText('GPL-3.0-only') }],
    ['a LICENSE-MIT file', { 'LICENSE-MIT': licenseText('MIT') }],
    ['a REUSE LICENSES folder', { 'LICENSES/MIT.txt': licenseText('MIT') }],
    ['a package.json license', manifest({ license: 'MIT' })],
    ['an old package.json licenses list', manifest({ licenses: [{ type: 'MIT' }] })],
    ['a pyproject license', { 'pyproject.toml': '[project]\nname = "demo"\nlicense = "MIT"\n' }],
    [
      'a pyproject license table',
      { 'pyproject.toml': '[project]\nname = "demo"\nlicense = { text = "MIT" }\n' },
    ],
    ['a Poetry license', { 'pyproject.toml': '[tool.poetry]\nname = "demo"\nlicense = "MIT"\n' }],
    [
      'a .csproj license expression',
      {
        'App.csproj':
          '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><PackageLicenseExpression>MIT</PackageLicenseExpression></PropertyGroup></Project>',
      },
    ],
    ['a deliberate UNLICENSED', manifest({ license: 'UNLICENSED' })],
  ])('accepts %s', async (_label, files) => {
    expect(await findingsFor('SC-LIC-001', files)).toEqual([]);
  });

  it('does not take a source file named license-checker.js for a license', async () => {
    const findings = await findingsFor('SC-LIC-001', {
      'license-checker.js': 'module.exports = 1;\n',
    });

    expect(findings).toHaveLength(1);
  });

  it('stays quiet outside a Git repository root', async () => {
    expect(await findingsFor('SC-LIC-001', {}, false)).toEqual([]);
  });
});

describe('SC-LIC-002 license file is not a standard text (US-035)', () => {
  it('accepts standard texts, and a project with several license files', async () => {
    const findings = await findingsFor('SC-LIC-002', {
      'LICENSE-MIT': licenseText('MIT'),
      'LICENSE-APACHE': licenseText('Apache-2.0'),
    });

    expect(findings).toEqual([]);
  });

  it('reports a standard license with a clause added as modified, naming the license', async () => {
    const modified = `${licenseText('MIT')}\n\nUse of the Software for any commercial purpose, including offering it as a paid hosted service, requires a separate written agreement with the copyright holders.`;

    const findings = await findingsFor('SC-LIC-002', { LICENSE: modified });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ path: 'LICENSE', severity: 'info' });
    expect(findings[0]?.message).toContain('MIT');
    expect(findings[0]?.message).toContain('% similar');
  });

  it('reports text that is not a known license as unrecognized', async () => {
    const findings = await findingsFor('SC-LIC-002', {
      LICENSE:
        'You may use this project for free at home. Ask first before using it at work or selling anything made with it. These terms might change later without any notice to you.',
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('not a license text SiftCode recognizes');
  });
});

describe('SC-LIC-003 declared license (US-035, US-036)', () => {
  it('accepts a declaration that agrees with the license file', async () => {
    const findings = await findingsFor('SC-LIC-003', {
      LICENSE: licenseText('MIT'),
      ...manifest({ license: 'MIT' }),
    });

    expect(findings).toEqual([]);
  });

  it('treats GPL-3.0-only and GPL-3.0-or-later as the same text', async () => {
    const findings = await findingsFor('SC-LIC-003', {
      COPYING: licenseText('GPL-3.0-only'),
      ...manifest({ license: 'GPL-3.0-or-later' }),
    });

    expect(findings).toEqual([]);
  });

  it('flags a declaration that names a different license than the file', async () => {
    const findings = await findingsFor('SC-LIC-003', {
      LICENSE: licenseText('MIT'),
      ...manifest({ license: 'Apache-2.0' }),
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ path: 'package.json', severity: 'warning' });
    expect(findings[0]?.message).toContain('no license file contains Apache-2.0');
    expect(findings[0]?.message).toContain('also contain MIT');
  });

  it('flags a dual declaration when one of the two texts is missing', async () => {
    const findings = await findingsFor('SC-LIC-003', {
      LICENSE: licenseText('MIT'),
      ...manifest({ license: 'MIT OR Apache-2.0' }),
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('no license file contains Apache-2.0');
  });

  it('flags a pyproject license that disagrees, and a package marked UNLICENSED beside an MIT file', async () => {
    const python = await findingsFor('SC-LIC-003', {
      LICENSE: licenseText('MIT'),
      'pyproject.toml': '[project]\nname = "demo"\nlicense = "BSD-3-Clause"\n',
    });
    const proprietary = await findingsFor('SC-LIC-003', {
      LICENSE: licenseText('MIT'),
      ...manifest({ license: 'UNLICENSED' }),
    });

    expect(python.map((f) => f.path)).toEqual(['pyproject.toml']);
    expect(proprietary).toHaveLength(1);
  });

  it('reports a declaration that is not an SPDX expression, at info level', async () => {
    const findings = await findingsFor('SC-LIC-003', {
      LICENSE: licenseText('MIT'),
      ...manifest({ license: 'MIT License' }),
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'info' });
    expect(findings[0]?.message).toContain('not a valid SPDX expression');
  });

  it('reports an id that is not on the SPDX list, but accepts LicenseRef and SEE LICENSE IN', async () => {
    const unknown = await findingsFor('SC-LIC-003', manifest({ license: 'Frobnicate-1.0' }));
    const fine = await findingsFor(
      'SC-LIC-003',
      [
        manifest({ license: 'LicenseRef-Custom' }),
        manifest({ license: 'SEE LICENSE IN LICENSE.md' }),
      ].reduce((all, one) => ({ ...all, ...one }), {}),
    );

    expect(unknown).toHaveLength(1);
    expect(unknown[0]?.message).toContain('not on the SPDX license list');
    expect(fine).toEqual([]);
  });
});

describe('SC-LIC-004 copyright holder and placeholders (US-036)', () => {
  it('flags a license file with unfilled template placeholders', async () => {
    const findings = await findingsFor('SC-LIC-004', {
      LICENSE: licenseText('MIT')
        .replace('2026', '<year>')
        .replace('Ada Lovelace', '<copyright holders>'),
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ path: 'LICENSE', severity: 'warning' });
    expect(findings[0]?.message).toContain('placeholder');
  });

  it('flags an MIT-style license with no copyright line, at info level', async () => {
    const findings = await findingsFor('SC-LIC-004', {
      LICENSE: licenseText('MIT').replace(/Copyright.*\n/, ''),
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'info' });
    expect(findings[0]?.message).toContain('no copyright line');
  });

  it('accepts a filled-in license, and the unmodified Apache text with its appendix placeholders', async () => {
    const findings = await findingsFor('SC-LIC-004', {
      LICENSE: licenseText('MIT'),
      'LICENSE-APACHE': licenseText('Apache-2.0'),
      COPYING: licenseText('GPL-3.0-only'),
    });

    expect(findings).toEqual([]);
  });
});

describe('SC-LIC-005 bundled code under another license (US-036)', () => {
  const project = { LICENSE: licenseText('MIT'), ...manifest({ license: 'MIT' }) };
  const bundled = { 'vendor/widget/LICENSE': licenseText('BSD-3-Clause', 'Widget Authors') };

  it('flags a bundled license that nothing at the top of the project mentions', async () => {
    const findings = await findingsFor('SC-LIC-005', { ...project, ...bundled });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ path: 'vendor/widget/LICENSE', severity: 'warning' });
    expect(findings[0]?.message).toContain('BSD-3-Clause');
  });

  it('accepts it once a NOTICE, THIRD_PARTY, or README mentions the folder', async () => {
    for (const doc of ['NOTICE', 'THIRD_PARTY.md', 'README.md']) {
      const findings = await findingsFor('SC-LIC-005', {
        ...project,
        ...bundled,
        [doc]: 'Bundled: vendor/widget (BSD-3-Clause)\n',
      });

      expect(findings).toEqual([]);
    }
  });

  it('accepts a nested license that is the project’s own license, as in a monorepo', async () => {
    const findings = await findingsFor('SC-LIC-005', {
      ...project,
      'packages/a/LICENSE': licenseText('MIT'),
    });

    expect(findings).toEqual([]);
  });

  it('mentions a NOTICE file that has to be carried over', async () => {
    const findings = await findingsFor('SC-LIC-005', {
      ...project,
      'vendor/lib/LICENSE': licenseText('Apache-2.0'),
      'vendor/lib/NOTICE': 'Lib\nCopyright 2020 Lib Authors\n',
    });

    expect(findings[0]?.message).toContain('NOTICE file that must be carried over');
  });

  it('ignores license files inside test folders', async () => {
    const findings = await findingsFor('SC-LIC-005', {
      ...project,
      'test/fixtures/sample/LICENSE': licenseText('GPL-3.0-only'),
    });

    expect(findings).toEqual([]);
  });
});

describe('SC-LIC-006 SPDX headers (US-036)', () => {
  const header = (id: string, comment = '//') => `${comment} SPDX-License-Identifier: ${id}\n`;
  const project = { LICENSE: licenseText('MIT'), ...manifest({ license: 'MIT' }) };

  it('stays quiet when no file has a header, or all files carry the project license', async () => {
    const none = await findingsFor('SC-LIC-006', project);
    const all = await findingsFor('SC-LIC-006', {
      ...project,
      'src/app.ts': `${header('MIT')}export const a = 1;\n`,
      'src/b.ts': `/* SPDX-License-Identifier: MIT */\nexport const b = 1;\n`,
      'lib/c.py': header('MIT', '#'),
    });

    expect([none, all]).toEqual([[], []]);
  });

  it('flags files tagged with a license other than the project’s', async () => {
    const findings = await findingsFor('SC-LIC-006', {
      ...project,
      'src/app.ts': `${header('MIT')}export const a = 1;\n`,
      'src/ported.ts': `${header('GPL-3.0-only')}export const b = 1;\n`,
      'src/ported2.ts': `${header('GPL-3.0-only')}export const c = 1;\n`,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'warning' });
    expect(findings[0]?.message).toContain('2 source files are tagged "GPL-3.0-only"');
  });

  it('accepts an expression that stays within the project license family', async () => {
    const findings = await findingsFor('SC-LIC-006', {
      ...project,
      'src/app.ts': `${header('MIT OR MIT')}export const a = 1;\n`,
    });

    expect(findings).toEqual([]);
  });

  it('reports untagged files among tagged ones at info level', async () => {
    const findings = await findingsFor('SC-LIC-006', {
      ...project,
      'src/app.ts': `${header('MIT')}export const a = 1;\n`,
      'src/b.ts': `${header('MIT')}export const b = 1;\n`,
      'src/c.ts': 'export const c = 1;\n',
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ path: 'src/c.ts', severity: 'info' });
    expect(findings[0]?.message).toContain('1 of 3 source files');
  });
});

describe('proprietary license files (US-035)', () => {
  const proprietary =
    'Copyright (c) 2026 Black Canyon Software. All rights reserved.\n\nThis software is proprietary. No licence is granted to use, copy, modify, merge, publish, distribute, sublicense or sell the Work, or to create derivative works from it, except with the prior written permission of the owner. The source is visible so that it can be read; visibility is not permission.';

  it('does not call an all-rights-reserved notice unrecognized, and does not ask for a license', async () => {
    const unrecognized = await findingsFor('SC-LIC-002', { LICENSE: proprietary });
    const none = await findingsFor('SC-LIC-001', { LICENSE: proprietary });

    expect([unrecognized, none]).toEqual([[], []]);
  });

  it('agrees with a manifest that says UNLICENSED, and disagrees with one that says MIT', async () => {
    const agrees = await findingsFor('SC-LIC-003', {
      LICENSE: proprietary,
      ...manifest({ license: 'UNLICENSED' }),
    });
    const disagrees = await findingsFor('SC-LIC-003', {
      LICENSE: proprietary,
      ...manifest({ license: 'MIT' }),
    });

    expect(agrees).toEqual([]);
    expect(disagrees).toHaveLength(1);
    expect(disagrees[0]?.message).toContain('all-rights-reserved notice');
  });

  it('does not read a pyproject license = { file = "LICENSE" } as a license name', async () => {
    const findings = await findingsFor('SC-LIC-003', {
      LICENSE: licenseText('MIT'),
      'pyproject.toml': '[project]\nname = "demo"\nlicense = { file = "LICENSE" }\n',
    });

    expect(findings).toEqual([]);
  });
});
