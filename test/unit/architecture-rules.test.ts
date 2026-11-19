import { describe, expect, it } from 'vitest';
import { scan } from '../../src/core/scan.js';
import { LOOSE, assignComponents, componentRoot } from '../../src/rules/architecture/components.js';
import { onlyRule, useProjects } from '../helpers/project.js';

const projects = useProjects();

async function cycles(files: Record<string, string>) {
  const folder = await projects.create(files);
  return (await scan(folder, { config: onlyRule('SC-ARC-001') })).findings;
}

describe('where the components of a project are (US-023)', () => {
  it('goes down into the folder that holds most of the code, and stops where it splits', () => {
    const mostlySrc = ['src/a/x.ts', 'src/a/w.ts', 'src/b/y.ts', 'src/b/v.ts', 'scripts/z.ts'];
    expect(componentRoot(mostlySrc)).toBe('src/');
    expect(componentRoot(['src/a/x.ts', 'src/b/y.ts', 'scripts/z.ts'])).toBe('');
    expect(componentRoot(['src/pip/a/x.py', 'src/pip/b/y.py'])).toBe('src/pip/');
    expect(componentRoot(['a/x.ts', 'b/y.ts'])).toBe('');
    // pip: three entry files beside one folder that holds the rest
    const pipLike = [
      'src/pip/__init__.py',
      'src/pip/__main__.py',
      'src/pip/run.py',
      ...Array.from(
        { length: 40 },
        (_, i) => `src/pip/_internal/${i % 2 ? 'cli' : 'req'}/m${i}.py`,
      ),
    ];
    expect(componentRoot(pipLike)).toBe('src/pip/_internal/');
    // httpie: a fifth of the files are modules beside the subpackages, so the package is the root
    const httpieLike = [
      ...Array.from({ length: 8 }, (_, i) => `httpie/m${i}.py`),
      ...Array.from({ length: 16 }, (_, i) => `httpie/${i % 2 ? 'cli' : 'output'}/m${i}.py`),
    ];
    expect(componentRoot(httpieLike)).toBe('httpie/');
    expect(componentRoot(['packages/x/i.ts', 'packages/y/i.ts'])).toBe('packages/');
  });

  it('gives each file the folder under the root, or under its C# project, and none to a loose file', () => {
    const scripts = assignComponents(
      ['src/a/x.ts', 'src/a/deep/y.ts', 'src/b/z.ts', 'src/b/w.ts', 'src/index.ts', 'docs/t.py'],
      [],
    );
    const dotnet = assignComponents(['App/Models/M.cs', 'App/Program.cs'], ['App']);

    expect([...scripts]).toEqual([
      ['src/a/x.ts', 'src/a'],
      ['src/a/deep/y.ts', 'src/a'],
      ['src/b/z.ts', 'src/b'],
      ['src/b/w.ts', 'src/b'],
      ['src/index.ts', LOOSE],
      ['docs/t.py', LOOSE],
    ]);
    expect([...dotnet]).toEqual([
      ['App/Models/M.cs', 'App/Models'],
      ['App/Program.cs', LOOSE],
    ]);
  });
});

