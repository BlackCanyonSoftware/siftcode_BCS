import { posix } from 'node:path';
import type { CodeFile } from '../../languages/model/types.js';
import { readProjectCode } from '../code-text.js';
import { readManifests } from '../supply-chain/manifests.js';
import { isVendored } from '../shared.js';
import type { RepoView } from '../types.js';

/** Lowercase letters and digits only: `repo-files`, `RepoFiles`, and `repo_files` are one name. */
export const normalizeName = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, '');

/** `orders` and `order` are one name, so a diagram that says "Orders" finds a folder called `order`. */
const singular = (name: string): string =>
  name.length > 3 && name.endsWith('s') ? name.slice(0, -1) : name;

/** Every name the project's own code gives to something, and the paths it lives at. */
export interface CodeNames {
  /** Whether the project has a folder, file, package, namespace, or class that is called `name` or `a/b` or `A.B`. */
  has(name: string): boolean;
}

const addAll = (target: Set<string>, ...names: readonly string[]): void => {
  for (const name of names) {
    const normal = normalizeName(name);
    if (normal.length > 1) {
      target.add(normal);
      target.add(singular(normal));
    }
  }
};

/** The segments of a module path or dotted name: `core/scan`, `Catalog.API`, `@scope/pkg`. */
const partsOf = (name: string): string[] =>
  name
    .split(/[/.]/)
    .map(normalizeName)
    .filter((part) => part !== '');

/** A box that names a file (`policy.py`, `sw.js`) is looked up by the name without its extension. */
const FILE_EXTENSION = /\.(?:py|js|jsx|ts|tsx|mjs|cjs|cs|csproj|json|ya?ml|toml|md|sh|html|css)$/i;

/** A package name without its scope: `@scope/pkg` is also called `pkg`. */
const unscoped = (name: string): string => name.replace(/^@[^/]+\//, '');

/** The folders and the file name of `path`, and every tail of the path (`src/core/scan`, `core/scan`, `scan`). */
function addFileNames(names: Set<string>, paths: Set<string>, path: string): void {
  const segments = path.split('/');
  const stem = posix.basename(path).replace(/\.[^.]+$/, '');
  addAll(names, ...segments.slice(0, -1), stem);
  const folders = segments.slice(0, -1).map(normalizeName);
  for (let from = 0; from <= folders.length; from++) {
    paths.add([...folders.slice(from), normalizeName(stem)].join('/'));
    paths.add(folders.slice(from).join('/'));
  }
}

/** The classes, namespaces, and imported modules of one parsed source file. */
function addCodeNames(names: Set<string>, file: CodeFile): void {
  addAll(
    names,
    ...file.classes.map((item) => item.name),
    ...file.usage.namespaces.flatMap(partsOf),
  );
  for (const imported of file.usage.imports) {
    if (!imported.module.startsWith('.')) {
      addAll(names, ...partsOf(imported.module));
    }
  }
}

/**
 * What the code calls things, collected from the folders and file names of the source, the projects
 * (`.csproj` names), the dependencies the manifests list, the modules the code imports, the
 * namespaces C# files declare, and the classes. A diagram box that names something is expected to
 * find it here under that name.
 */
export async function collectCodeNames(repo: RepoView): Promise<CodeNames> {
  const names = new Set<string>();
  const paths = new Set<string>();
  for (const path of repo.files.filter((file) => !isVendored(file))) {
    addFileNames(names, paths, path);
  }
  for (const file of repo.codeFiles) {
    addCodeNames(names, file);
  }
  for (const manifest of await readManifests(repo)) {
    for (const dependency of manifest.dependencies) {
      addAll(names, unscoped(dependency.name), ...partsOf(dependency.name));
    }
  }
  return {
    has(name) {
      const parts = partsOf(name.replace(FILE_EXTENSION, ''));
      if (parts.length === 0) {
        return true; // nothing to look for: do not report it
      }
      const joined = parts.join('');
      if (names.has(joined) || names.has(singular(joined))) {
        return true;
      }
      return parts.length > 1 && paths.has(parts.join('/'));
    },
  };
}

/**
 * Which of `names` appear, spelled out, in the project's source: `chrome.storage.local` is an API a
 * diagram may draw and no folder is called. A name the code writes is not a module that went missing.
 */
export async function namesWrittenInCode(
  repo: RepoView,
  names: readonly string[],
): Promise<ReadonlySet<string>> {
  // Only a qualified name (`a.b.c`, `core/scan`) is looked for: a plain word such as `suggestions`
  // appears in comments and strings whether or not the module it names exists.
  const qualified = names.filter((name) => /[./]/.test(name));
  if (qualified.length === 0) {
    return new Set();
  }
  const texts = (await readProjectCode(repo)).map((file) => file.text.toLowerCase());
  return new Set(
    qualified.filter((name) => texts.some((text) => text.includes(name.toLowerCase()))),
  );
}
