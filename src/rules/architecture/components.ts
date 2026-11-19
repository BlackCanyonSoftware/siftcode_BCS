/**
 * A share of the files that one folder must hold for the walk to go down into it: the project's own
 * code lives under `src/`, or under `src/pip/`, and the folders that matter for its design are the
 * ones inside.
 */
const DOMINANT_SHARE = 0.7;
/**
 * A few files beside the dominant folder (`__init__.py`, `__main__.py`, an entry module) do not stop
 * the walk: two files, or a tenth of the code. More than that and the folder is a package whose own
 * modules matter, so it stays the root.
 */
const MAX_LOOSE_FILES = 2;
const MAX_LOOSE_SHARE = 0.1;

/** Where the components of the project begin: `''`, `src/`, `packages/`, `src/pip/`, ... */
export function componentRoot(paths: readonly string[]): string {
  let dir = '';
  for (;;) {
    const inside = paths.filter((path) => path.startsWith(dir));
    const children = new Map<string, number>();
    let loose = 0;
    for (const path of inside) {
      const [first = '', ...more] = path.slice(dir.length).split('/');
      if (more.length === 0) {
        loose += 1;
      } else {
        children.set(first, (children.get(first) ?? 0) + 1);
      }
    }
    const dominant = [...children].find(([, count]) => count >= DOMINANT_SHARE * inside.length);
    const fewLoose = loose <= MAX_LOOSE_FILES || loose <= MAX_LOOSE_SHARE * inside.length;
    if (!dominant || !fewLoose) {
      return dir;
    }
    dir = `${dir}${dominant[0]}/`;
  }
}

/**
 * Files that belong to no component: the ones beside the root (`src/index.ts`, a package's
 * `__init__.py`) and those at the top of a C# project. They tie the pieces together, so imports to
 * and from them are not dependencies between components.
 */
export const LOOSE = '';

/** The folder of `path` under `base` (a prefix ending in `/`), or LOOSE for a file directly in `base`. */
function folderUnder(path: string, base: string): string {
  const [first = '', ...more] = path.slice(base.length).split('/');
  return more.length === 0 ? LOOSE : `${base}${first}`;
}

/**
 * The component of each file: for C#, the folder under its project (the folder of its `.csproj`),
 * otherwise the folder directly under the component root. A file outside the root (a docs script, a
 * parent package's own modules) belongs to none.
 */
export function assignComponents(
  paths: readonly string[],
  projectFolders: readonly string[],
): ReadonlyMap<string, string> {
  const root = componentRoot(paths);
  // The longest folder first, so a project nested in another one wins.
  const projects = [...projectFolders].sort((a, b) => b.length - a.length);
  const components = new Map<string, string>();
  for (const path of paths) {
    const project = path.endsWith('.cs')
      ? projects.find((folder) => folder === '' || path.startsWith(`${folder}/`))
      : undefined;
    const base = project !== undefined ? (project === '' ? '' : `${project}/`) : root;
    components.set(path, path.startsWith(base) ? folderUnder(path, base) : LOOSE);
  }
  return components;
}