describe('SC-ARC-001 folders import each other in a cycle (US-023)', () => {
  it('flags two folders that import each other, and shows the imports', async () => {
    const findings = await cycles({
      'src/orders/service.ts':
        "import { invoice } from '../billing/invoice';\nexport const o = 1;\n",
      'src/billing/invoice.ts':
        "import { o } from '../orders/service';\nexport const invoice = o;\n",
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      path: 'src/billing/invoice.ts',
      startLine: 1,
      severity: 'info',
    });
    expect(findings[0]?.message).toBe(
      'The folders src/billing, src/orders depend on each other in a cycle: src/billing imports src/orders (src/billing/invoice.ts:1), and src/orders imports src/billing (src/orders/service.ts:1).',
    );
  });

  it('shows the shortest loop through three folders', async () => {
    const findings = await cycles({
      'src/a/a.ts': "import '../b/b';\n",
      'src/b/b.ts': "import '../c/c';\n",
      'src/c/c.ts': "import '../a/a';\n",
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toBe(
      'The folders src/a, src/b, src/c depend on each other in a cycle: src/a imports src/b (src/a/a.ts:1), and src/b imports src/c (src/b/b.ts:1), and src/c imports src/a (src/c/c.ts:1).',
    );
  });

  it('names only the first five folders of a large tangle, and counts the rest', async () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const files = Object.fromEntries(
      names.map((name, i) => [
        `src/${name}/m.ts`,
        `import '../${names[(i + 1) % names.length] ?? ''}/m';\n`,
      ]),
    );

    const findings = await cycles(files);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toMatch(
      /^The folders src\/a, src\/b, src\/c, src\/d, src\/e and 2 more depend on each other in a cycle: /,
    );
  });

  it('finds imports written with .js that name a TypeScript file, and index files', async () => {
    const findings = await cycles({
      'src/a/a.ts': "import { b } from '../b/index.js';\n",
      'src/b/index.ts': "import { a } from '../a/a.js';\n",
    });

    expect(findings).toHaveLength(1);
  });

  it('follows Python imports, absolute and relative', async () => {
    const findings = await cycles({
      'pkg/__init__.py': '',
      'pkg/a/__init__.py': '',
      'pkg/a/m.py': 'from pkg.b import n\n',
      'pkg/b/__init__.py': '',
      'pkg/b/n.py': 'from ..a import m\n',
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('The folders pkg/a, pkg/b depend on each other');
  });

  it('follows C# using directives to the files that declare the namespace, by project', async () => {
    const findings = await cycles({
      'Orders/Orders.csproj': '<Project />',
      'Orders/Domain/Service.cs':
        'using Shop.Billing;\nnamespace Shop.Orders;\nclass Service { }\n',
      'Billing/Billing.csproj': '<Project />',
      'Billing/Domain/Invoice.cs':
        'using Shop.Orders;\nnamespace Shop.Billing;\nclass Invoice { }\n',
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain(
      'The folders Billing/Domain, Orders/Domain depend on each other',
    );
  });

  it('leaves out a C# using whose namespace is declared in more than one project (found in eShop and GitVersion)', async () => {
    const findings = await cycles({
      'Web/Web.csproj': '<Project />',
      'Web/Pages/Home.cs':
        'using Microsoft.Extensions.Hosting;\nnamespace Shop.Web;\nclass Home { }\n',
      'Defaults/Defaults.csproj': '<Project />',
      'Defaults/Hosting/Extensions.cs':
        'using Shop.Web;\nnamespace Microsoft.Extensions.Hosting;\nclass Extensions { }\n',
      'Catalog/Catalog.csproj': '<Project />',
      'Catalog/Hosting/Extensions.cs': 'namespace Microsoft.Extensions.Hosting;\nclass More { }\n',
    });

    expect(findings).toEqual([]);
  });

  it("ignores the file that holds a C# project's global usings", async () => {
    const findings = await cycles({
      'A/A.csproj': '<Project />',
      'A/GlobalUsings.cs': 'global using Shop.B;\n',
      'A/Models/M.cs': 'namespace Shop.A;\nclass M { }\n',
      'B/B.csproj': '<Project />',
      'B/Logic/L.cs': 'using Shop.A;\nnamespace Shop.B;\nclass L { }\n',
    });

    expect(findings).toEqual([]);
  });

  it('does not count files beside the root: a package and its modules often import each other', async () => {
    const findings = await cycles({
      'pkg/__init__.py': 'from pkg.sub import thing\n',
      'pkg/context.py': 'from pkg.sub import thing\n',
      'pkg/sub/__init__.py': '',
      'pkg/sub/thing.py': 'from pkg import context\n',
      'pkg/other/__init__.py': '',
      'pkg/other/o.py': 'x = 1\n',
    });

    expect(findings).toEqual([]);
  });

  it.each([
    [
      'one folder depending on another',
      {
        'src/a/a.ts': "import '../b/b';\n",
        'src/b/b.ts': 'export const b = 1;\n',
      },
    ],
    [
      'imports inside one folder',
      {
        'src/a/a.ts': "import './b';\n",
        'src/a/b.ts': "import './a';\n",
        'src/c/c.ts': 'export {};\n',
      },
    ],
    [
      'packages, the standard library, and aliases that are not project files',
      {
        'src/a/a.ts': "import fs from 'fs';\nimport x from '@/b/b';\nimport y from 'left-pad';\n",
        'src/b/b.ts': "import '../a/a';\n",
      },
    ],
    [
      'a cycle that runs through test code',
      {
        'src/a/a.ts': 'export const a = 1;\n',
        'src/b/b.ts': "import '../a/a';\n",
        'src/a/a.test.ts': "import '../b/b';\n",
      },
    ],
  ])('does not flag %s', async (_name, files) => {
    expect(await cycles(files)).toEqual([]);
  });
});

describe('SC-ARC-002 a layer imports a layer it may not depend on (US-023)', () => {
  const layers = [
    { name: 'domain', paths: ['src/domain/'], mayImport: [] },
    { name: 'application', paths: ['src/application/'], mayImport: ['domain'] },
    {
      name: 'infrastructure',
      paths: ['src/infrastructure/'],
      mayImport: ['domain', 'application'],
    },
  ];

  async function violations(files: Record<string, string>, configured: object = layers) {
    const folder = await projects.create(files);
    const config = onlyRule('SC-ARC-002', { layers: configured });
    return (await scan(folder, { config })).findings;
  }

  it('flags an import against the declared direction, where it is written', async () => {
    const findings = await violations({
      'src/domain/order.ts': "export const n = 1;\nimport { db } from '../infrastructure/db';\n",
      'src/infrastructure/db.ts': 'export const db = 1;\n',
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      path: 'src/domain/order.ts',
      startLine: 2,
      severity: 'warning',
      confidence: 'high',
    });
    expect(findings[0]?.message).toBe(
      'The layer "domain" imports the layer "infrastructure" (src/infrastructure/db.ts); it may import no other layer.',
    );
  });

  it('names what the layer may import when it may import something', async () => {
    const findings = await violations(
      {
        'src/application/use.ts': "import '../infrastructure/db';\n",
        'src/infrastructure/db.ts': 'export {};\n',
        'src/domain/d.ts': 'export {};\n',
      },
      [
        { name: 'domain', paths: ['src/domain/'], mayImport: [] },
        { name: 'application', paths: ['src/application/'], mayImport: ['domain'] },
        { name: 'infrastructure', paths: ['src/infrastructure/'], mayImport: ['application'] },
      ],
    );

    expect(findings[0]?.message).toBe(
      'The layer "application" imports the layer "infrastructure" (src/infrastructure/db.ts); it may import "domain".',
    );
  });

  it('allows the declared directions, imports inside a layer, and files outside every layer', async () => {
    const findings = await violations({
      'src/application/use.ts': "import '../domain/order';\nimport './helper';\n",
      'src/application/helper.ts': 'export {};\n',
      'src/infrastructure/db.ts': "import '../application/use';\nimport '../domain/order';\n",
      'src/domain/order.ts': 'export {};\n',
      'src/main.ts': "import './domain/order';\nimport './infrastructure/db';\n",
    });

    expect(findings).toEqual([]);
  });

  it('reports nothing when no layers are configured', async () => {
    const findings = await violations(
      {
        'src/domain/order.ts': "import '../infrastructure/db';\n",
        'src/infrastructure/db.ts': 'export {};\n',
      },
      [],
    );

    expect(findings).toEqual([]);
  });

  it.each([
    [
      'a layer that may import one that does not exist',
      [{ name: 'a', paths: ['a/'], mayImport: ['b'] }],
      '"b" is not the name of a layer.',
    ],
    [
      'two layers with one name',
      [
        { name: 'a', paths: ['a/'] },
        { name: 'a', paths: ['b/'] },
      ],
      'Two layers are named "a".',
    ],
    ['a layer with no paths', [{ name: 'a', paths: [] }], 'layers'],
  ])('refuses %s in the config', async (_name, configured, message) => {
    const folder = await projects.create({ 'src/a.ts': 'export {};\n' });
    const config = onlyRule('SC-ARC-002', { layers: configured });

    await expect(scan(folder, { config })).rejects.toThrow(message);
  });
});
