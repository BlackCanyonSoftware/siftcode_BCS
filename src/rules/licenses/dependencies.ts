import { posix } from 'node:path';
import {
  directoryOf,
  npmLicense,
  readManifests,
  type Ecosystem,
  type Manifest,
} from '../supply-chain/manifests.js';
import type { RepoView } from '../types.js';

/** One package the project depends on, with the license text found for it offline. */
export interface DependencyLicense {
  readonly ecosystem: Ecosystem;
  readonly name: string;
  readonly version?: string;
  /** The license as the package states it; undefined when nothing offline says. */
  readonly license?: string;
  /** The manifest the dependency belongs to: findings about it are shown there. */
  readonly manifest: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parseJson(text: string | undefined): Record<string, unknown> | undefined {
  try {
    const json: unknown = text === undefined ? undefined : JSON.parse(text);
    return isRecord(json) ? json : undefined;
  } catch {
    return undefined;
  }
}

/** The nearest folder at or above `directory` that holds one of `names`, as a path to that file. */
function findUp(repo: RepoView, directory: string, names: readonly string[]): string | undefined {
  for (let current = directory; ; current = posix.dirname(current)) {
    const found = names
      .map((name) => (current === '.' ? name : `${current}/${name}`))
      .find((path) => repo.has(path));
    if (found !== undefined || current === '.') {
      return found;
    }
  }
}

const runtimeDependencies = (manifest: Manifest) =>
  manifest.dependencies.filter((dependency) => !dependency.dev && dependency.pinning !== 'local');

// ---------- npm: package-lock.json, then installed packages

const NPM_LOCKS = ['package-lock.json', 'npm-shrinkwrap.json'];
const NODE_MODULES = 'node_modules/';

async function installedNpmLicense(repo: RepoView, folder: string): Promise<string | undefined> {
  const json = parseJson(await repo.read(`${folder}/package.json`));
  return json ? npmLicense(json) : undefined;
}

/** A lockfile entry that is a package installed for production (not a link or a development tool). */
function shippedEntry(key: string, entry: unknown): Record<string, unknown> | undefined {
  if (!isRecord(entry) || !key.includes(NODE_MODULES) || entry.link === true) {
    return undefined;
  }
  return entry.dev === true || entry.devOptional === true ? undefined : entry;
}

/** One entry of a lockfile's `packages`, if it is a package shipped with the project. */
async function lockedPackage(
  repo: RepoView,
  lockDir: string,
  key: string,
  raw: unknown,
  manifest: string,
): Promise<DependencyLicense | undefined> {
  const entry = shippedEntry(key, raw);
  if (!entry) {
    return undefined;
  }
  const marker = key.lastIndexOf(NODE_MODULES);
  const name =
    typeof entry.name === 'string' ? entry.name : key.slice(marker + NODE_MODULES.length);
  const license =
    npmLicense(entry) ??
    (await installedNpmLicense(repo, lockDir === '.' ? key : `${lockDir}/${key}`));
  return {
    ecosystem: 'npm',
    name,
    manifest,
    ...(typeof entry.version === 'string' ? { version: entry.version } : {}),
    ...(license === undefined ? {} : { license }),
  };
}

/** Every package the lockfile says is installed for production, with the license it records. */
async function npmFromLock(
  repo: RepoView,
  lockPath: string,
  manifest: string,
): Promise<DependencyLicense[] | undefined> {
  const packages = parseJson(await repo.read(lockPath))?.packages;
  if (!isRecord(packages)) {
    return undefined; // a version 1 lockfile does not record licenses
  }
  const lockDir = directoryOf(lockPath);
  const found = await Promise.all(
    Object.entries(packages).map(([key, entry]) =>
      lockedPackage(repo, lockDir, key, entry, manifest),
    ),
  );
  return found.filter((dependency) => dependency !== undefined);
}

/** The direct runtime dependencies of a manifest, with the license of each installed copy. */
async function installedDirect(repo: RepoView, manifest: Manifest): Promise<DependencyLicense[]> {
  const directory = directoryOf(manifest.path);
  const base = directory === '.' ? '' : `${directory}/`;
  return Promise.all(
    runtimeDependencies(manifest).map(async (dependency): Promise<DependencyLicense> => {
      const license = await installedNpmLicense(repo, `${base}${NODE_MODULES}${dependency.name}`);
      return {
        ecosystem: 'npm',
        name: dependency.name,
        manifest: manifest.path,
        ...(license === undefined ? {} : { license }),
      };
    }),
  );
}

/** Findings about a lockfile are shown at the package.json beside it, or the lockfile itself. */
function lockAnchor(repo: RepoView, lock: string): string {
  const lockDir = directoryOf(lock);
  const sibling = lockDir === '.' ? 'package.json' : `${lockDir}/package.json`;
  return repo.has(sibling) ? sibling : lock;
}

async function npmForManifest(
  repo: RepoView,
  manifest: Manifest,
  locksDone: Set<string>,
): Promise<DependencyLicense[]> {
  const lock = findUp(repo, directoryOf(manifest.path), NPM_LOCKS);
  if (lock === undefined) {
    return installedDirect(repo, manifest);
  }
  if (locksDone.has(lock)) {
    return []; // a workspace package: the lockfile at the top was already read
  }
  locksDone.add(lock);
  return (await npmFromLock(repo, lock, lockAnchor(repo, lock))) ?? installedDirect(repo, manifest);
}

async function npmDependencies(
  repo: RepoView,
  manifests: readonly Manifest[],
): Promise<DependencyLicense[]> {
  const locksDone = new Set<string>();
  const result: DependencyLicense[] = [];
  for (const manifest of manifests.filter((entry) => entry.ecosystem === 'npm')) {
    result.push(...(await npmForManifest(repo, manifest, locksDone)));
  }
  return result;
}

// ---------- Python: installed packages in a virtual environment

const VENV_FOLDERS = ['.venv', 'venv', 'env'];

/** The `site-packages` folder of the first virtual environment found in `directory`, if any. */
async function sitePackages(repo: RepoView, directory: string): Promise<string | undefined> {
  const base = directory === '.' ? '' : `${directory}/`;
  for (const venv of VENV_FOLDERS) {
    const entries = await repo.list(`${base}${venv}`);
    if (entries.includes('Lib')) {
      return `${base}${venv}/Lib/site-packages`;
    }
    if (entries.includes('lib')) {
      const python = (await repo.list(`${base}${venv}/lib`)).find((name) =>
        name.startsWith('python3'),
      );
      if (python !== undefined) {
        return `${base}${venv}/lib/${python}/site-packages`;
      }
    }
  }
  return undefined;
}

/** PEP 503: case and `-`, `_`, `.` do not make a different package name. */
const pythonKey = (name: string): string => name.toLowerCase().replace(/[-_.]+/g, '-');

/** Classifiers that name one SPDX license without doubt (`BSD License` does not: it is -2 or -3). */
const CLASSIFIER_LICENSES: Readonly<Record<string, string>> = {
  'MIT License': 'MIT',
  'Apache Software License': 'Apache-2.0',
  'ISC License (ISCL)': 'ISC',
  'Mozilla Public License 2.0 (MPL 2.0)': 'MPL-2.0',
  'The Unlicense (Unlicense)': 'Unlicense',
  'Python Software Foundation License': 'PSF-2.0',
  'Eclipse Public License 2.0 (EPL-2.0)': 'EPL-2.0',
  'GNU General Public License v2 (GPLv2)': 'GPL-2.0-only',
  'GNU General Public License v2 or later (GPLv2+)': 'GPL-2.0-or-later',
  'GNU General Public License v3 (GPLv3)': 'GPL-3.0-only',
  'GNU General Public License v3 or later (GPLv3+)': 'GPL-3.0-or-later',
  'GNU Lesser General Public License v3 (LGPLv3)': 'LGPL-3.0-only',
  'GNU Lesser General Public License v3 or later (LGPLv3+)': 'LGPL-3.0-or-later',
  'GNU Affero General Public License v3': 'AGPL-3.0-only',
  'GNU Affero General Public License v3 or later (AGPLv3+)': 'AGPL-3.0-or-later',
};

interface PythonMetadata {
  readonly version?: string;
  readonly license?: string;
  readonly requires: readonly string[];
}

/** The `Key: value` headers of a `METADATA` file (they end at the first blank line). */
function metadataFields(text: string): Map<string, string[]> {
  const header = text.split(/\r?\n\r?\n/, 1)[0] ?? '';
  const fields = new Map<string, string[]>();
  for (const line of header.split(/\r?\n/)) {
    const match = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
    if (match?.[1]) {
      fields.set(match[1], [...(fields.get(match[1]) ?? []), match[2] ?? '']);
    }
  }
  return fields;
}

/** The license of a package: the SPDX expression, a short `License` value, or a clear classifier. */
function metadataLicense(fields: ReadonlyMap<string, readonly string[]>): string | undefined {
  const plain = fields.get('License')?.[0];
  const short = plain !== undefined && plain.length <= 60 && plain.toUpperCase() !== 'UNKNOWN';
  const fromClassifier = (fields.get('Classifier') ?? [])
    .map((value) => /^License :: (?:OSI Approved :: )?(.+)$/.exec(value)?.[1])
    .map((name) => (name === undefined ? undefined : CLASSIFIER_LICENSES[name]))
    .find((id) => id !== undefined);
  return fields.get('License-Expression')?.[0] ?? (short ? plain : undefined) ?? fromClassifier;
}

/** The packages a package requires, leaving out the optional ones (`extra == …`). */
function metadataRequires(fields: ReadonlyMap<string, readonly string[]>): string[] {
  return (fields.get('Requires-Dist') ?? []).flatMap((value) => {
    const name = /^([A-Za-z0-9][\w.-]*)/.exec(value)?.[1];
    return name === undefined || /extra\s*==/.test(value) ? [] : [name];
  });
}

function parseMetadata(text: string): PythonMetadata {
  const fields = metadataFields(text);
  const license = metadataLicense(fields);
  const version = fields.get('Version')?.[0];
  return {
    requires: metadataRequires(fields),
    ...(version === undefined ? {} : { version }),
    ...(license === undefined ? {} : { license }),
  };
}

/** The `*.dist-info` folders of a site-packages folder, by package key. */
async function installedPython(repo: RepoView, site: string): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const entry of await repo.list(site)) {
    const name = /^(.+?)-\d[^-]*\.dist-info$/.exec(entry)?.[1];
    if (name !== undefined) {
      found.set(pythonKey(name), `${site}/${entry}`);
    }
  }
  return found;
}

