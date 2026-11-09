import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from '../config/load.js';
import { BASELINE_FILE_NAME, createBaseline } from '../core/baseline.js';
import { UsageError } from '../core/errors.js';
import { scan } from '../core/scan.js';
import { plural } from '../reporters/shared.js';
import { configuredBaselinePath, scannedFolder, writeBaselineFile } from './baseline-file.js';
import { EXIT_OK, type Output } from './output.js';
import { BASELINE_USAGE } from './usage.js';

/**
 * `siftcode baseline <path>`: accepts every finding the scan reports now (after inline
 * suppressions), so that later scans report only new ones.
 */
export async function baselineCommand(args: readonly string[], output: Output): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...args],
    allowPositionals: true,
    options: {
      output: { type: 'string', short: 'o' },
      config: { type: 'string', short: 'c' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    output.stdout(BASELINE_USAGE);
    return EXIT_OK;
  }
  const [path, ...extra] = positionals;
  if (path === undefined || extra.length > 0) {
    throw new UsageError('The baseline command takes exactly one path.');
  }

  const config = await loadConfig({ scanPath: path, configPath: values.config });
  // The existing baseline is not applied: the new file lists everything that is found now.
  const result = await scan(path, { config });
  const target =
    values.output === undefined
      ? ((await configuredBaselinePath(path, config)) ??
        join(await scannedFolder(path), BASELINE_FILE_NAME))
      : resolve(values.output);

  await writeBaselineFile(target, createBaseline(result.findings));
  output.stdout(`Wrote a baseline of ${plural(result.findings.length, 'finding')} to ${target}\n`);
  return EXIT_OK;
}
