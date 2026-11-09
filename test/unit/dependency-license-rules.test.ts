import { describe, expect, it } from 'vitest';
import { scan } from '../../src/core/scan.js';
import { loadCatalog } from '../../src/rules/licenses/catalog.js';
import { onlyRule, useProjects } from '../helpers/project.js';

const projects = useProjects();
const catalog = await loadCatalog();

const MIT_TEXT = (catalog.texts.get('MIT') ?? '')
  .replace('<year>', '2026')
  .replace('<copyright holders>', 'Ada Lovelace');

const CODE = { 'src/app.ts': 'export const answer = 42;\n' };

/** A project licensed under `license`, with the given extra files. */
const project = (
  license: string,
  deps: Record<string, string>,
  extra: Record<string, string> = {},
) => ({
  ...CODE,
  LICENSE: MIT_TEXT,
  'package.json': JSON.stringify({ name: 'demo', license, dependencies: deps }),
  ...extra,
});

const packageJson = (license: unknown) =>
  JSON.stringify({ name: 'dep', version: '1.0.0', license });

async function findingsFor(id: string, files: Record<string, string>) {
  const folder = await projects.create(files);
  return (await scan(folder, { config: onlyRule(id) })).findings;
}

/** A package-lock.json (version 3) listing the given packages. */
function lockfile(packages: Record<string, Record<string, unknown>>): string {
  return JSON.stringify({
    name: 'demo',
    lockfileVersion: 3,
    packages: { '': { name: 'demo' }, ...packages },
  });
}

describe('SC-LIC-007 npm dependencies (US-037)', () => {
  it('reads licenses from the lockfile, skips development packages, and flags a copyleft one', async () => {
    const findings = await findingsFor(
      'SC-LIC-007',
      project(
        'MIT',
        { a: '1.0.0', b: '1.0.0' },
        {
          'package-lock.json': lockfile({
            'node_modules/a': { version: '1.0.0', license: 'MIT' },
            'node_modules/b': { version: '2.1.0', license: 'GPL-3.0-only' },
            'node_modules/tool': { version: '1.0.0', license: 'GPL-3.0-only', dev: true },
          }),
        },
      ),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ path: 'package.json', severity: 'warning' });
    expect(findings[0]?.message).toContain('b 2.1.0 is licensed GPL-3.0-only');
    expect(findings[0]?.message).toContain('strong copyleft');
    expect(findings[0]?.message).toContain('https://www.gnu.org/licenses/');
  });

  it('falls back to the installed package when the lockfile has no license field', async () => {
    const findings = await findingsFor(
      'SC-LIC-007',
      project(
        'MIT',
        { a: '1.0.0' },
        {
          'package-lock.json': lockfile({ 'node_modules/a': { version: '1.0.0' } }),
          'node_modules/a/package.json': packageJson('AGPL-3.0-only'),
        },
      ),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('network');
  });

  it('reads installed packages of the direct dependencies when there is no lockfile', async () => {
    const findings = await findingsFor(
      'SC-LIC-007',
      project(
        'Apache-2.0',
        { left: '1.0.0', right: '1.0.0' },
        {
          'node_modules/left/package.json': packageJson('MIT'),
          'node_modules/right/package.json': packageJson('SSPL-1.0'),
        },
      ),
    );

    expect(findings.map((f) => f.message.split(' ')[0])).toEqual(['right']);
    expect(findings[0]?.message).toContain('not an open-source license');
  });

  it('accepts a dependency under "MIT OR GPL-3.0-only", and reports only the weak-copyleft note for LGPL', async () => {
    const findings = await findingsFor(
      'SC-LIC-007',
      project(
        'MIT',
        { a: '1.0.0', b: '1.0.0' },
        {
          'package-lock.json': lockfile({
            'node_modules/a': { version: '1.0.0', license: 'MIT OR GPL-3.0-only' },
            'node_modules/b': { version: '1.0.0', license: 'LGPL-3.0-only' },
          }),
        },
      ),
    );

    expect(findings.map((f) => [f.message.split(' ')[0], f.severity])).toEqual([['b', 'info']]);
  });

  it('compares with the project license from the LICENSE file when the manifest declares none', async () => {
    const files = project(
      'MIT',
      { a: '1.0.0' },
      {
        'package-lock.json': lockfile({
          'node_modules/a': { version: '1.0.0', license: 'GPL-3.0-only' },
        }),
      },
    );
    const withoutDeclaration = {
      ...files,
      'package.json': JSON.stringify({ name: 'demo', dependencies: { a: '1.0.0' } }),
    };

    expect(await findingsFor('SC-LIC-007', withoutDeclaration)).toHaveLength(1);
  });

  it('checks a proprietary project against copyleft dependencies', async () => {
    const files = project(
      'UNLICENSED',
      { a: '1.0.0' },
      {
        'package-lock.json': lockfile({
          'node_modules/a': { version: '1.0.0', license: 'GPL-3.0-only' },
        }),
      },
    );
    delete (files as Record<string, string>).LICENSE;

    const findings = await findingsFor('SC-LIC-007', files);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('proprietary project');
  });

  it('only reports a restricted dependency when the project has no license', async () => {
    const noLicense = {
      ...CODE,
      'package.json': JSON.stringify({ name: 'demo', dependencies: { a: '1', b: '1' } }),
      'node_modules/a/package.json': packageJson('GPL-3.0-only'),
      'node_modules/b/package.json': packageJson('BUSL-1.1'),
    };

    const findings = await findingsFor('SC-LIC-007', noLicense);

    expect(findings.map((f) => f.message.split(' ')[0])).toEqual(['b']);
  });
});

