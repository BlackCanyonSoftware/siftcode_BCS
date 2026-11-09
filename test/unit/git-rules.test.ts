import { describe, expect, it } from 'vitest';
import { scan } from '../../src/core/scan.js';
import { coveredFolder } from '../../src/rules/documentation/design-doc-freshness.js';
import { daysAgo, initRepository, type TestCommit } from '../helpers/git.js';
import { onlyRule, useProjects } from '../helpers/project.js';

const projects = useProjects();

/** A file whose total cyclomatic complexity is `branches + 1`; `edit` makes each version differ. */
const complexSource = (branches: number, edit = 0): string =>
  `// version ${edit}\nexport function f(x: number): number {\n${Array.from(
    { length: branches },
    (_, i) => `  if (x === ${i}) { return ${i}; }`,
  ).join('\n')}\n  return -1;\n}\n`;

/** `count` commits, one every `spacing` days starting `first` days ago, each editing `path`. */
const edits = (
  path: string,
  count: number,
  first = 100,
  spacing = 3,
  branches = 12,
): TestCommit[] =>
  Array.from({ length: count }, (_, i) => ({
    date: daysAgo(first - i * spacing),
    files: { [path]: complexSource(branches, i) },
  }));

async function scanRepository(id: string, commits: readonly TestCommit[], options: object = {}) {
  const folder = await projects.create({});
  await initRepository(folder, commits);
  return scan(folder, { config: onlyRule(id, options) });
}

describe('SC-HOT-001 hotspots (US-013)', { timeout: 60_000 }, () => {
  const small = { minComplexity: 5 };

  it('ranks files that are both complex and changed often, most pressing first', async () => {
    const result = await scanRepository(
      'SC-HOT-001',
      [
        ...edits('src/busy.ts', 8),
        ...edits('src/steady.ts', 6, 90, 3, 12),
        ...edits('src/rare.ts', 2),
        ...edits('src/simple.ts', 9, 100, 3, 1),
      ],
      small,
    );

    expect(result.findings.map((f) => f.path)).toEqual(['src/busy.ts', 'src/steady.ts']);
    expect(result.findings[0]?.message).toContain('Hotspot #1: changed in 8 commits');
    expect(result.findings[1]?.message).toContain('Hotspot #2: changed in 6 commits');
    expect(result.findings[0]).toMatchObject({ severity: 'info' });
    expect(result.notes).toEqual([]);
  });

  it('reports only the top few', async () => {
    const result = await scanRepository(
      'SC-HOT-001',
      [...edits('src/a.ts', 8), ...edits('src/b.ts', 7), ...edits('src/c.ts', 6)],
      { ...small, top: 2 },
    );

    expect(result.findings.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('counts only the commits inside the window', async () => {
    const result = await scanRepository(
      'SC-HOT-001',
      [...edits('src/old.ts', 8, 700, 3), ...edits('src/new.ts', 6, 60, 3)],
      small,
    );

    expect(result.findings.map((f) => f.path)).toEqual(['src/new.ts']);
  });

  it('ignores mass commits that touch many files', async () => {
    const many = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`src/gen${i}.ts`, complexSource(12, i)]),
    );
    const result = await scanRepository(
      'SC-HOT-001',
      [{ date: daysAgo(50), files: many }, ...edits('src/gen0.ts', 2, 40, 3)],
      { ...small, minChanges: 3, maxFilesPerCommit: 10 },
    );

    expect(result.findings).toEqual([]);
  });

  it('skips test files', async () => {
    const result = await scanRepository('SC-HOT-001', edits('tests/busy.test.ts', 8), small);

    expect(result.findings).toEqual([]);
  });

  it('skips vendored code, which nobody works on here', async () => {
    const result = await scanRepository(
      'SC-HOT-001',
      [...edits('vendored/lib.ts', 8), ...edits('third_party/x/y.ts', 8)],
      small,
    );

    expect(result.findings).toEqual([]);
  });

  it('is skipped with a note, not an error, in a folder that is not a Git repository', async () => {
    const folder = await projects.create({ 'src/a.ts': complexSource(12) });

    const result = await scan(folder, { config: onlyRule('SC-HOT-001', small) });

    expect(result.findings).toEqual([]);
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toMatch(/Hotspots \(SC-HOT-001\) were skipped: .*not in a Git/);
  });

  it('shows the note in the text, Markdown, and JSON reports', async () => {
    const { renderReport } = await import('../../src/reporters/index.js');
    const folder = await projects.create({ 'src/a.ts': complexSource(12) });
    const result = await scan(folder, { config: onlyRule('SC-HOT-001', small) });

    const text = renderReport('text', result, { version: '1.0.0' });
    const markdown = renderReport('markdown', result, { version: '1.0.0' });
    const json = JSON.parse(renderReport('json', result, { version: '1.0.0' })) as {
      notes: string[];
    };

    expect(text).toContain('Notes:');
    expect(markdown).toContain('## Notes');
    expect(json.notes).toEqual(result.notes);
  });

  it('rejects an invalid option with a usage error', async () => {
    const folder = await projects.create({ 'src/a.ts': complexSource(3) });

    await expect(
      scan(folder, { config: onlyRule('SC-HOT-001', { windowMonths: 0 }) }),
    ).rejects.toThrow(/SC-HOT-001/);
  });
});

