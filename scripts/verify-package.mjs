// Checks the package exactly as a user would receive it: packs the tarball, reviews what is in it,
// installs it into an empty project, and runs the installed command. Run `npm run build` first
// (`npm run release:check` does both). Exits 1 and lists every problem if anything is wrong.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { run } from './npm.mjs';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const problems = [];
const fail = (message) => problems.push(message);

/** The size budgets: a package that grows past these should be looked at, not waved through. */
const MAX_PACKED_BYTES = 2 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 12 * 1024 * 1024;
const MAX_FILES = 400;

/** Files a user needs, as paths in the tarball. */
const REQUIRED = [
  'package.json',
  'README.md',
  'LICENSE',
  'NOTICE',
  'CHANGELOG.md',
  manifest.bin.siftcode,
  'dist/index.js',
  'grammars/tree-sitter-javascript.wasm',
  'grammars/tree-sitter-typescript.wasm',
  'grammars/tree-sitter-tsx.wasm',
  'grammars/tree-sitter-python.wasm',
  'grammars/tree-sitter-c_sharp.wasm',
  'data/licenses/ids.json',
  'data/licenses/texts.json',
  'assets/report/report.css',
  'assets/report/report.js',
  'assets/brand/template/tokens.css',
  'assets/brand/font/jetbrainsmono.woff',
  'assets/brand/font/publicsans.woff',
  'assets/brand/font/JetBrainsMono-LICENCE.txt',
  'assets/brand/font/PublicSans-LICENCE.txt',
];

/** Paths that must never be shipped: sources, tests, docs, tooling, secrets, and maps to sources. */
const FORBIDDEN = [
  [/^src\//, 'TypeScript sources'],
  [/^test\//, 'tests and fixtures'],
  [/^docs\//, 'project documentation'],
  [/^scripts\//, 'build scripts'],
  [/^\.github\//, 'CI configuration'],
  [/(^|\/)node_modules\//, 'dependencies'],
  [/(^|\/)\.env/, 'an environment file'],
  [/\.map$/, 'source maps that point at files that are not shipped'],
  [/(^|\/)\.git/, 'Git data'],
  [/sbom/i, 'an SBOM (it is attached to the release instead)'],
];

const work = mkdtempSync(join(tmpdir(), 'siftcode-package-'));
try {
  // 1. Pack the real tarball.
  const packed = run('npm', ['pack', '--json', '--pack-destination', work], { cwd: root });
  if (packed.code !== 0) {
    throw new Error(`npm pack failed:\n${packed.stderr}`);
  }
  const [info] = JSON.parse(packed.stdout);
  const tarball = join(work, info.filename);
  const paths = info.files.map((file) => file.path);

  // 2. Review what is in it.
  for (const path of REQUIRED) {
    if (!paths.includes(path)) fail(`missing from the package: ${path}`);
  }
  for (const [pattern, what] of FORBIDDEN) {
    const found = paths.filter((path) => pattern.test(path));
    if (found.length > 0) {
      const examples = found.slice(0, 3).join(', ');
      fail(
        `${found.length} file${found.length === 1 ? ' is' : 's are'} in the package that should not be (${what}), for example ${examples}`,
      );
    }
  }
  if (info.size > MAX_PACKED_BYTES)
    fail(`packed size ${info.size} bytes is over the ${MAX_PACKED_BYTES} budget`);
  if (info.unpackedSize > MAX_UNPACKED_BYTES)
    fail(`unpacked size ${info.unpackedSize} bytes is over the ${MAX_UNPACKED_BYTES} budget`);
  if (paths.length > MAX_FILES) fail(`${paths.length} files is over the ${MAX_FILES} budget`);

  // 3. Install it into an empty project, the way a user would, with install scripts off.
  writeFileSync(join(work, 'package.json'), '{"name":"smoke","version":"1.0.0","private":true}\n');
  const install = run(
    'npm',
    ['install', tarball, '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', work],
    { cwd: work },
  );
  if (install.code !== 0) throw new Error(`npm install of the tarball failed:\n${install.stderr}`);

  const bin = join(work, 'node_modules', 'siftcode', ...manifest.bin.siftcode.split('/'));
  const siftcode = (...args) => run(process.execPath, [bin, ...args], { shell: false, cwd: work });
  const sample = join(root, 'test', 'fixtures', 'sample');

  const version = siftcode('--version');
  if (version.code !== 0 || version.stdout.trim() !== manifest.version) {
    fail(
      `the installed command reports version "${version.stdout.trim()}", expected ${manifest.version}`,
    );
  }
  const scanned = siftcode('scan', sample);
  if (
    scanned.code !== 0 ||
    !/Scanned \d+ files/.test(scanned.stdout) ||
    !/C#/.test(scanned.stdout)
  ) {
    fail(
      `scanning the sample project with the installed command failed:\n${scanned.stdout}${scanned.stderr}`,
    );
  }
  const html = siftcode('scan', sample, '--format', 'html');
  if (
    html.code !== 0 ||
    !html.stdout.startsWith('<!doctype html>') ||
    !html.stdout.includes('url("data:font/woff;base64,')
  ) {
    fail(
      'the installed command did not produce a self-contained HTML report (are the assets in the package?)',
    );
  }
  const sarif = siftcode('scan', sample, '--format', 'sarif');
  try {
    if (JSON.parse(sarif.stdout).version !== '2.1.0')
      fail('the installed SARIF report is not version 2.1.0');
  } catch {
    fail('the installed command did not produce valid SARIF');
  }
  const explained = siftcode('explain', 'SC-MET-001');
  if (explained.code !== 0 || !explained.stdout.includes('Function or method is too long')) {
    fail('the installed `explain` command failed');
  }
  const json = siftcode('scan', sample, '--format', 'json');
  if (json.code !== 0 || !json.stdout.includes('"schemaVersion"')) {
    fail('the installed command did not produce a JSON report');
  }

  console.log(
    `${info.name}@${info.version}: ${paths.length} files, ${(info.size / 1024).toFixed(0)} KB packed, ${(info.unpackedSize / 1024).toFixed(0)} KB unpacked`,
  );
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (problems.length > 0) {
  console.error(`\nThe package has ${problems.length} problem${problems.length === 1 ? '' : 's'}:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('The package is complete, free of what must not ship, and works when installed.');
