import { describe, expect, it } from 'vitest';
import { scan } from '../../src/core/scan.js';
import { referencedPaths } from '../../src/rules/documentation/stale-references.js';
import { onlyRule, useProjects } from '../helpers/project.js';

const projects = useProjects();

async function findingsFor(files: Record<string, string>, options: object = {}, git = true) {
  const folder = await projects.create({
    ...files,
    ...(git ? { '.git/HEAD': 'ref: refs/heads/main\n' } : {}),
  });
  return (await scan(folder, { config: onlyRule('SC-DOC-006', options) })).findings;
}

const paths = (text: string) => referencedPaths(text).map((reference) => reference.path);

describe('referencedPaths (US-034)', () => {
  it('finds source file paths in inline code, markdown and reStructuredText', () => {
    const text = [
      'The entry point is `src/pip/__main__.py` and ``build_env.py`` does the rest.',
      'See :file:`src/app/main.ts` and :class:`Thing` in `lib/util.cs`.',
    ].join('\n');

    expect(paths(text)).toEqual([
      'src/pip/__main__.py',
      'build_env.py',
      'src/app/main.ts',
      'lib/util.cs',
    ]);
  });

  it('reports the line each path is on', () => {
    expect(referencedPaths('one\n\ntwo `a/b.py`\n')).toEqual([
      { path: 'a/b.py', line: 3, kind: 'code' },
    ]);
  });

  it('strips a line number or a line anchor, and takes each path of a command', () => {
    expect(
      paths('Run `python tools/release.py --dry` then see `src/a.ts:42` and `src/b.ts#L10-L20`.'),
    ).toEqual(['tools/release.py', 'src/a.ts', 'src/b.ts']);
  });

  it('takes the target of a relative markdown link to a source file, and not a web address', () => {
    const text = 'See [the app](../src/app.ts), [docs](https://example.com/a.py) and [x](#top).';

    expect(referencedPaths(text)).toEqual([{ path: '../src/app.ts', line: 1, kind: 'link' }]);
  });

  it.each([
    ['a fenced code block', '```python\nimport `a/b.py`\nrun x/y.py\n```\n'],
    ['a placeholder name', 'Edit `foo.py`, `example.ts`, `my_module.py`, `path/to/file.py`.'],
    ['a pattern', 'All of `src/*.py` and `src/{a,b}.py` and `$HOME/x.py` and `<name>.py`.'],
    ['an absolute path', 'Installed at `/usr/lib/x/y.py` or `~/proj/z.py` or `C:/x/y.py`.'],
    [
      'a generated folder',
      'Built to `dist/bundle.js` and `build/lib/x.py` and `node_modules/a/b.js`.',
    ],
    ['a file that is not source code', 'Edit `config.json`, `setup.cfg`, and `README.md`.'],
    ['a module name', 'Import `pip._internal.build_env` or `os.path`.'],
  ])('ignores %s', (_name, text) => {
    expect(paths(text)).toEqual([]);
  });
});

