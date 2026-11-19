import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { loadConfig } from '../config/load.js';
import type { Config } from '../config/schema.js';
import type { Baseline } from '../core/baseline.js';
import { UsageError } from '../shared/errors.js';
import { scan } from '../core/scan.js';
import { SEVERITIES, isAtLeast } from '../shared/severity.js';
import { REPORT_FORMATS, renderReport } from '../reporters/index.js';
import { withAiSuggestions } from './ai-suggestions.js';
import { configuredBaselinePath, readBaselineFile } from './baseline-file.js';
import { EXIT_FINDINGS, EXIT_OK, type Output } from './output.js';
import { USAGE } from './usage.js';
import { readVersion } from './version.js';

export async function scanCommand(args: readonly string[], output: Output): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...args],
    allowPositionals: true,
    options: {
      format: { type: 'string', short: 'f' },
      output: { type: 'string', short: 'o' },
      config: { type: 'string', short: 'c' },
      baseline: { type: 'string' },
      'fail-on': { type: 'string' },
      ai: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    output.stdout(USAGE);
    return EXIT_OK;
  }

  const [path, ...extra] = positionals;
  if (path === undefined || extra.length > 0) {
    throw new UsageError('The scan command takes exactly one path.');
  }
  const format = chooseOption('--format', values.format, REPORT_FORMATS) ?? 'text';
  const flagFailOn = chooseOption('--fail-on', values['fail-on'], SEVERITIES);

  const config = await loadConfig({ scanPath: path, configPath: values.config });
  const baseline = await loadBaseline(path, config, values.baseline);
  const scanned = await scan(path, { config, ...(baseline === undefined ? {} : { baseline }) });
  const result = values.ai ? await withAiSuggestions(scanned, config, output) : scanned;
  await emit(
    renderReport(format, result, { version: readVersion() }),
    format,
    values.output,
    output,
  );

  const failOn = flagFailOn ?? config.failOn;
  const failed = failOn !== undefined && result.findings.some((f) => isAtLeast(f.severity, failOn));
  return failed ? EXIT_FINDINGS : EXIT_OK;
}

/** Prints the report, or writes it to the file the `--output` flag named. */
async function emit(
  report: string,
  format: string,
  file: string | undefined,
  output: Output,
): Promise<void> {
  if (file === undefined) {
    output.stdout(report);
    return;
  }
  await writeReport(file, report);
  output.stderr(`Wrote ${format} report to ${file}\n`);
}

/** The baseline named by the flag or the config, or `undefined` when the scan has none. */
async function loadBaseline(
  scanPath: string,
  config: Config,
  flag: string | undefined,
): Promise<Baseline | undefined> {
  const file = await configuredBaselinePath(scanPath, config, flag);
  return file === undefined ? undefined : readBaselineFile(file);
}

/** Returns the value if it is one of `choices`, undefined if the flag was not given. */
function chooseOption<T extends string>(
  flag: string,
  value: string | undefined,
  choices: readonly T[],
): T | undefined {
  if (value === undefined) {
    return undefined;
  }
  const match = choices.find((choice) => choice === value);
  if (match === undefined) {
    throw new UsageError(
      `Invalid value "${value}" for ${flag}. Allowed values: ${choices.join(', ')}.`,
    );
  }
  return match;
}

async function writeReport(path: string, report: string): Promise<void> {
  try {
    await writeFile(path, report, 'utf8');
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new UsageError(`Cannot write the report to ${path}: ${reason}`);
  }
}
