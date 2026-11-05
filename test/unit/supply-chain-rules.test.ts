import { describe, expect, it } from 'vitest';
import { scan } from '../../src/core/scan.js';
import { onlyRule, useProjects } from '../helpers/project.js';

const projects = useProjects();

/** Scans `files` with only rule `id` switched on. `git` makes the folder look like a repository root. */
async function findingsFor(id: string, files: Record<string, string>, git = false) {
  const folder = await projects.create({
    ...files,
    ...(git ? { '.git/HEAD': 'ref: refs/heads/main\n' } : {}),
  });
  return (await scan(folder, { config: onlyRule(id) })).findings;
}

const CODE = { 'src/app.ts': 'export const answer = 42;\n' };
const packageJson = (dependencies: Record<string, string>) =>
  JSON.stringify({ name: 'demo', dependencies }, null, 2);

describe('SC-SUP-001 missing lockfile (US-031)', () => {
  it('flags an npm project with dependencies and no lockfile', async () => {
    const findings = await findingsFor('SC-SUP-001', {
      'package.json': packageJson({ express: '^4.19.2' }),
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ path: 'package.json', severity: 'warning' });
    expect(findings[0]?.message).toContain('package-lock.json');
  });

  it.each(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock'])(
    'accepts %s next to package.json',
    async (lock) => {
      const findings = await findingsFor('SC-SUP-001', {
        'package.json': packageJson({ express: '^4.19.2' }),
        [lock]: '',
      });

      expect(findings).toEqual([]);
    },
  );

  it('accepts a lockfile at the top of a workspace for a package inside it', async () => {
    const findings = await findingsFor('SC-SUP-001', {
      'package.json': packageJson({}),
      'package-lock.json': '{}',
      'packages/web/package.json': packageJson({ react: '^18.0.0' }),
    });

    expect(findings).toEqual([]);
  });

  it('ignores a package.json with no dependencies, or only links inside the project', async () => {
    const findings = await findingsFor('SC-SUP-001', {
      'package.json': packageJson({}),
      'packages/app/package.json': packageJson({ shared: 'workspace:*' }),
    });

    expect(findings).toEqual([]);
  });

  it('flags a requirements file with unpinned versions, and accepts one that is fully pinned', async () => {
    const loose = await findingsFor('SC-SUP-001', { 'requirements.txt': 'requests>=2\nflask\n' });
    const pinned = await findingsFor('SC-SUP-001', {
      'requirements.txt': 'requests==2.32.3\nflask==3.0.3 --hash=sha256:abc\n',
    });

    expect(loose.map((f) => f.path)).toEqual(['requirements.txt']);
    expect(pinned).toEqual([]);
  });

  it('accepts a pyproject.toml with a Python lockfile, and reports one without at info level', async () => {
    const manifest = '[project]\nname = "demo"\ndependencies = [\n  "requests>=2",\n]\n';

    const locked = await findingsFor('SC-SUP-001', { 'pyproject.toml': manifest, 'uv.lock': '' });
    const unlocked = await findingsFor('SC-SUP-001', { 'pyproject.toml': manifest });

    expect(locked).toEqual([]);
    expect(unlocked).toHaveLength(1);
    expect(unlocked[0]?.severity).toBe('info');
  });

  it('reports every .NET project without a lock file as one info finding', async () => {
    const project = (name: string) =>
      `<Project Sdk="Microsoft.NET.Sdk"><ItemGroup><PackageReference Include="${name}" Version="1.2.3" /></ItemGroup></Project>`;
    const files = { 'A/A.csproj': project('Serilog'), 'B/B.csproj': project('Dapper') };

    const unlocked = await findingsFor('SC-SUP-001', files);
    const locked = await findingsFor('SC-SUP-001', {
      ...files,
      'A/packages.lock.json': '{}',
      'B/packages.lock.json': '{}',
    });

    expect(unlocked).toHaveLength(1);
    expect(unlocked[0]).toMatchObject({ path: 'A/A.csproj', severity: 'info' });
    expect(unlocked[0]?.message).toContain('2 .NET projects');
    expect(locked).toEqual([]);
  });
});

