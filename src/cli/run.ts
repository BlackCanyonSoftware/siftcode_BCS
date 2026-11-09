import { UsageError } from '../core/errors.js';
import { baselineCommand } from './baseline-command.js';
import { explainCommand } from './explain-command.js';
import { EXIT_OK, EXIT_USAGE, type Output } from './output.js';
import { scanCommand } from './scan-command.js';
import { USAGE } from './usage.js';
import { readVersion } from './version.js';

export { EXIT_FINDINGS, EXIT_OK, EXIT_USAGE, type Output } from './output.js';

/** Runs the CLI and returns the process exit code. Never throws for user mistakes. */
export async function run(argv: readonly string[], output: Output): Promise<number> {
  try {
    return await dispatch(argv, output);
  } catch (error) {
    if (error instanceof UsageError || isArgumentError(error)) {
      output.stderr(`siftcode: ${error.message}\n\n${USAGE}`);
      return EXIT_USAGE;
    }
    throw error;
  }
}

async function dispatch(argv: readonly string[], output: Output): Promise<number> {
  const [command, ...args] = argv;
  switch (command) {
    case undefined:
      throw new UsageError('Missing command.');
    case '-h':
    case '--help':
      output.stdout(USAGE);
      return EXIT_OK;
    case '-v':
    case '--version':
      output.stdout(`${readVersion()}\n`);
      return EXIT_OK;
    case 'scan':
      return scanCommand(args, output);
    case 'baseline':
      return baselineCommand(args, output);
    case 'explain':
      return explainCommand(args, output);
    default:
      throw new UsageError(`Unknown command "${command}".`);
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
