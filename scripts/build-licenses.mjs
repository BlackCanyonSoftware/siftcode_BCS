// Writes data/licenses/ids.json (every SPDX license id with its name and OSI status) and
// data/licenses/texts.json (the text of the licenses SiftCode can recognize in a LICENSE file)
// from the dev-only package `spdx-license-list` (CC0-1.0, data from github.com/spdx/license-list-data).
// Run it when the SPDX list should be refreshed: `npm run build:licenses`. The output is committed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, URL } from 'node:url';

const require = createRequire(import.meta.url);
const list = JSON.parse(readFileSync(require.resolve('spdx-license-list/spdx-full.json'), 'utf8'));
const { version } = JSON.parse(
  readFileSync(require.resolve('spdx-license-list/package.json'), 'utf8'),
);

/** Licenses whose text can be matched: those in the compatibility table plus the common ones. */
const RECOGNIZED = [
  // permissive
  'MIT',
  'MIT-0',
  'Apache-2.0',
  'Apache-1.1',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BSD-3-Clause-Clear',
  'BSD-4-Clause',
  '0BSD',
  'ISC',
  'Zlib',
  'BSL-1.0',
  'PostgreSQL',
  'NCSA',
  'X11',
  'Python-2.0',
  'PSF-2.0',
  'Unicode-3.0',
  'Unicode-DFS-2016',
  'BlueOak-1.0.0',
  'UPL-1.0',
  'Artistic-2.0',
  'AFL-3.0',
  'OFL-1.1',
  'MS-PL',
  'WTFPL',
  'CC-BY-3.0',
  'CC-BY-4.0',
  // public domain
  'Unlicense',
  'CC0-1.0',
  // weak copyleft
  'MPL-1.1',
  'MPL-2.0',
  'EPL-1.0',
  'EPL-2.0',
  'CDDL-1.0',
  'CDDL-1.1',
  'LGPL-2.1-only',
  'LGPL-2.1-or-later',
  'LGPL-3.0-only',
  'LGPL-3.0-or-later',
  'MS-RL',
  'EUPL-1.2',
  'OSL-3.0',
  'CC-BY-SA-4.0',
  // strong and network copyleft
  'GPL-2.0-only',
  'GPL-2.0-or-later',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'AGPL-3.0-only',
  'AGPL-3.0-or-later',
  // not open source: restrictions on use
  'SSPL-1.0',
  'BUSL-1.1',
  'Elastic-2.0',
  'CC-BY-NC-4.0',
  'CC-BY-NC-SA-4.0',
  'CC-BY-ND-4.0',
];

const ids = Object.entries(list)
  .map(([id, entry]) => ({ id, name: entry.name, osi: entry.osiApproved === true }))
  .sort((a, b) => (a.id < b.id ? -1 : 1));

const texts = {};
const missing = [];
for (const id of RECOGNIZED) {
  if (list[id]) {
    texts[id] = list[id].licenseText;
  } else {
    missing.push(id);
  }
}
if (missing.length > 0) {
  throw new Error(`Not in the SPDX list from spdx-license-list ${version}: ${missing.join(', ')}`);
}

const outDir = fileURLToPath(new URL('../data/licenses/', import.meta.url));
mkdirSync(outDir, { recursive: true });
writeFileSync(
  `${outDir}ids.json`,
  `${JSON.stringify({ source: `spdx-license-list ${version}`, licenses: ids })}\n`,
);
writeFileSync(`${outDir}texts.json`, `${JSON.stringify(texts)}\n`);
console.log(
  `Wrote ${ids.length} license ids and ${Object.keys(texts).length} license texts (spdx-license-list ${version}).`,
);
