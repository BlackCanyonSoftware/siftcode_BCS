import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Config } from '../config/schema.js';
import { parseBaseline, serializeBaseline, type Baseline } from '../core/baseline.js';
import { UsageError } from '../core/errors.js';

/** The folder being scanned, or the folder of the file being scanned. */
export async function scannedFolder(scanPath: string): Promise<string> {
  const absolute = resolve(scanPath);
  const info = await stat(absolute).catch(() => undefined);
  return info?.isDirectory() === false ? dirname(absolute) : absolute;
}

/**
 * Where the baseline is: the `--baseline` flag (relative to the working folder), else the config's
 * `baseline` (relative to the scanned folder), else nowhere.
 */
export async function configuredBaselinePath(
  scanPath: string,
  config: Config,
  flag?: string,
): Promise<string | undefined> {
  if (flag !== undefined) {
    return resolve(flag);
  }
  return config.baseline === undefined
    ? undefined
    : resolve(await scannedFolder(scanPath), config.baseline);
}

export async function readBaselineFile(file: string): Promise<Baseline> {
  const text = await readFile(file, 'utf8').catch(() => undefined);
  if (text === undefined) {
    throw new UsageError(
      `Baseline file not found: ${file}. Create it with "siftcode baseline <path>".`,
    );
  }
  return parseBaseline(text, file);
}

export async function writeBaselineFile(file: string, baseline: Baseline): Promise<void> {
  try {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, serializeBaseline(baseline), 'utf8');
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new UsageError(`Cannot write the baseline to ${file}: ${reason}`);
  }
}
