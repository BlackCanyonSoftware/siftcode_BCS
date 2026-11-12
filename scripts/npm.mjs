// Runs npm, or any other program, from the release scripts without a shell. npm is started through
// its own JavaScript entry point with this Node, so it works the same on Windows, macOS, and Linux.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * npm's own script: `npm run` sets `npm_execpath`; otherwise look beside the Node install (Windows)
 * or in its `lib` folder (Unix).
 */
function npmScript() {
  const fromNpm = process.env.npm_execpath;
  if (fromNpm?.endsWith('npm-cli.js')) {
    return fromNpm;
  }
  const bin = dirname(process.execPath);
  return [
    join(bin, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(bin, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].find((candidate) => existsSync(candidate));
}

const NPM = npmScript();

/** Runs `command` with `args` and returns its exit code and output. `npm` means this Node's npm. */
export function run(command, args, options = {}) {
  const [program, programArgs] =
    command === 'npm' && NPM !== undefined ? [process.execPath, [NPM, ...args]] : [command, args];
  const result = spawnSync(program, programArgs, { encoding: 'utf8', ...options });
  return { code: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}
