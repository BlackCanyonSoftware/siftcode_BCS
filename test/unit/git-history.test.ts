import { describe, expect, it } from 'vitest';
import { openGit } from '../../src/git/history.js';
import { parseLog, RECORD_SEPARATOR } from '../../src/git/parse.js';
import { daysAgo, initRepository } from '../helpers/git.js';
import { useProjects } from '../helpers/project.js';

const projects = useProjects();

describe('Git log parsing (US-013)', () => {
  it('reads commit times and per-file line counts', () => {
    const output = [
      `${RECORD_SEPARATOR}1700000100`,
      '',
      '12\t3\tsrc/a.ts',
      '0\t5\tsrc/b.ts',
      `${RECORD_SEPARATOR}1700000000`,
      '',
      '-\t-\timage.png',
      '',
    ].join('\n');

    expect(parseLog(output)).toEqual([
      {
        time: 1700000100,
        files: [
          { path: 'src/a.ts', added: 12, deleted: 3 },
          { path: 'src/b.ts', added: 0, deleted: 5 },
        ],
      },
      { time: 1700000000, files: [{ path: 'image.png', added: 0, deleted: 0 }] },
    ]);
  });

  it('keeps a commit that changed no files, and ignores text that is not part of a log', () => {
    expect(parseLog(`junk${RECORD_SEPARATOR}1700000000\n`)).toEqual([
      { time: 1700000000, files: [] },
    ]);
    expect(parseLog('')).toEqual([]);
  });

  it('handles Windows line endings and paths with spaces', () => {
    const parsed = parseLog(`${RECORD_SEPARATOR}1700000000\r\n\r\n1\t2\tmy docs/a b.md\r\n`);

    expect(parsed[0]?.files).toEqual([{ path: 'my docs/a b.md', added: 1, deleted: 2 }]);
  });
});

describe('Git history reader (US-013)', () => {
  it('reports why there is no history for a folder that is not in a repository', async () => {
    const folder = await projects.create({ 'a.txt': 'x\n' });

    const access = await openGit(folder);

    expect(access.available).toBe(false);
    expect(!access.available && access.reason).toMatch(/not in a Git/);
  });

  it('lists the commits inside the window, newest first, with the files they changed', async () => {
    const folder = await projects.create({});
    await initRepository(folder, [
      { date: daysAgo(400), files: { 'old.ts': 'a\n' } },
      { date: daysAgo(20), files: { 'src/a.ts': 'one\ntwo\n' } },
      { date: daysAgo(10), files: { 'src/a.ts': 'one\ntwo\nthree\n', 'src/b.ts': 'b\n' } },
    ]);
    const access = await openGit(folder);
    if (!access.available) {
      throw new Error(access.reason);
    }

    const log = await access.commitsSince(new Date(Date.now() - 30 * 86_400_000), 100);

    expect(log.truncated).toBe(false);
    expect(log.commits.map((commit) => commit.files.map((file) => file.path).sort())).toEqual([
      ['src/a.ts', 'src/b.ts'],
      ['src/a.ts'],
    ]);
    expect(log.commits[0]?.files.find((file) => file.path === 'src/a.ts')).toMatchObject({
      added: 1,
      deleted: 0,
    });
  });

  it('says when the limit cut the history short', async () => {
    const folder = await projects.create({});
    await initRepository(
      folder,
      [10, 8, 6, 4].map((days, index) => ({
        date: daysAgo(days),
        files: { [`f${index}.ts`]: 'x\n' },
      })),
    );
    const access = await openGit(folder);
    if (!access.available) {
      throw new Error(access.reason);
    }

    const log = await access.commitsSince(new Date(Date.now() - 30 * 86_400_000), 2);

    expect(log.commits).toHaveLength(2);
    expect(log.truncated).toBe(true);
  });

  it('finds paths relative to a subfolder of the repository, and only inside it', async () => {
    const folder = await projects.create({});
    await initRepository(folder, [
      { date: daysAgo(5), files: { 'app/src/a.ts': 'x\n', 'other/b.ts': 'y\n' } },
    ]);
    const access = await openGit(`${folder}/app`);
    if (!access.available) {
      throw new Error(access.reason);
    }

    const log = await access.commitsSince(new Date(Date.now() - 30 * 86_400_000), 100);

    expect(log.commits[0]?.files.map((file) => file.path)).toEqual(['src/a.ts']);
  });

  it('returns when a file last changed, or nothing for a file Git has never seen', async () => {
    const folder = await projects.create({});
    await initRepository(folder, [
      { date: '2026-01-10T12:00:00Z', files: { 'a.md': 'one\n' } },
      { date: '2026-02-20T12:00:00Z', files: { 'a.md': 'two\n' } },
    ]);
    const access = await openGit(folder);
    if (!access.available) {
      throw new Error(access.reason);
    }

    expect(await access.lastChange('a.md')).toBe(Date.parse('2026-02-20T12:00:00Z') / 1000);
    expect(await access.lastChange('never.md')).toBeUndefined();
  });

  it('treats a repository with no commits as an empty history', async () => {
    const folder = await projects.create({});
    await initRepository(folder, []);
    const access = await openGit(folder);
    if (!access.available) {
      throw new Error(access.reason);
    }

    expect(await access.commitsSince(new Date(0), 10)).toEqual({ commits: [], truncated: false });
    expect(await access.lastChange('a.md')).toBeUndefined();
  });
});
