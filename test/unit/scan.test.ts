import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { UsageError } from '../../src/core/errors.js';
import { scan } from '../../src/core/scan.js';

const fixture = (name: string): string =>
  fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

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
    expect(result.skipped.unsupported).toBe(1);
  });

  it('reports a file that does not parse and still finishes the scan', async () => {
    const result = await scan(fixture('broken'));

    expect(result.filesScanned).toBe(1);
    expect(result.problems).toEqual([{ path: 'broken.py', reason: 'syntax-error' }]);
  });

  it('rejects a missing path with a UsageError', async () => {
    await expect(scan(fixture('does-not-exist'))).rejects.toBeInstanceOf(UsageError);
  });
});
