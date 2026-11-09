import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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

  it('lists the rules when explain has no rule id', () => {
    const { code, stdout } = siftcode('explain');

    expect(code).toBe(0);
    expect(stdout).toContain('SC-MET-006');
    expect(stdout).toContain('siftcode explain <rule-id>');
  });

  it('writes a self-contained HTML report that includes the brand fonts and styles (US-005)', async () => {
    const folder = await projects.create({
      'a.js': longJsFunction('work', 6),
      'siftcode.config.json': '{"rules":{"SC-MET-001":{"options":{"maxLines":3}}}}',
    });
    const file = join(folder, 'report.html');

    const { code } = siftcode('scan', folder, '--format', 'html', '--output', file);

    expect(code).toBe(0);
    const page = await readFile(file, 'utf8');
    expect(page.startsWith('<!doctype html>')).toBe(true);
    expect(page).toContain('url("data:font/woff;base64,');
    expect(page).toContain('SC-MET-001');
    expect(page).not.toContain(folder);
  });

  it('accepts findings with a baseline, so only new ones fail the scan (US-070)', async () => {
    const folder = await projects.create({
      'a.js': longJsFunction('work', 6),
      'siftcode.config.json': '{"rules":{"SC-MET-001":{"options":{"maxLines":3}}}}',
    });

    const created = siftcode('baseline', folder);
    const accepted = siftcode('scan', folder, '--baseline', join(folder, 'siftcode-baseline.json'));
    const withoutBaseline = siftcode('scan', folder, '--fail-on', 'info');
    const withBaseline = siftcode(
      'scan',
      folder,
      '--fail-on',
      'info',
      '--baseline',
      join(folder, 'siftcode-baseline.json'),
    );

    expect(created.code).toBe(0);
    expect(accepted.stdout).toContain('Accepted findings (not shown): 1 (1 by the baseline)');
    expect(withoutBaseline.code).toBe(1);
    expect(withBaseline.code).toBe(0);
  });

  it('reports its version', () => {
    expect(siftcode('--version').stdout).toMatch(/^0\.0\.0/);
  });
});