describe(
  'SC-DOC-005 design documents that may be out of date (US-034)',
  { timeout: 60_000 },
  () => {
    /** A source file of `lines` lines, different for each `edit`. */
    const code = (lines: number, edit: number): string =>
      Array.from({ length: lines }, (_, i) => `export const v${edit}_${i} = ${i};`).join('\n') +
      '\n';

    const rewrite = (
      path: string,
      daysBefore: number,
      lines: number,
      edit: number,
    ): TestCommit => ({
      date: daysAgo(daysBefore),
      files: { [path]: code(lines, edit) },
    });

    it('flags a document that predates a large rewrite of the code it covers', async () => {
      const result = await scanRepository('SC-DOC-005', [
        {
          date: daysAgo(200),
          files: {
            'docs/architecture.md': '# Architecture\n\nOne module.\n',
            'src/a.ts': code(200, 0),
          },
        },
        rewrite('src/a.ts', 100, 700, 1),
      ]);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toMatchObject({
        path: 'docs/architecture.md',
        severity: 'info',
        confidence: 'low',
      });
      expect(result.findings[0]?.message).toContain('last changed 200 days ago');
      expect(result.findings[0]?.message).toContain('since then 1 commits changed 900 lines');
    });

    it('is quiet when the document was updated after the code changed', async () => {
      const result = await scanRepository('SC-DOC-005', [
        {
          date: daysAgo(200),
          files: { 'docs/architecture.md': '# A\n', 'src/a.ts': code(200, 0) },
        },
        rewrite('src/a.ts', 100, 700, 1),
        { date: daysAgo(20), files: { 'docs/architecture.md': '# A\n\nUpdated.\n' } },
      ]);

      expect(result.findings).toEqual([]);
    });

    it('does not check a document younger than the minimum age', async () => {
      const result = await scanRepository('SC-DOC-005', [
        { date: daysAgo(60), files: { 'docs/architecture.md': '# A\n', 'src/a.ts': code(200, 0) } },
        rewrite('src/a.ts', 30, 700, 1),
      ]);

      expect(result.findings).toEqual([]);
    });

    it('needs enough changed lines, and enough of the code, to count as substantial', async () => {
      const small = await scanRepository('SC-DOC-005', [
        {
          date: daysAgo(200),
          files: { 'docs/architecture.md': '# A\n', 'src/a.ts': code(1000, 0) },
        },
        { date: daysAgo(100), files: { 'src/a.ts': code(1000, 0).replace('v0_5 ', 'v9_5 ') } },
      ]);
      const share = await scanRepository('SC-DOC-005', [
        {
          date: daysAgo(200),
          files: { 'docs/architecture.md': '# A\n', 'src/a.ts': code(5000, 0) },
        },
        rewrite('src/b.ts', 100, 600, 1),
      ]);

      expect(small.findings).toEqual([]);
      expect(share.findings).toEqual([]);
    });

    it('covers only the folder around a document that sits inside the code', async () => {
      const result = await scanRepository('SC-DOC-005', [
        {
          date: daysAgo(200),
          files: {
            'src/auth/design.md': '# Auth\n',
            'src/auth/a.ts': code(200, 0),
            'src/other/b.ts': code(200, 0),
          },
        },
        rewrite('src/other/b.ts', 100, 900, 1),
      ]);

      expect(result.findings).toEqual([]);
    });

    it('does not treat decision records as design documents that go stale', async () => {
      const result = await scanRepository('SC-DOC-005', [
        {
          date: daysAgo(200),
          files: { 'docs/adr/0001-use-x.md': '# 1. Use X\n', 'src/a.ts': code(200, 0) },
        },
        rewrite('src/a.ts', 100, 700, 1),
      ]);

      expect(result.findings).toEqual([]);
    });

    it('is skipped with a note in a folder that is not a Git repository', async () => {
      const folder = await projects.create({
        'docs/architecture.md': '# A\n',
        'src/a.ts': code(10, 0),
      });

      const result = await scan(folder, { config: onlyRule('SC-DOC-005') });

      expect(result.findings).toEqual([]);
      expect(result.notes[0]).toMatch(/Design document freshness \(SC-DOC-005\) was skipped/);
    });

    it('works out which code a document covers', () => {
      expect(coveredFolder('docs/architecture.md')).toBe('');
      expect(coveredFolder('ARCHITECTURE.md')).toBe('');
      expect(coveredFolder('docs/design/overview.md')).toBe('');
      expect(coveredFolder('src/auth/docs/design.md')).toBe('src/auth');
      expect(coveredFolder('src/auth/README.md')).toBe('src/auth');
    });

    it('writes nothing to the repository it reads', async () => {
      const folder = await projects.create({});
      await initRepository(folder, edits('src/a.ts', 3));
      const { readdir } = await import('node:fs/promises');
      const before = await readdir(`${folder}/.git`);

      await scan(folder, { config: onlyRule('SC-HOT-001', { minComplexity: 5, minChanges: 1 }) });

      expect(await readdir(`${folder}/.git`)).toEqual(before);
    });
  },
);