describe('SC-SUP-002 floating versions (US-032)', () => {
  it('flags npm dependencies set to any version, with the line of each', async () => {
    const findings = await findingsFor('SC-SUP-002', {
      'package.json': packageJson({
        a: '*',
        b: 'latest',
        c: '',
        d: 'next',
        e: '^1.2.3',
        f: '1.2.3',
        g: '~2.0.0',
        h: '>=1 <3',
      }),
    });

    expect(findings.map((f) => f.message.split(' ')[0])).toEqual(['a', 'b', 'c', 'd']);
    expect(findings.map((f) => f.startLine)).toEqual([4, 5, 6, 7]);
  });

  it('flags Python requirements with no version, and accepts any specifier', async () => {
    const findings = await findingsFor('SC-SUP-002', {
      'requirements.txt':
        '# tools\nrequests\nflask>=2\nnumpy==1.26.4\n-r other.txt\nclick[extras]  # cli\n',
    });

    expect(findings.map((f) => [f.startLine, f.message.split(' ')[0]])).toEqual([
      [2, 'requests'],
      [6, 'click'],
    ]);
  });

  it('flags Poetry and Pipenv dependencies set to *', async () => {
    const poetry = await findingsFor('SC-SUP-002', {
      'pyproject.toml':
        '[tool.poetry.dependencies]\npython = "*"\nrequests = "*"\nflask = "^3.0"\n',
    });
    const pipenv = await findingsFor('SC-SUP-002', {
      Pipfile: '[packages]\nrequests = "*"\nflask = "==3.0.3"\n',
    });

    expect(poetry.map((f) => f.message.split(' ')[0])).toEqual(['requests']);
    expect(pipenv.map((f) => f.message.split(' ')[0])).toEqual(['requests']);
  });

  it('reads PEP 621 dependency lists, including extras that contain brackets', async () => {
    const findings = await findingsFor('SC-SUP-002', {
      'pyproject.toml': [
        '[build-system]',
        'requires = ["setuptools"]',
        '[project]',
        'dependencies = [',
        '  "httpx[http2]",',
        '  "rich>=13",',
        ']',
        '[project.optional-dependencies]',
        'dev = ["pytest"]',
      ].join('\n'),
    });

    expect(findings.map((f) => f.message.split(' ')[0])).toEqual(['httpx', 'pytest']);
  });

  it('flags NuGet wildcard and open-ended versions, not exact or bounded ones', async () => {
    const findings = await findingsFor('SC-SUP-002', {
      'App.csproj': [
        '<Project Sdk="Microsoft.NET.Sdk"><ItemGroup>',
        '<PackageReference Include="A" Version="1.*" />',
        '<PackageReference Include="B" Version="[1.0,)" />',
        '<PackageReference Include="C" Version="1.2.3" />',
        '<PackageReference Include="D" Version="[1.0,2.0)" />',
        '<PackageReference Include="E"><Version>*</Version></PackageReference>',
        '<PackageReference Include="F" />',
        '</ItemGroup></Project>',
      ].join('\n'),
    });

    expect(findings.map((f) => f.message.split(' ')[0])).toEqual(['A', 'B', 'E']);
  });

  it('ignores a package.json that is not valid JSON', async () => {
    expect(await findingsFor('SC-SUP-002', { 'package.json': '{ "a": ' })).toEqual([]);
  });
});

describe('SC-SUP-003 repository and address dependencies (US-032)', () => {
  it.each([
    ['git+https://github.com/acme/widget.git'],
    ['github:acme/widget'],
    ['acme/widget#main'],
    ['https://example.com/widget-1.0.0.tgz'],
  ])('flags the npm dependency %s as unpinned', async (spec) => {
    const findings = await findingsFor('SC-SUP-003', { 'package.json': packageJson({ w: spec }) });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('warning');
  });

  it('reports a dependency pinned to a full commit at info level', async () => {
    const commit = 'a'.repeat(40);
    const findings = await findingsFor('SC-SUP-003', {
      'package.json': packageJson({ w: `github:acme/widget#${commit}` }),
    });

    expect(findings[0]?.severity).toBe('info');
  });

  it('does not flag registry versions, scoped aliases, or links inside the project', async () => {
    const findings = await findingsFor('SC-SUP-003', {
      'package.json': packageJson({
        a: '^1.0.0',
        b: 'npm:@scope/b@^2.0.0',
        c: 'file:../c',
        d: 'workspace:*',
      }),
    });

    expect(findings).toEqual([]);
  });

  it('flags Python requirements from git and web addresses, and Poetry git tables', async () => {
    const findings = await findingsFor('SC-SUP-003', {
      'requirements.txt': [
        'git+https://github.com/acme/tool.git#egg=tool',
        'other @ https://example.com/other-1.0.tar.gz',
        '-e .',
        'requests==2.0.0',
      ].join('\n'),
      'pyproject.toml':
        '[tool.poetry.dependencies]\nwidget = { git = "https://github.com/acme/widget.git" }\n',
    });

    expect(findings.map((f) => f.message.split(' ')[0]).sort()).toEqual([
      'other',
      'tool',
      'widget',
    ]);
  });
});

