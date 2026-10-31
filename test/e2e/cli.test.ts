import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { fixture, longJsFunction, useProjects } from '../helpers/project.js';
import { sarifErrors } from '../helpers/sarif.js';

// Runs the built binary (`npm run test:e2e` builds first), exactly as a user would.
const cli = fixture('../../dist/cli/main.js');
const sample = fixture('sample');
const projects = useProjects();

function siftcode(...args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('built siftcode CLI (US-001, US-003, US-006, US-041, US-060, US-061, US-062)', () => {
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

  it('exits 1 with --fail-on when a finding qualifies, and emits valid SARIF', async () => {
    const folder = await projects.create({
      'a.js': longJsFunction('work', 6),
      'siftcode.config.json': '{"rules":{"SC-MET-001":{"options":{"maxLines":3}}}}',
    });

    const { code, stdout } = siftcode('scan', folder, '--format', 'sarif', '--fail-on', 'info');

    expect(code).toBe(1);
    expect(sarifErrors(JSON.parse(stdout))).toEqual([]);
  });

  it('explains a rule', () => {
    const { code, stdout } = siftcode('explain', 'SC-MET-001');

    expect(code).toBe(0);
    expect(stdout).toContain('Why it matters');
  });

  it('reports its version', () => {
    expect(siftcode('--version').stdout).toMatch(/^0\.0\.0/);
  });
});
