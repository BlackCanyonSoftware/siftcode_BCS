import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/config/load.js';
import { UsageError } from '../../src/core/errors.js';
import { scan } from '../../src/core/scan.js';
import { fixture, longJsFunction, useProjects } from '../helpers/project.js';

const projects = useProjects();
const strict = parseConfig('{"rules":{"SC-MET-001":{"options":{"maxLines":3}}}}', 'test');

describe('scan (US-001, US-071)', () => {
  it('counts files per language across JavaScript, TypeScript, Python and C#', async () => {
    const result = await scan(fixture('sample'));

    expect(result.filesScanned).toBe(5);
    expect(result.byLanguage).toEqual([
      ['C#', 1],
      ['JavaScript', 1],
      ['Python', 1],
      ['TypeScript', 2],
    ]);
    expect(result.problems).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(result.skipped.unsupported).toBe(1);
  });

  it('lists the rules that ran, in id order', async () => {
    const result = await scan(fixture('sample'));

    expect(result.rules.map((rule) => rule.id)).toEqual(['SC-MET-001']);
  });

  it('reports a file that does not parse and still finishes the scan', async () => {
    const result = await scan(fixture('broken'));

    expect(result.filesScanned).toBe(1);
    expect(result.problems).toEqual([{ path: 'broken.py', reason: 'syntax-error' }]);
  });

  it('still reports findings in the other files when one file does not parse', async () => {
    const folder = await projects.create({
      'good.js': longJsFunction('work', 6),
      'broken.py': 'def broken(:\n    return (1 +\n',
    });

    const result = await scan(folder, { config: strict });

    expect(result.findings.map((f) => f.path)).toEqual(['good.js']);
    expect(result.problems).toEqual([{ path: 'broken.py', reason: 'syntax-error' }]);
  });

  it('does not run rules on a file that has syntax errors', async () => {
    const folder = await projects.create({
      'broken.js': `${longJsFunction('work', 8)}function (: {\n`,
    });

    const result = await scan(folder, { config: strict });

    expect(result.findings).toEqual([]);
    expect(result.problems).toEqual([{ path: 'broken.js', reason: 'syntax-error' }]);
  });

  it('honors config ignore patterns', async () => {
    const folder = await projects.create({
      'src/a.js': longJsFunction('kept', 6),
      'legacy/b.js': longJsFunction('dropped', 6),
    });
    const config = parseConfig(
      '{"ignore":["legacy/"],"rules":{"SC-MET-001":{"options":{"maxLines":3}}}}',
      'test',
    );

    const result = await scan(folder, { config });

    expect(result.findings.map((f) => f.path)).toEqual(['src/a.js']);
  });

  it('rejects a missing path with a UsageError', async () => {
    await expect(scan(fixture('does-not-exist'))).rejects.toBeInstanceOf(UsageError);
  });
});