describe('repository checks apply to the top of a repository (US-031)', () => {
  it.each([
    ['SC-SUP-004', {}],
    ['SC-SUP-005', { 'package.json': packageJson({ a: '1.0.0' }) }],
    ['SC-SUP-006', { 'package.json': packageJson({ a: '1.0.0' }) }],
    ['SC-SUP-007', {}],
  ])('%s stays quiet when the folder is not a Git repository', async (id, extra) => {
    expect(await findingsFor(id, { ...CODE, ...extra })).toEqual([]);
  });

  it.each(['SC-SUP-004', 'SC-SUP-007'])(
    '%s stays quiet when there is no source code',
    async (id) => {
      expect(await findingsFor(id, { 'README.md': '# Notes\n' }, true)).toEqual([]);
    },
  );
});

describe('SC-SUP-004 continuous integration (US-031)', () => {
  it('flags a repository with code and no CI configuration, anchored on the README', async () => {
    const findings = await findingsFor('SC-SUP-004', { ...CODE, 'README.md': '# Demo\n' }, true);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ path: 'README.md', severity: 'info' });
  });

  it('anchors on the folder itself when there is no README', async () => {
    const findings = await findingsFor('SC-SUP-004', CODE, true);

    expect(findings[0]?.path).toBe('.');
  });

  it.each([
    '.github/workflows/ci.yml',
    '.gitlab-ci.yml',
    'azure-pipelines.yml',
    '.circleci/config.yml',
    'Jenkinsfile',
  ])('accepts %s', async (path) => {
    expect(await findingsFor('SC-SUP-004', { ...CODE, [path]: 'x\n' }, true)).toEqual([]);
  });
});

describe('SC-SUP-005 dependency updates (US-031)', () => {
  const manifest = { 'package.json': packageJson({ a: '1.0.0' }) };

  it('flags dependencies without Dependabot or Renovate', async () => {
    const findings = await findingsFor('SC-SUP-005', { ...CODE, ...manifest }, true);

    expect(findings).toHaveLength(1);
  });

  it.each(['.github/dependabot.yml', 'renovate.json', '.github/renovate.json5'])(
    'accepts %s',
    async (path) => {
      expect(await findingsFor('SC-SUP-005', { ...CODE, ...manifest, [path]: '{}' }, true)).toEqual(
        [],
      );
    },
  );

  it('stays quiet when there are no dependencies to keep up to date', async () => {
    expect(await findingsFor('SC-SUP-005', CODE, true)).toEqual([]);
  });
});

describe('SC-SUP-006 software bill of materials (US-031)', () => {
  const manifest = { 'package.json': packageJson({ a: '1.0.0' }) };

  it('flags dependencies with no SBOM file or generation step, at note level', async () => {
    const findings = await findingsFor('SC-SUP-006', { ...CODE, ...manifest }, true);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('note');
  });

  it('accepts an SBOM file, an SBOM tool in CI, or an SBOM script in package.json', async () => {
    const file = await findingsFor(
      'SC-SUP-006',
      { ...CODE, ...manifest, 'sbom.cdx.json': '{}' },
      true,
    );
    const ci = await findingsFor(
      'SC-SUP-006',
      { ...CODE, ...manifest, '.github/workflows/release.yml': 'run: npx cyclonedx-npm\n' },
      true,
    );
    const script = await findingsFor(
      'SC-SUP-006',
      {
        ...CODE,
        'package.json': JSON.stringify({
          dependencies: { a: '1.0.0' },
          scripts: { sbom: 'cyclonedx-npm' },
        }),
      },
      true,
    );

    expect([file, ci, script]).toEqual([[], [], []]);
  });
});

describe('SC-SUP-007 secret scanning (US-031)', () => {
  it('flags a repository with code and no secret scanner configured, at note level', async () => {
    const findings = await findingsFor('SC-SUP-007', CODE, true);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('note');
  });

  it('accepts a scanner configuration file, a pre-commit hook, or a CI step', async () => {
    const file = await findingsFor('SC-SUP-007', { ...CODE, '.gitleaks.toml': '' }, true);
    const hook = await findingsFor(
      'SC-SUP-007',
      {
        ...CODE,
        '.pre-commit-config.yaml': 'repos:\n  - repo: https://github.com/gitleaks/gitleaks\n',
      },
      true,
    );
    const ci = await findingsFor(
      'SC-SUP-007',
      { ...CODE, '.github/workflows/ci.yml': 'uses: trufflesecurity/trufflehog@v3\n' },
      true,
    );

    expect([file, hook, ci]).toEqual([[], [], []]);
  });
});
