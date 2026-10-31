import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Runs the built binary (`npm run test:e2e` builds first), exactly as a user would.
const cli = fileURLToPath(new URL('../../dist/cli/main.js', import.meta.url));
const sample = fileURLToPath(new URL('../fixtures/sample', import.meta.url));

function siftcode(...args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('built siftcode CLI (US-001, US-060, US-061, US-062)', () => {
  it('scans the sample project and finds all four languages', () => {
    const { code, stdout } = siftcode('scan', sample);

    expect(code).toBe(0);
    expect(stdout).toContain('Scanned 5 files');
    for (const language of ['C#', 'JavaScript', 'Python', 'TypeScript']) {
      expect(stdout).toContain(language);
    }
  });

  it('exits 2 for a missing path', () => {
    const { code, stderr } = siftcode('scan', 'no/such/place');

    expect(code).toBe(2);
    expect(stderr).toContain('Path not found');
  });

  it('reports its version', () => {
    expect(siftcode('--version').stdout).toMatch(/^0\.0\.0/);
  });
});