describe('SC-DOC-006 design documents that name files that are not in the project (US-034)', () => {
  const CODE = {
    'src/app.ts': 'export const a = 1;\n',
    'src/auth/session.py': 'x = 1\n',
    'tools/release.py': 'x = 1\n',
  };

  it('flags a design document that names files that no longer exist, and lists them', async () => {
    const findings = await findingsFor({
      ...CODE,
      'docs/architecture.md': [
        '# Architecture',
        'Login lives in `src/auth/login.py`, sessions in `src/auth/session.py`.',
        'Shared helpers are in `utils/legacy.py` and `old_module.py`.',
        'The app is `src/app.ts`.',
      ].join('\n'),
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      path: 'docs/architecture.md',
      startLine: 2,
      severity: 'info',
      confidence: 'medium',
    });
    expect(findings[0]?.message).toBe(
      'docs/architecture.md names 5 source files, and 3 are not in the project: src/auth/login.py, utils/legacy.py, old_module.py.',
    );
  });

  it.each([
    ['an exact path from the top of the project', '`src/auth/session.py` and `src/app.ts`'],
    ['a path that ends like a file in the project', '`auth/session.py` and `app.ts`'],
    ['a bare file name found in any folder', '`session.py` and `release.py`'],
    ['a different letter case', '`SRC/App.ts` and `Session.PY`'],
    ['a path relative to the document', '`../src/app.ts` and `../tools/release.py`'],
    ['a line reference', '`src/app.ts:12` and `tools/release.py#L3`'],
    ['relative links', '[a](../src/app.ts) and [b](../tools/release.py)'],
  ])('is quiet when every file exists: %s', async (_name, line) => {
    const findings = await findingsFor({
      ...CODE,
      'docs/architecture.md': `# Architecture\n${line}\n`,
    });

    expect(findings).toEqual([]);
  });

  it('flags a relative link to a source file that is gone', async () => {
    const findings = await findingsFor({
      ...CODE,
      'docs/design/overview.md':
        'See [login](../../src/login.ts) and [auth](../../src/auth/old.py).\n',
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('2 are not in the project');
  });

  it('needs two missing files by default, and minMissing changes that', async () => {
    const files = {
      ...CODE,
      'docs/architecture.md': 'See `src/app.ts` and `src/gone.ts`.\n',
    };

    expect(await findingsFor(files)).toEqual([]);
    expect(await findingsFor(files, { minMissing: 1 })).toHaveLength(1);
  });

  it('does not count what is only an example: code blocks, placeholders, generated output', async () => {
    const findings = await findingsFor({
      ...CODE,
      'docs/architecture.md': [
        'Run `python foo.py` or edit `path/to/file.py`; output goes to `dist/out.js` and `build/x.py`.',
        '```',
        'old_one.py old_two.py',
        '```',
        'Names like `src/*.py` are patterns.',
      ].join('\n'),
    });

    expect(findings).toEqual([]);
  });

  it('does not check a name inside a folder SiftCode does not scan, such as bin (found in ESLint)', async () => {
    // bin/ is not in the project's file list, so bin/tool.js cannot be told from a missing file
    const findings = await findingsFor({
      ...CODE,
      'bin/tool.js': 'x\n',
      'docs/architecture.md':
        'Entry points: `bin/tool.js` and `bin/gone.js`, then `src/gone_a.ts` and `src/gone_b.ts`.\n',
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('names 2 source files, and 2 are not in the project');
  });

  it('leaves decision records alone: they name files as they were when the decision was made', async () => {
    const findings = await findingsFor({
      ...CODE,
      'docs/adr/0001-split.md': 'We moved `old_a.py` and `old_b.py` into `src/app.ts`.\n',
    });

    expect(findings).toEqual([]);
  });

  it('checks each design document, and a README that has a design section', async () => {
    const findings = await findingsFor({
      ...CODE,
      'docs/architecture.md': 'Uses `gone_a.py` and `gone_b.py`.\n',
      'DESIGN.md': 'Uses `gone_c.py` and `gone_d.py`.\n',
    });

    expect(findings.map((finding) => finding.path)).toEqual(['DESIGN.md', 'docs/architecture.md']);
  });

  it('only runs at the top of a Git repository, where the paths in a document make sense', async () => {
    const findings = await findingsFor(
      { ...CODE, 'docs/architecture.md': 'Uses `gone_a.py` and `gone_b.py`.\n' },
      {},
      false,
    );

    expect(findings).toEqual([]);
  });

  it('does not need Git history', async () => {
    // the rule reads files only: a bare .git folder is enough
    const findings = await findingsFor({
      ...CODE,
      'docs/architecture.md': 'Uses `gone_a.py` and `gone_b.py`.\n',
    });

    expect(findings).toHaveLength(1);
  });

  it('shortens a long list', async () => {
    const names = Array.from({ length: 8 }, (_, i) => `gone_${i}.py`);

    const findings = await findingsFor({
      ...CODE,
      'docs/architecture.md': names.map((name) => `\`${name}\``).join(' ') + '\n',
    });

    expect(findings[0]?.message).toContain(
      'gone_0.py, gone_1.py, gone_2.py, gone_3.py, gone_4.py and 3 more',
    );
  });
});
