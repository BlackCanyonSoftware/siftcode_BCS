import { posix } from 'node:path';
import type { CodeFile, ImportFact } from '../../languages/model/types.js';

/** What the resolver needs to know about the project: its files, and who declares which namespace. */
export interface ProjectIndex {
  readonly paths: ReadonlySet<string>;
  /** C# only: namespace -> the files that declare it. */
  readonly byNamespace: ReadonlyMap<string, readonly string[]>;
}

export function indexProject(files: readonly CodeFile[]): ProjectIndex {
  const byNamespace = new Map<string, string[]>();
  for (const file of files) {
    for (const namespace of file.usage.namespaces) {
      byNamespace.set(namespace, [...(byNamespace.get(namespace) ?? []), file.path]);
    }
  }
  return { paths: new Set(files.map((file) => file.path)), byNamespace };
}

/**
 * The project files that `imported` (an import in `from`) refers to, or none when it names something
 * outside the project (a package, the standard library) or something this cannot resolve (a path alias
 * from a `tsconfig`, a namespace no file declares). Never the file itself.
 */
export function resolveImport(
  from: CodeFile,
  imported: ImportFact,
  index: ProjectIndex,
): readonly string[] {
  const targets = (() => {
    switch (from.grammar) {
      case 'python':
        return resolvePython(from.path, imported, index.paths);
      case 'csharp':
        return index.byNamespace.get(imported.module) ?? [];
      default:
        return resolveScript(from.path, imported.module, index.paths);
    }
  })();
  return targets.filter((path) => path !== from.path);
}

/** Source extensions tried for an extensionless relative import, and what a `.js` import means in TypeScript. */
const SCRIPT_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
const COMPILED_TO: Readonly<Record<string, readonly string[]>> = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
};

/** `./util`, `../lib/x.js`: relative imports only. A bare name is a package, not a project file. */
function resolveScript(from: string, specifier: string, paths: ReadonlySet<string>): string[] {
  if (!specifier.startsWith('.')) {
    return [];
  }
  const base = posix.normalize(posix.join(posix.dirname(from), specifier));
  const extension = posix.extname(base);
  const stem = base.slice(0, base.length - extension.length);
  const candidates = [
    base,
    ...(COMPILED_TO[extension] ?? []).map((ext) => stem + ext),
    ...SCRIPT_EXTENSIONS.map((ext) => base + ext),
    ...SCRIPT_EXTENSIONS.map((ext) => `${base}/index${ext}`),
  ];
  const found = candidates.find((candidate) => paths.has(candidate));
  return found === undefined ? [] : [found];
}

/** `pkg/mod.py` or `pkg/mod/__init__.py` for the module at `base`, if the project has one. */
function pythonModule(base: string, paths: ReadonlySet<string>): string | undefined {
  return [`${base}.py`, `${base}/__init__.py`].find((candidate) => paths.has(candidate));
}

/** Every folder above `path`, nearest first, as a prefix ending in `/` (the root is ''). */
function ancestors(path: string): string[] {
  const parts = path.split('/').slice(0, -1);
  return [...parts.keys()].reverse().map((n) => `${parts.slice(0, n + 1).join('/')}/`);
}

function resolvePython(from: string, imported: ImportFact, paths: ReadonlySet<string>): string[] {
  const [, dots = '', rest = ''] = /^(\.*)(.*)$/.exec(imported.module) ?? [];
  const names = rest === '' ? [] : rest.split('.');
  if (dots.length > 0) {
    const up = dots.length - 1;
    const dir = posix.join(posix.dirname(from), ...Array<string>(up).fill('..'));
    return pythonCandidates(dir === '.' ? '' : `${dir}/`, names, imported.bindings, paths);
  }
  const roots = ['', 'src/', ...ancestors(from)];
  for (const root of roots) {
    const found = pythonCandidates(root, names, imported.bindings, paths);
    if (found.length > 0) {
      return found;
    }
  }
  return [];
}

/**
 * `from pkg import mod` may name a module of the package, and `import a.b.c` may name a module `a.b`
 * with an attribute `c`, so the longest module name that exists wins, and the bindings of a `from`
 * import are tried as submodules.
 */
function pythonCandidates(
  root: string,
  names: readonly string[],
  bindings: readonly string[],
  paths: ReadonlySet<string>,
): string[] {
  const results = new Set<string>();
  for (let length = names.length; length >= 1; length--) {
    const base = root + names.slice(0, length).join('/');
    const module = pythonModule(base, paths);
    if (module !== undefined) {
      results.add(module);
      for (const binding of length === names.length ? bindings : []) {
        const sub = pythonModule(`${base}/${binding}`, paths);
        if (sub !== undefined) {
          results.add(sub);
        }
      }
      break;
    }
  }
  if (names.length === 0) {
    for (const binding of bindings) {
      const module = pythonModule(root + binding, paths);
      if (module !== undefined) {
        results.add(module);
      }
    }
  }
  return [...results];
}