describe('SC-LIC-007 Python and .NET dependencies (US-037)', () => {
  const metadata = (fields: string[]) =>
    `Metadata-Version: 2.1\nName: x\n${fields.join('\n')}\n\nDescription body\nLicense: ignored text in the body\n`;

  it('reads installed Python packages and what they require, ignoring extras and dev requirements', async () => {
    const findings = await findingsFor('SC-LIC-007', {
      ...CODE,
      LICENSE: MIT_TEXT,
      'requirements.txt': 'foo>=1\n',
      'requirements-dev.txt': 'pytest\n',
      '.venv/Lib/site-packages/foo-1.0.dist-info/METADATA': metadata([
        'Version: 1.0',
        'License-Expression: MIT',
        'Requires-Dist: bar (>=2)',
        "Requires-Dist: socks ; extra == 'socks'",
      ]),
      '.venv/Lib/site-packages/bar-2.0.dist-info/METADATA': metadata([
        'Version: 2.0',
        'Classifier: License :: OSI Approved :: GNU General Public License v3 (GPLv3)',
      ]),
      '.venv/Lib/site-packages/socks-1.0.dist-info/METADATA': metadata([
        'Version: 1.0',
        'License-Expression: AGPL-3.0-only',
      ]),
      '.venv/Lib/site-packages/pytest-8.0.dist-info/METADATA': metadata([
        'Version: 8.0',
        'License-Expression: AGPL-3.0-only',
      ]),
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.path).toBe('requirements.txt');
    expect(findings[0]?.message).toContain('bar 2.0 is licensed GPL-3.0-only');
  });

  it('finds a virtual environment laid out for Linux and macOS', async () => {
    const findings = await findingsFor('SC-LIC-007', {
      ...CODE,
      LICENSE: MIT_TEXT,
      'requirements.txt': 'Typing_Extensions\n',
      'venv/lib/python3.12/site-packages/typing_extensions-4.9.0.dist-info/METADATA': metadata([
        'License: GPL-3.0-only',
      ]),
    });

    expect(findings).toHaveLength(1);
  });

  it('reads the license expression of restored NuGet packages', async () => {
    const nuspec = (id: string, license: string) =>
      `<package><metadata><id>${id}</id><license type="expression">${license}</license></metadata></package>`;
    const findings = await findingsFor('SC-LIC-007', {
      ...CODE,
      LICENSE: MIT_TEXT,
      'App.csproj':
        '<Project Sdk="Microsoft.NET.Sdk"><ItemGroup><PackageReference Include="Newtonsoft.Json" Version="13.0.3" /><PackageReference Include="Copyleft.Lib" Version="1.0.0" /></ItemGroup></Project>',
      'packages/newtonsoft.json.13.0.3/newtonsoft.json.nuspec': nuspec('Newtonsoft.Json', 'MIT'),
      'packages/copyleft.lib.1.0.0/copyleft.lib.nuspec': nuspec('Copyleft.Lib', 'GPL-3.0-only'),
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('Copyleft.Lib 1.0.0 is licensed GPL-3.0-only');
  });
});

describe('SC-LIC-008 unclear or missing dependency licenses (US-037)', () => {
  it('reports dependencies with no license information as one finding per manifest', async () => {
    const findings = await findingsFor('SC-LIC-008', project('MIT', { a: '1', b: '1', c: '1' }));

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ path: 'package.json', severity: 'info' });
    expect(findings[0]?.message).toContain('3 of 3 runtime dependencies');
    expect(findings[0]?.message).toContain('a, b, c');
  });

  it('does not list development dependencies', async () => {
    const files = project('MIT', {});
    const findings = await findingsFor('SC-LIC-008', {
      ...files,
      'package.json': JSON.stringify({
        name: 'demo',
        license: 'MIT',
        devDependencies: { tool: '1' },
      }),
    });

    expect(findings).toEqual([]);
  });

  it('leaves out NuGet packages that are not shipped: PrivateAssets="all" and test projects', async () => {
    const reference = (name: string, attributes = '') =>
      `<PackageReference Include="${name}" Version="1.0.0" ${attributes}/>`;
    const csproj = (...references: string[]) =>
      `<Project Sdk="Microsoft.NET.Sdk"><ItemGroup>${references.join('')}</ItemGroup></Project>`;
    const findings = await findingsFor('SC-LIC-008', {
      ...CODE,
      LICENSE: MIT_TEXT,
      'src/App/App.csproj': csproj(
        reference('Shipped.Lib'),
        reference('Analyzer.Lib', 'PrivateAssets="All"'),
      ),
      'src/App.Tests/App.Tests.csproj': csproj(reference('Xunit.Lib')),
      'src/Other/Other.csproj': csproj(
        reference('Microsoft.NET.Test.Sdk'),
        reference('Runner.Lib'),
      ),
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.path).toBe('src/App/App.csproj');
    expect(findings[0]?.message).toContain('1 of 1 runtime dependencies');
    expect(findings[0]?.message).toContain('Shipped.Lib');
  });

  it('reports a license that is not an SPDX expression, one that grants nothing, and a file pointer', async () => {
    const findings = await findingsFor(
      'SC-LIC-008',
      project(
        'MIT',
        { a: '1', b: '1', c: '1', ok: '1' },
        {
          'node_modules/a/package.json': packageJson('BSD'),
          'node_modules/b/package.json': packageJson('UNLICENSED'),
          'node_modules/c/package.json': packageJson('SEE LICENSE IN LICENSE.txt'),
          'node_modules/ok/package.json': packageJson('MIT'),
        },
      ),
    );

    expect(findings.map((f) => [f.message.split(' ')[0], f.severity])).toEqual([
      ['a', 'info'],
      ['b', 'warning'],
      ['c', 'info'],
    ]);
    expect(findings[1]?.message).toContain('all rights reserved');
  });

  it('reports a license that is on the SPDX list but not in the compatibility table', async () => {
    const findings = await findingsFor(
      'SC-LIC-008',
      project('MIT', { a: '1' }, { 'node_modules/a/package.json': packageJson('Frobnicate-1.0') }),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('compatibility table');
  });

  it('is quiet when every dependency has a license SiftCode knows', async () => {
    const findings = await findingsFor(
      'SC-LIC-008',
      project('MIT', { a: '1' }, { 'node_modules/a/package.json': packageJson('Apache-2.0') }),
    );

    expect(findings).toEqual([]);
  });
});

describe('grouping and proprietary projects (US-037)', () => {
  it('reports dependencies that share a license and an issue as one finding', async () => {
    const findings = await findingsFor(
      'SC-LIC-007',
      project(
        'MIT',
        { a: '1', b: '1', c: '1' },
        {
          'package-lock.json': lockfile({
            'node_modules/a': { version: '1.0.0', license: 'MPL-2.0' },
            'node_modules/b': { version: '1.0.0', license: 'MPL-2.0' },
            'node_modules/c': { version: '1.0.0', license: 'MPL-2.0' },
          }),
        },
      ),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain(
      '3 dependencies (a 1.0.0, b 1.0.0, c 1.0.0) are licensed MPL-2.0',
    );
  });

  it('keeps different issues apart, and says "and N more" past five names', async () => {
    const many = Object.fromEntries(
      Array.from({ length: 7 }, (_, i) => [
        `node_modules/p${i}`,
        { version: '1.0.0', license: 'GPL-3.0-only' },
      ]),
    );
    const findings = await findingsFor(
      'SC-LIC-007',
      project(
        'MIT',
        {},
        {
          'package-lock.json': lockfile({
            ...many,
            'node_modules/x': { version: '1.0.0', license: 'SSPL-1.0' },
          }),
        },
      ),
    );

    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.message).join('\n')).toContain('and 2 more');
  });

  it('checks copyleft dependencies against a proprietary LICENSE file', async () => {
    const files = {
      ...CODE,
      LICENSE:
        'Copyright (c) 2026 Acme. All rights reserved.\n\nThis software is proprietary. No licence is granted except with the written permission of Acme, and nothing here may be copied or shared.',
      'package.json': JSON.stringify({ name: 'demo', dependencies: { a: '1' } }),
      'package-lock.json': lockfile({
        'node_modules/a': { version: '1.0.0', license: 'GPL-3.0-only' },
      }),
    };

    const findings = await findingsFor('SC-LIC-007', files);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('proprietary project');
  });

  it('knows permissive licenses beyond the common ones, such as MIT-CMU', async () => {
    const findings = await findingsFor(
      'SC-LIC-008',
      project(
        'MIT',
        { pillow: '1' },
        { 'node_modules/pillow/package.json': packageJson('MIT-CMU') },
      ),
    );

    expect(findings).toEqual([]);
  });
});
