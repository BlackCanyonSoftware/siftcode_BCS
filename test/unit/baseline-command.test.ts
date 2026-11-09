import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXIT_FINDINGS, EXIT_OK, EXIT_USAGE, run } from '../../src/cli/run.js';
import { parseConfig } from '../../src/config/load.js';
import { longJsFunction, useProjects } from '../helpers/project.js';

const projects = useProjects();
const LIMIT = { rules: { 'SC-MET-001': { options: { maxLines: 3 } } } };

async function runCli(...argv: string[]) {
  let stdout = '';
  let stderr = '';
  const code = await run(argv, {
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
  });
  return { code, stdout, stderr };
}

/** A project with two long functions, so a limit of 3 lines gives two findings. */
const twoFindings = (config: object = LIMIT) =>
  projects.create({
    'a.js': longJsFunction('one', 6) + longJsFunction('two', 6),
    'siftcode.config.json': JSON.stringify(config),
  });

describe('baseline command (US-070)', () => {
  it('writes siftcode-baseline.json in the scanned folder and exits 0', async () => {
    const folder = await twoFindings();

    const { code, stdout } = await runCli('baseline', folder);

    expect(code).toBe(EXIT_OK);
    expect(stdout).toContain('Wrote a baseline of 2 findings to');
    const file = JSON.parse(await readFile(join(folder, 'siftcode-baseline.json'), 'utf8')) as {
      version: number;
      findings: unknown[];
    };
    expect(file.version).toBe(1);
    expect(file.findings).toHaveLength(2);
  });

  it('writes to the file named by --output, and the config key names the default', async () => {
    const folder = await twoFindings({ ...LIMIT, baseline: 'ci/accepted.json' });

    const viaConfig = await runCli('baseline', folder);
    const viaFlag = await runCli('baseline', folder, '--output', join(folder, 'other.json'));

    expect(viaConfig.code).toBe(EXIT_OK);
    expect(await readFile(join(folder, 'ci', 'accepted.json'), 'utf8')).toContain('"findings"');
    expect(viaFlag.code).toBe(EXIT_OK);
    expect(await readFile(join(folder, 'other.json'), 'utf8')).toContain('"findings"');
  });

  it('records the findings that remain after inline suppressions, not the suppressed ones', async () => {
    const folder = await projects.create({
      'a.js': `${longJsFunction('one', 6)}// siftcode-ignore SC-MET-001: reason\n${longJsFunction('two', 6)}`,
      'siftcode.config.json': JSON.stringify(LIMIT),
    });

    await runCli('baseline', folder);

    const file = JSON.parse(await readFile(join(folder, 'siftcode-baseline.json'), 'utf8')) as {
      findings: { message: string }[];
    };
    expect(file.findings.map((f) => f.message)).toEqual([
      'Function "one" is 6 lines long (limit 3).',
    ]);
  });
});

describe('scan --baseline (US-070)', () => {
  it('fails on the findings without a baseline and passes with one, and says what it set aside', async () => {
    const folder = await twoFindings();
    await runCli('baseline', folder);

    const without = await runCli('scan', folder, '--fail-on', 'info');
    const withFlag = await runCli(
      'scan',
      folder,
      '--fail-on',
      'info',
      '--baseline',
      join(folder, 'siftcode-baseline.json'),
    );

    expect(without.code).toBe(EXIT_FINDINGS);
    expect(withFlag.code).toBe(EXIT_OK);
    expect(withFlag.stdout).toContain('No findings.');
    expect(withFlag.stdout).toContain('Accepted findings (not shown): 2 (2 by the baseline)');
  });

  it('reads the baseline named in the config, relative to the scanned folder', async () => {
    const folder = await twoFindings({ ...LIMIT, baseline: 'siftcode-baseline.json' });
    await runCli('baseline', folder);

    const { code, stdout } = await runCli('scan', folder, '--fail-on', 'info');

    expect(code).toBe(EXIT_OK);
    expect(stdout).toContain('2 by the baseline');
  });

  it('still fails on a new finding', async () => {
    const folder = await twoFindings({ ...LIMIT, baseline: 'siftcode-baseline.json' });
    await runCli('baseline', folder);
    await writeFile(join(folder, 'b.js'), longJsFunction('three', 6));

    const { code, stdout } = await runCli('scan', folder, '--fail-on', 'info');

    expect(code).toBe(EXIT_FINDINGS);
    expect(stdout).toContain('"three"');
  });

  it('exits 2 and says how to create the file when the baseline does not exist', async () => {
    const folder = await twoFindings({ ...LIMIT, baseline: 'siftcode-baseline.json' });

    const { code, stderr } = await runCli('scan', folder);

    expect(code).toBe(EXIT_USAGE);
    expect(stderr).toContain('Baseline file not found');
    expect(stderr).toContain('siftcode baseline');
  });

  it('exits 2 for a baseline that is not valid', async () => {
    const folder = await twoFindings({ ...LIMIT, baseline: 'siftcode-baseline.json' });
    await writeFile(join(folder, 'siftcode-baseline.json'), '{"version":9}');

    const { code, stderr } = await runCli('scan', folder);

    expect(code).toBe(EXIT_USAGE);
    expect(stderr).toContain('Invalid baseline');
  });

  it('refreshing the baseline drops what has been fixed', async () => {
    const folder = await twoFindings({ ...LIMIT, baseline: 'siftcode-baseline.json' });
    await runCli('baseline', folder);
    await rm(join(folder, 'a.js'));
    await writeFile(join(folder, 'a.js'), longJsFunction('one', 6));

    const stale = await runCli('scan', folder);
    await runCli('baseline', folder);
    const refreshed = await runCli('scan', folder);

    expect(stale.stdout).toContain('The baseline lists 1 finding that no longer occurs');
    expect(refreshed.stdout).not.toContain('no longer occurs');
  });
});

describe('baseline config key', () => {
  it('is accepted by the config schema', () => {
    expect(parseConfig('{"baseline":"accepted.json"}', 'siftcode.config.json').baseline).toBe(
      'accepted.json',
    );
  });
});
