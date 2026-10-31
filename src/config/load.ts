import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { UsageError } from '../core/errors.js';
import { describeIssues } from '../core/issues.js';
import { DEFAULT_CONFIG, configSchema, type Config } from './schema.js';

export const CONFIG_FILE_NAME = 'siftcode.config.json';

export interface LoadConfigOptions {
  /** The path being scanned; the config is looked for in this folder (or the file's folder). */
  readonly scanPath: string;
  /** A config file named on the command line; it must exist. */
  readonly configPath?: string | undefined;
}

/** Loads and validates the config, or returns the defaults when there is no config file. */
export async function loadConfig(options: LoadConfigOptions): Promise<Config> {
  const scanned = await stat(resolve(options.scanPath)).catch(() => undefined);
  if (!scanned) {
    throw new UsageError(`Path not found: ${options.scanPath}`);
  }

  if (options.configPath !== undefined) {
    const text = await readFile(resolve(options.configPath), 'utf8').catch(() => undefined);
    if (text === undefined) {
      throw new UsageError(`Config file not found: ${options.configPath}`);
    }
    return parseConfig(text, options.configPath);
  }

  const folder = scanned.isDirectory()
    ? resolve(options.scanPath)
    : dirname(resolve(options.scanPath));
  const file = join(folder, CONFIG_FILE_NAME);
  const text = await readFile(file, 'utf8').catch(() => undefined);
  return text === undefined ? DEFAULT_CONFIG : parseConfig(text, file);
}

/** Validates config text; `source` names the file in error messages. */
export function parseConfig(text: string, source: string): Config {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new UsageError(`Invalid JSON in ${source}: ${reason}`);
  }
  const parsed = configSchema.safeParse(json);
  if (!parsed.success) {
    throw new UsageError(`Invalid config ${source}:\n${describeIssues(parsed.error)}`);
  }
  return parsed.data;
}
