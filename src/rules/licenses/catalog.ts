import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** `data/licenses/` sits three levels above this file in both `src/` and `dist/`. */
const DATA_DIR = fileURLToPath(new URL('../../../data/licenses/', import.meta.url));

const ListSchema = z.object({
  source: z.string(),
  licenses: z.array(z.object({ id: z.string(), name: z.string(), osi: z.boolean() })),
});
const TextsSchema = z.record(z.string(), z.string());

export interface LicenseEntry {
  /** SPDX identifier, in its official letter case. */
  readonly id: string;
  readonly name: string;
  /** Approved by the Open Source Initiative. */
  readonly osi: boolean;
}

/** The SPDX license list SiftCode ships, and the full text of the licenses it can recognize. */
export interface Catalog {
  /** Where the list came from, e.g. `spdx-license-list 6.12.0`. */
  readonly source: string;
  /** Every SPDX license id (including deprecated ones), looked up by lowercase id. */
  readonly entries: ReadonlyMap<string, LicenseEntry>;
  /** Full text of the recognizable licenses, by SPDX id. */
  readonly texts: ReadonlyMap<string, string>;
}

let cached: Promise<Catalog> | undefined;

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(`${DATA_DIR}${file}`, 'utf8')) as unknown;
}

async function load(): Promise<Catalog> {
  try {
    const list = ListSchema.parse(await readJson('ids.json'));
    const texts = TextsSchema.parse(await readJson('texts.json'));
    return {
      source: list.source,
      entries: new Map(list.licenses.map((entry) => [entry.id.toLowerCase(), entry])),
      texts: new Map(Object.entries(texts)),
    };
  } catch (error) {
    throw new Error(
      `Could not load the bundled license data from ${DATA_DIR}: ${error instanceof Error ? error.message : String(error)}. Run "npm run build:licenses".`,
      { cause: error },
    );
  }
}

/** Loads the bundled SPDX data once per process. */
export function loadCatalog(): Promise<Catalog> {
  cached ??= load();
  return cached;
}