/** The packages needed by `roots` (and what they require), read from the installed metadata. */
async function pythonFromSite(
  repo: RepoView,
  site: string,
  roots: readonly string[],
  manifest: string,
): Promise<DependencyLicense[]> {
  const installed = await installedPython(repo, site);
  const result: DependencyLicense[] = [];
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0 && seen.size < 1000) {
    const name = queue.shift() ?? '';
    const key = pythonKey(name);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const folder = installed.get(key);
    const metadata =
      folder === undefined
        ? undefined
        : parseMetadata((await repo.read(`${folder}/METADATA`)) ?? '');
    queue.push(...(metadata?.requires ?? []));
    result.push({
      ecosystem: 'python',
      name,
      manifest,
      ...(metadata?.version === undefined ? {} : { version: metadata.version }),
      ...(metadata?.license === undefined ? {} : { license: metadata.license }),
    });
  }
  return result;
}

async function pythonDependencies(
  repo: RepoView,
  manifests: readonly Manifest[],
): Promise<DependencyLicense[]> {
  const byDirectory = new Map<string, Manifest[]>();
  for (const manifest of manifests.filter((entry) => entry.ecosystem === 'python')) {
    const directory = directoryOf(manifest.path);
    byDirectory.set(directory, [...(byDirectory.get(directory) ?? []), manifest]);
  }
  const result: DependencyLicense[] = [];
  for (const [directory, group] of byDirectory) {
    const names = [
      ...new Set(group.flatMap((manifest) => runtimeDependencies(manifest).map((d) => d.name))),
    ];
    const anchor =
      group.find((manifest) => runtimeDependencies(manifest).length > 0)?.path ?? directory;
    const site = names.length === 0 ? undefined : await sitePackages(repo, directory);
    result.push(
      ...(site === undefined
        ? names.map((name): DependencyLicense => ({ ecosystem: 'python', name, manifest: anchor }))
        : await pythonFromSite(repo, site, names, anchor)),
    );
  }
  return result;
}

