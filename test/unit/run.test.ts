import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EXIT_OK, EXIT_USAGE, run } from '../../src/cli/run.js';

const sample = fileURLToPath(new URL('../fixtures/sample', import.meta.url));

async function runCli(...argv: string[]) {
  let stdout = '';
  let stderr = '';
  const code = await run(argv, {
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
  });
  return { code, stdout, stderr };
}

describe('run (US-001)', () => {
  it('prints a summary and exits 0 for a valid scan', async () => {
    const { code, stdout, stderr } = await runCli('scan', sample);

    expect(code).toBe(EXIT_OK);
    expect(stdout).toContain('Scanned 5 files');
    expect(stdout).toMatch(/C#\s+1/);
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
    expect(stderr).toContain('Usage: siftcode scan <path>');
  });

  it('exits 2 for an unknown option', async () => {
    const { code, stderr } = await runCli('scan', sample, '--bogus');

    expect(code).toBe(EXIT_USAGE);
    expect(stderr).toContain('--bogus');
  });

  it('prints help and exits 0', async () => {
    const { code, stdout } = await runCli('--help');

    expect(code).toBe(EXIT_OK);
    expect(stdout).toContain('Usage: siftcode scan <path>');
  });

  it('prints the package version and exits 0', async () => {
    const { code, stdout } = await runCli('--version');

    expect(code).toBe(EXIT_OK);
    expect(stdout).toMatch(/^\d+\.\d+\.\d+/);
  });
});
