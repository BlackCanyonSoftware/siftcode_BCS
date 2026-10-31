// Copies the compiled tree-sitter grammars (.wasm) and their licenses out of the
// grammar packages in node_modules into ./grammars, which is what ships in the
// npm package. The grammar packages are devDependencies only: they carry tens of
// megabytes of C sources and native-build scripts we never use.
//
// The list of grammars lives in src/languages/grammars.json so the runtime and this
// script cannot disagree about file names.

import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'grammars');
const grammars = JSON.parse(await readFile(join(root, 'src/languages/grammars.json'), 'utf8'));

await rm(outDir, { recursive: true, force: true });
await mkdir(join(outDir, 'licenses'), { recursive: true });

const manifest = {};
for (const [id, { package: pkg, file }] of Object.entries(grammars)) {
  const pkgDir = join(root, 'node_modules', pkg);
  try {
    await copyFile(join(pkgDir, file), join(outDir, file));
    await copyFile(join(pkgDir, 'LICENSE'), join(outDir, 'licenses', `${pkg}.LICENSE`));
    const { version, license } = JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf8'));
    manifest[id] = { package: pkg, version, license, file };
  } catch (error) {
    console.error(
      `Could not copy grammar "${id}" from ${pkg}: ${error.message}\nRun "npm ci" first.`,
    );
    process.exit(1);
  }
}

await writeFile(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Copied ${Object.keys(manifest).length} grammars to ${outDir}`);