// ---------- NuGet: .nuspec files of restored packages

/** License expressions of the `.nuspec` files in the project, by lowercase package id. */
async function nuspecLicenses(repo: RepoView): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const path of repo.files.filter((file) => file.endsWith('.nuspec'))) {
    const text = (await repo.read(path)) ?? '';
    const id = /<id>\s*([^<]+?)\s*<\/id>/i.exec(text)?.[1];
    const license = /<license\s+type="expression"[^>]*>\s*([^<]+?)\s*<\/license>/i.exec(text)?.[1];
    if (id !== undefined && license !== undefined) {
      found.set(id.toLowerCase(), license);
    }
  }
  return found;
}

async function nugetDependencies(
  repo: RepoView,
  manifests: readonly Manifest[],
): Promise<DependencyLicense[]> {
  const projects = manifests.filter((entry) => entry.ecosystem === 'nuget');
  if (projects.length === 0) {
    return [];
  }
  const licenses = await nuspecLicenses(repo);
  return projects.flatMap((manifest) =>
    runtimeDependencies(manifest).map((dependency): DependencyLicense => {
      const license = licenses.get(dependency.name.toLowerCase());
      return {
        ecosystem: 'nuget',
        name: dependency.name,
        manifest: manifest.path,
        version: dependency.spec,
        ...(license === undefined ? {} : { license }),
      };
    }),
  );
}

const cache = new WeakMap<RepoView, Promise<readonly DependencyLicense[]>>();

/**
 * The runtime dependencies of the project and the license each states, read from what is on disk:
 * the npm lockfile and installed packages, a Python virtual environment, restored NuGet packages.
 * A dependency whose license cannot be found offline is listed without one. Cached for the scan.
 */
export function collectDependencyLicenses(repo: RepoView): Promise<readonly DependencyLicense[]> {
  let pending = cache.get(repo);
  if (!pending) {
    pending = collect(repo);
    cache.set(repo, pending);
  }
  return pending;
}

async function collect(repo: RepoView): Promise<readonly DependencyLicense[]> {
  const manifests = await readManifests(repo);
  const all = [
    ...(await npmDependencies(repo, manifests)),
    ...(await pythonDependencies(repo, manifests)),
    ...(await nugetDependencies(repo, manifests)),
  ];
  const seen = new Set<string>();
  return all.filter((dependency) => {
    const key = `${dependency.manifest}\n${dependency.ecosystem}\n${dependency.name}\n${dependency.version ?? ''}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });
}
