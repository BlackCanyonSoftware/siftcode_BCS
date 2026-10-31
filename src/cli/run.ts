import { parseArgs } from 'node:util';
import { UsageError } from '../core/errors.js';
import { scan, type ScanResult } from '../core/scan.js';
import { readVersion } from './version.js';

export interface Output {
  stdout(text: string): void;
  stderr(text: string): void;
}

export const EXIT_OK = 0;
export const EXIT_USAGE = 2;

const USAGE = `Usage: siftcode scan <path>

Scans a folder (or one file) and summarizes what SiftCode can read.

Options:
  -h, --help       Show this help
  -v, --version    Show the version

Exit codes: 0 success, 2 usage or configuration error.
`;

function formatScan(result: ScanResult): string {
  const noun = result.filesScanned === 1 ? 'file' : 'files';
  const lines = [`SiftCode scan: ${result.root}`, `Scanned ${result.filesScanned} ${noun}`];
  const width = Math.max(0, ...result.byLanguage.map(([language]) => language.length));
  for (const [language, count] of result.byLanguage) {
    lines.push(`  ${language.padEnd(width)}  ${count}`);
  }
  if (result.problems.length > 0) {
    lines.push(`Files with problems: ${result.problems.length}`);
    for (const problem of result.problems) {
      lines.push(`  ${problem.path} (${problem.reason})`);
    }
  }
  const { unsupported, tooLarge, symlinks } = result.skipped;
  lines.push(
    `Skipped: ${unsupported} unsupported, ${tooLarge} too large, ${symlinks} symbolic links`,
  );
  return `${lines.join('\n')}\n`;
}

/** Runs the CLI and returns the process exit code. Never throws for user mistakes. */
export async function run(argv: readonly string[], output: Output): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });

    if (values.help) {
      output.stdout(USAGE);
      return EXIT_OK;
    }
    if (values.version) {
      output.stdout(`${readVersion()}\n`);
      return EXIT_OK;
    }

    const [command, path, ...extra] = positionals;
    if (command !== 'scan') {
      throw new UsageError(
        command === undefined ? 'Missing command.' : `Unknown command "${command}".`,
      );
    }
    if (path === undefined || extra.length > 0) {
      throw new UsageError('The scan command takes exactly one path.');
    }

    output.stdout(formatScan(await scan(path)));
    return EXIT_OK;
  } catch (error) {
    if (error instanceof UsageError || isArgumentError(error)) {
      output.stderr(`siftcode: ${error.message}\n\n${USAGE}`);
      return EXIT_USAGE;
    }
    throw error;
  }
}

/** `parseArgs` signals unknown or malformed options with an error code starting `ERR_PARSE_ARGS`. */
function isArgumentError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('ERR_PARSE_ARGS')
  );
}
