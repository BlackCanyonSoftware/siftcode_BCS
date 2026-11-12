// Writes the CycloneDX SBOM of what the package ships: its production dependencies, at the versions
// in package-lock.json. Usage: node scripts/make-sbom.mjs [output-file] (default: sbom.cdx.json).
//
// `npm sbom --omit dev` run in the repository leaves out a production dependency that also appears
// at another version in the development tree (here `ignore`, which ESLint also uses), and the
// result looks complete. So this builds the SBOM from a clean copy that has no development
// dependencies, with the locked versions, and then checks that every dependency declared in
// package.json is in it, and fails if one is not.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { run } from './npm.mjs';
import { sbomProblems } from './sbom-check.mjs';

const root = resolve(import.meta.dirname, '..');
const output = resolve(process.argv[2] ?? join(root, 'sbom.cdx.json'));
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const work = mkdtempSync(join(tmpdir(), 'siftcode-sbom-'));
try {
  // The folder is named like the package: the SBOM's root component takes its name from it in
  // some npm versions.
  const copy = join(work, manifest.name);
  mkdirSync(copy);
  copyFileSync(join(root, 'package-lock.json'), join(copy, 'package-lock.json'));
  copyFileSync(join(root, '.npmrc'), join(copy, '.npmrc'));
  const production = { ...manifest };
  delete production.devDependencies;
  delete production.scripts;
  writeFileSync(join(copy, 'package.json'), JSON.stringify(production, null, 2));

  const install = run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: copy,
  });
  if (install.code !== 0) {
    throw new Error(`installing the production dependencies failed:\n${install.stderr}`);
  }
  const made = run('npm', ['sbom', '--sbom-format', 'cyclonedx'], { cwd: copy });
  if (made.code !== 0) {
    throw new Error(`npm sbom failed:\n${made.stderr}`);
  }

  const sbom = JSON.parse(made.stdout);
  const components = sbom.components ?? [];
  const problems = sbomProblems(sbom, manifest);
  if (problems.length > 0) {
    throw new Error(`The SBOM is not complete:\n  - ${problems.join('\n  - ')}`);
  }

  writeFileSync(output, made.stdout);
  console.log(
    `Wrote ${output}: ${manifest.name}@${manifest.version} with ${components.length} components (${components.map((c) => `${c.name}@${c.version}`).join(', ')}).`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
