#!/usr/bin/env node
import { run } from './run.js';

try {
  process.exitCode = await run(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  });
} catch (error) {
  // An unexpected failure is a bug in SiftCode, not a user mistake: say so plainly.
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`siftcode: internal error: ${message}\n`);
  if (process.env.SIFTCODE_DEBUG && error instanceof Error && error.stack) {
    process.stderr.write(`${error.stack}\n`);
  }
  process.exitCode = 70;
}
