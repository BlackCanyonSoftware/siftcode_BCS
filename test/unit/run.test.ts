import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXIT_FINDINGS, EXIT_OK, EXIT_USAGE, run } from '../../src/cli/run.js';
import { fixture, longJsFunction, useProjects } from '../helpers/project.js';

const sample = fixture('sample');
const projects = useProjects();

async function runCli(...argv: string[]) {
  let stdout = '';
  let stderr = '';
  const code = await run(argv, {
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
  });
  return { code, stdout, stderr };
}

/** A project with one 6-line function and a rule limit of 3, so it has exactly one finding. */
const oneFinding = (config: object = { rules: { 'SC-MET-001': { options: { maxLines: 3 } } } }) =>
  projects.create({
    'a.js': longJsFunction('work', 6),
    'siftcode.config.json': JSON.stringify(config),
  });

describe('scan command (US-001)', () => {
  it('prints a summary and exits 0 for a valid scan', async () => {
    const { code, stdout, stderr } = await runCli('scan', sample);

    expect(code).toBe(EXIT_OK);
    expect(stdout).toContain('Scanned 5 files');
    expect(stdout).toMatch(/C#\s+1/);
    expect(stdout).toContain('No findings.');
    expect(stdout).toContain('Skipped: 1 unsupported');
    expect(stderr).toBe('');
  });

  it('exits 2 and names the path when it does not exist', async () => {
    const { code, stderr } = await runCli('scan', 'no/such/place');

    expect(code).toBe(EXIT_USAGE);
    expect(stderr).toContain('Path not found: no/such/place');
  });

  it.each([
    [[], 'Missing command.'],
    [['frobnicate'], 'Unknown command "frobnicate".'],
    [['scan'], 'The scan command takes exactly one path.'],
    [['scan', 'a', 'b'], 'The scan command takes exactly one path.'],
  ])('exits 2 for the bad arguments %j', async (argv, message) => {
    const { code, stderr } = await runCli(...argv);

    expect(code).toBe(EXIT_USAGE);
    expect(stderr).toContain(message);
    expect(stderr).toContain('siftcode scan <path>');
  });

  it('exits 2 for an unknown option', async () => {
    const { code, stderr } = await runCli('scan', sample, '--bogus');

    expect(code).toBe(EXIT_USAGE);
    expect(stderr).toContain('--bogus');
  });

  it('prints help and exits 0, at the top level and for scan', async () => {
    for (const argv of [['--help'], ['-h'], ['scan', '--help']]) {
      const { code, stdout } = await runCli(...argv);

      expect(code).toBe(EXIT_OK);
      expect(stdout).toContain('siftcode scan <path>');
    }
  });

  it('prints the package version and exits 0', async () => {
    const { code, stdout } = await runCli('--version');

    expect(code).toBe(EXIT_OK);
    expect(stdout).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('report formats and output (US-003, US-004)', () => {
  it.each([
    ['json', (out: string) => (JSON.parse(out) as { tool: { name: string } }).tool.name],
    ['sarif', (out: string) => (JSON.parse(out) as { version: string }).version],
    ['markdown', (out: string) => out.split('\n')[0]],
    ['text', (out: string) => out.split('\n')[0]?.startsWith('SiftCode scan:')],
  ])('prints the %s report to stdout', async (format, check) => {
    const { code, stdout } = await runCli('scan', sample, '--format', format);

    expect(code).toBe(EXIT_OK);
    expect(check(stdout)).toBeTruthy();
  });

  it('rejects an unknown format and lists the allowed ones', async () => {
    const { code, stderr } = await runCli('scan', sample, '--format', 'xml');

    expect(code).toBe(EXIT_USAGE);
    expect(stderr).toContain(
      'Invalid value "xml" for --format. Allowed values: text, json, markdown, sarif.',
    );
  });

  it('writes the report to a file with --output and leaves stdout empty', async () => {
    const folder = await projects.create({});
    const target = join(folder, 'report.json');

    const { code, stdout, stderr } = await runCli('scan', sample, '-f', 'json', '-o', target);

    expect(code).toBe(EXIT_OK);
    expect(stdout).toBe('');
    expect(stderr).toContain(`Wrote json report to ${target}`);
    expect(
      (JSON.parse(await readFile(target, 'utf8')) as { schemaVersion: number }).schemaVersion,
    ).toBe(1);
  });

  it('exits 2 when the output file cannot be written', async () => {
    const folder = await projects.create({});

    const { code, stderr } = await runCli(
      'scan',
      sample,
      '-o',
      join(folder, 'no-such-dir', 'r.txt'),
    );

    expect(code).toBe(EXIT_USAGE);
    expect(stderr).toContain('Cannot write the report');
  });
});

describe('exit codes (US-006)', () => {
  it('exits 0 when there are findings but no --fail-on', async () => {
    const folder = await oneFinding();

    const { code, stdout } = await runCli('scan', folder);

    expect(code).toBe(EXIT_OK);
    expect(stdout).toContain('Findings: 1');
  });

  it('exits 1 when a finding is at or above --fail-on', async () => {
    const folder = await oneFinding();

    expect((await runCli('scan', folder, '--fail-on', 'info')).code).toBe(EXIT_FINDINGS);
    expect((await runCli('scan', folder, '--fail-on', 'note')).code).toBe(EXIT_FINDINGS);
  });

  it('exits 0 when every finding is below --fail-on', async () => {
    const folder = await oneFinding();

    expect((await runCli('scan', folder, '--fail-on', 'warning')).code).toBe(EXIT_OK);
    expect((await runCli('scan', folder, '--fail-on', 'error')).code).toBe(EXIT_OK);
  });

  it('exits 0 when --fail-on is set but nothing was found', async () => {
    expect((await runCli('scan', sample, '--fail-on', 'note')).code).toBe(EXIT_OK);
  });

  it('takes the threshold from failOn in the config, which the flag overrides', async () => {
    const folder = await oneFinding({
      failOn: 'info',
      rules: { 'SC-MET-001': { options: { maxLines: 3 } } },
    });

    expect((await runCli('scan', folder)).code).toBe(EXIT_FINDINGS);
    expect((await runCli('scan', folder, '--fail-on', 'error')).code).toBe(EXIT_OK);
  });

  it('rejects an unknown --fail-on value with exit 2', async () => {
    const { code, stderr } = await runCli('scan', sample, '--fail-on', 'fatal');

    expect(code).toBe(EXIT_USAGE);
    expect(stderr).toContain('Allowed values: error, warning, info, note.');
  });

  it('still reports findings in the other files when a file does not parse, exit 0', async () => {
    const folder = await projects.create({
      'good.js': longJsFunction('work', 6),
      'broken.py': 'def broken(:\n',
      'siftcode.config.json': '{"rules":{"SC-MET-001":{"options":{"maxLines":3}}}}',
    });

    const { code, stdout } = await runCli('scan', folder);

    expect(code).toBe(EXIT_OK);
    expect(stdout).toContain('good.js:1');
    expect(stdout).toContain('broken.py has syntax errors');
  });
});

describe('config handling (US-002)', () => {
  it('exits 2 and names the bad key for an invalid config', async () => {
    const folder = await projects.create({ 'siftcode.config.json': '{"failOn":"fatal"}' });

    const { code, stderr } = await runCli('scan', folder);

    expect(code).toBe(EXIT_USAGE);
    expect(stderr).toContain('failOn');
  });

  it('uses the file named by --config', async () => {
    const folder = await projects.create({
      'a.js': longJsFunction('work', 6),
      'strict.json': '{"rules":{"SC-MET-001":{"options":{"maxLines":3}}}}',
    });

    const { stdout } = await runCli('scan', folder, '--config', join(folder, 'strict.json'));

    expect(stdout).toContain('Findings: 1');
  });
});

describe('explain command (US-041)', () => {
  it('shows the rule, why it matters, what to do, an example, and the standards', async () => {
    const { code, stdout } = await runCli('explain', 'SC-MET-001');

    expect(code).toBe(EXIT_OK);
    expect(stdout).toContain('SC-MET-001  Function or method is too long');
    expect(stdout).toContain('Why it matters');
    expect(stdout).toContain('What to do');
    expect(stdout).toContain('Before');
    expect(stdout).toContain('After');
    expect(stdout).toContain('Refactoring (Fowler): Extract Function');
  });

  it('accepts the rule id in any letter case', async () => {
    expect((await runCli('explain', 'sc-met-001')).code).toBe(EXIT_OK);
  });

  it('exits 2 and lists the known rules for an unknown id', async () => {
    const { code, stderr } = await runCli('explain', 'SC-NOPE-1');

    expect(code).toBe(EXIT_USAGE);
    expect(stderr).toContain(
      'Unknown rule "SC-NOPE-1". Known rules: SC-MET-001, SC-MET-002, SC-MET-003, SC-MET-004, SC-MET-005.',
    );
  });

  it('exits 2 when no id is given', async () => {
    const { code, stderr } = await runCli('explain');

    expect(code).toBe(EXIT_USAGE);
    expect(stderr).toContain('exactly one rule id');
  });
});
