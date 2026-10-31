import { readFileSync } from 'node:fs';

/** Reads the version from package.json, which sits two levels above `src/cli` and `dist/cli`. */
export function readVersion(): string {
  const manifest = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { version: string };
  return manifest.version;
}
