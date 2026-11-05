import { describe, expect, it } from 'vitest';
import { createRepoView } from '../../src/core/repo-view.js';
import { discoverFiles } from '../../src/discovery/discover.js';
import { defineRepoRule } from '../../src/rules/define.js';
import { resolveRules } from '../../src/rules/resolve.js';
import { DEFAULT_CONFIG } from '../../src/config/schema.js';
import { z } from 'zod';
import { useProjects } from '../helpers/project.js';

const projects = useProjects();

describe('repository view (US-031)', () => {
  it('lists every file that is not ignored, supported source or not', async () => {
    const root = await projects.create({
      'src/app.ts': 'export const a = 1;\n',
      'README.md': '# Title\n',
      'node_modules/dep/index.js': 'x\n',
      'docs/diagram.mmd': 'graph TD\n',
    });

    const view = createRepoView(await discoverFiles(root, { ignore: [] }));

    expect(view.files).toEqual(['README.md', 'docs/diagram.mmd', 'src/app.ts']);
    expect(view.sourceFileCount).toBe(1);
    expect(view.has('README.md')).toBe(true);
    expect(view.has('node_modules/dep/index.js')).toBe(false);
  });

  it('knows whether the folder is the top of a Git repository', async () => {
    const plain = await projects.create({ 'a.txt': 'x\n' });
    const repo = await projects.create({ '.git/HEAD': 'ref: refs/heads/main\n', 'a.txt': 'x\n' });

    expect((await discoverFiles(plain, { ignore: [] })).isRepositoryRoot).toBe(false);
    expect((await discoverFiles(repo, { ignore: [] })).isRepositoryRoot).toBe(true);
  });

  it('reads files, and returns undefined for missing or oversized ones', async () => {
    const root = await projects.create({
      'package.json': '{}',
      'big.txt': 'x'.repeat(1024 * 1024 + 1),
    });
    const view = createRepoView(await discoverFiles(root, { ignore: [] }));

    expect(await view.read('package.json')).toBe('{}');
    expect(await view.read('big.txt')).toBeUndefined();
    expect(await view.read('missing.txt')).toBeUndefined();
  });

  it('binds a repository rule with validated options and no per-file check', async () => {
    const rule = defineRepoRule({
      meta: {
        id: 'SC-TEST-001',
        title: 'Test',
        category: 'supply-chain',
        defaultSeverity: 'note',
        confidence: 'high',
        heuristic: false,
        standards: [],
        rationale: 'r',
        suggestion: { summary: 's' },
      },
      options: z.strictObject({}),
      check: () =>
        Promise.resolve([{ path: '.', startLine: 1, endLine: 1, message: 'm', key: 'k' }]),
    });

    const [configured] = resolveRules(DEFAULT_CONFIG, [rule]);

    expect(configured?.repoCheck).toBeDefined();
    expect(
      await configured?.repoCheck?.(
        createRepoView(await discoverFiles(await projects.create({}), { ignore: [] })),
      ),
    ).toHaveLength(1);
  });
});
