// Downloads the official SARIF 2.1.0 JSON schema so the tests can check our SARIF output against
// it. The schema is OASIS-published and its redistribution terms are not a standard open-source
// license, so it is fetched into a git-ignored cache instead of being committed.
//
// The download is verified against a pinned SHA-256. The same bytes are served by the canonical
// OASIS URL and by github.com/oasis-tcs/sarif-spec (sarif-2.1/schema).

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const URL_OF_SCHEMA =
  'https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json';
const EXPECTED_SHA256 = 'c3b4bb2d6093897483348925aaa73af03b3e3f4bd4ca38cef26dcb4212a2682e';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'test/.cache/sarif-schema-2.1.0.json');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const cached = await readFile(target).catch(() => undefined);
if (cached && sha256(cached) === EXPECTED_SHA256) {
  process.exit(0);
}

let bytes;
try {
  const response = await fetch(URL_OF_SCHEMA);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  bytes = Buffer.from(await response.arrayBuffer());
} catch (error) {
  console.error(`Could not download the SARIF schema from ${URL_OF_SCHEMA}: ${error.message}`);
  process.exit(1);
}

if (sha256(bytes) !== EXPECTED_SHA256) {
  console.error('The downloaded SARIF schema does not match the pinned SHA-256; not using it.');
  process.exit(1);
}

await mkdir(dirname(target), { recursive: true });
await writeFile(target, bytes);
console.log(`Saved the SARIF 2.1.0 schema to ${target}`);
