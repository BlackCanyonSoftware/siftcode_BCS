import { posix } from 'node:path';
import type { RepoView } from '../types.js';

export type Ecosystem = 'npm' | 'python' | 'nuget';

/**
 * How firmly a dependency's version is fixed:
 * - `pinned`: one exact version
 * - `ranged`: a bounded range, such as `^1.2.0` or `>=2,<3` (normal when a lockfile exists)
 * - `floating`: any version, or whatever is newest (`*`, `latest`, no version at all, `1.*`)
 * - `git`, `url`: fetched from a repository or address instead of the package registry
 * - `local`: a path or workspace link inside the project
 */
export type Pinning = 'pinned' | 'ranged' | 'floating' | 'git' | 'url' | 'local';

export interface Dependency {
  readonly name: string;
  readonly spec: string;
  readonly pinning: Pinning;
  /** 1-based line in the manifest. */
  readonly line: number;
  /** Only needed to develop or test the project (not shipped with it). */
  readonly dev?: boolean;
}

export interface Manifest {
  /** Path relative to the scan root. */
  readonly path: string;
  readonly ecosystem: Ecosystem;
  readonly dependencies: readonly Dependency[];
  /** The license the manifest declares for the project itself, as written (not validated). */
  readonly license?: string;
}

/** Folder of a repository-relative path; `.` for the top. */
export function directoryOf(path: string): string {
  return posix.dirname(path);
}

/** Whether `directory` is `ancestor` or lies below it (`.` is the ancestor of everything). */
export function isInside(directory: string, ancestor: string): boolean {
  return ancestor === '.' || directory === ancestor || directory.startsWith(`${ancestor}/`);
}

/** 1-based number of the first line containing `needle`, or 1. */
export function lineOf(text: string, needle: string): number {
  const index = text.indexOf(needle);
  return index < 0 ? 1 : text.slice(0, index).split('\n').length;
}

// ---------- npm: package.json

const NPM_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies'] as const;

export function classifyNpm(raw: string): Pinning {
  const spec = raw.trim();
  if (/^(?:workspace|file|link|portal):|^\.{1,2}\/|^~\//.test(spec)) {
    return 'local';
  }
  if (
    /^(?:git\+|git:|git@|github:|gitlab:|bitbucket:|gist:|ssh:)/.test(spec) ||
    /^[\w.-]+\/[\w.-]+(?:#.*)?$/.test(spec)
  ) {
    return 'git';
  }
  if (/^https?:\/\//.test(spec)) {
    return 'url';
  }
  // Empty, `*`, `x`, `>=0`, or a dist-tag such as `latest` or `next`: whatever is newest.
  if (/^(?:\*|[xX]|>=\s*0(?:\.0\.0)?|[A-Za-z][\w-]*)?$/.test(spec)) {
    return 'floating';
  }
  return /^\d+\.\d+\.\d+(?:[-+][\w.+-]+)?$/.test(spec) ? 'pinned' : 'ranged';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePackageJson(path: string, text: string): Manifest | undefined {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isObject(json)) {
    return undefined;
  }
  const dependencies: Dependency[] = [];
  for (const section of NPM_SECTIONS) {
    const table = json[section];
    if (!isObject(table)) {
      continue;
    }
    for (const [name, spec] of Object.entries(table)) {
      if (typeof spec === 'string') {
        dependencies.push({
          name,
          spec,
          pinning: classifyNpm(spec),
          line: lineOf(text, `"${name}"`),
          ...(section === 'devDependencies' ? { dev: true } : {}),
        });
      }
    }
  }
  const license = npmLicense(json);
  return { path, ecosystem: 'npm', dependencies, ...(license === undefined ? {} : { license }) };
}

/** `"license": "MIT"`, the old `{ "type": "MIT" }`, or the old `"licenses": [{ "type": … }]`. */
export function npmLicense(json: Record<string, unknown>): string | undefined {
  const { license, licenses } = json;
  const typeOf = (value: unknown): string | undefined =>
    typeof value === 'string'
      ? value
      : isObject(value) && typeof value.type === 'string'
        ? value.type
        : undefined;
  if (license !== undefined) {
    return typeOf(license);
  }
  if (Array.isArray(licenses)) {
    const types = licenses.map(typeOf).filter((type) => type !== undefined);
    return types.length > 0 ? types.join(' OR ') : undefined;
  }
  return undefined;
}

// ---------- Python: requirements*.txt, pyproject.toml, Pipfile

export function classifyPython(raw: string): Pinning {
  const spec = raw.trim();
  if (spec === '' || spec === '*') {
    return 'floating';
  }
  return /^===?\s*\d[\w.!+-]*$/.test(spec) ? 'pinned' : 'ranged';
}

/** The requirement on a line of a requirements file, or undefined for blanks, comments, and options. */
function requirementText(raw: string): string | undefined {
  const text = raw
    .replace(/\s+#.*$/, '')
    .replace(/\s+--hash.*$/, '')
    .replace(/\\$/, '')
    .trim();
  if (text === '' || text.startsWith('#')) {
    return undefined;
  }
  const editable = text.replace(/^(?:-e|--editable)\s+/, '');
  return editable.startsWith('-') ? undefined : editable; // `-r other.txt`, `--index-url …`
}

/** A requirement that is a path, a repository, or a web address instead of a name and version. */
function addressRequirement(text: string, line: number): Dependency | undefined {
  if (/^(?:\.{1,2}(?:\/|$)|\/|file:)/.test(text)) {
    return { name: text, spec: text, pinning: 'local', line };
  }
  const egg = /#egg=([\w.-]+)/.exec(text)?.[1];
  const direct = /^([A-Za-z0-9][\w.-]*)\s*(?:\[[^\]]*\])?\s*@\s*(\S+)/.exec(text);
  const address = direct?.[2] ?? text;
  if (!direct && !/^(?:git|hg|svn|bzr)\+|^https?:\/\//.test(text)) {
    return undefined;
  }
  return {
    name: direct?.[1] ?? egg ?? address,
    spec: address,
    pinning: /^git\+|^git:|\.git(?:[#@]|$)/.test(address) ? 'git' : 'url',
    line,
  };
}

/** One requirement such as `requests[socks]>=2.0,<3 ; python_version > "3"`. */
export function parseRequirement(raw: string, line: number): Dependency | undefined {
  const text = requirementText(raw);
  if (text === undefined) {
    return undefined;
  }
  const address = addressRequirement(text, line);
  if (address) {
    return address;
  }
  const match = /^([A-Za-z0-9][\w.-]*)\s*(?:\[[^\]]*\])?\s*([^;]*)/.exec(text);
  if (!match?.[1]) {
    return undefined;
  }
  const spec = (match[2] ?? '').trim();
  return { name: match[1], spec, pinning: classifyPython(spec), line };
}

function parseRequirementsTxt(path: string, text: string): Manifest {
  // requirements-dev.txt, requirements_test.txt, dev-requirements.txt: not shipped with the project.
  const dev = /(?:^|[-_.])(?:dev|test|tests|lint|docs|ci)(?:[-_.]|$)/i.test(posix.basename(path));
  const dependencies = text.split(/\r\n|\r|\n/).flatMap((raw, index) => {
    const dependency = parseRequirement(raw, index + 1);
    return dependency ? [dev ? { ...dependency, dev } : dependency] : [];
  });
  return { path, ecosystem: 'python', dependencies };
}

/** The value of `name = ...` in a TOML table of dependencies (Poetry, Pipenv). */
function tableDependency(name: string, value: string, line: number): Dependency | undefined {
  if (name === 'python') {
    return undefined;
  }
  const quoted = /^["']([^"']*)["']/.exec(value)?.[1];
  if (quoted !== undefined) {
    const exact = /^\d+(?:\.\d+)*$/.test(quoted);
    return { name, spec: quoted, pinning: exact ? 'pinned' : classifyPython(quoted), line };
  }
  if (!value.startsWith('{')) {
    return undefined;
  }
  if (/\bgit\s*=/.test(value)) {
    return { name, spec: value, pinning: 'git', line };
  }
  if (/\burl\s*=/.test(value)) {
    return { name, spec: value, pinning: 'url', line };
  }
  if (/\bpath\s*=/.test(value)) {
    return { name, spec: value, pinning: 'local', line };
  }
  const version = /\bversion\s*=\s*["']([^"']*)["']/.exec(value)?.[1] ?? '';
  const exact = /^\d+(?:\.\d+)*$/.test(version);
  return { name, spec: version, pinning: exact ? 'pinned' : classifyPython(version), line };
}

const TOML_DEPENDENCY_TABLES =
  /^(?:tool\.poetry(?:\.group\.[\w-]+)?\.(?:dev-)?dependencies|packages|dev-packages)$/;
const TOML_ARRAY_TABLES = /^(?:project\.optional-dependencies|dependency-groups)$/;

/** Whether a line opens one of the arrays of requirement strings in a pyproject.toml. */
function opensRequirementArray(table: string, line: string): boolean {
  return table === 'project'
    ? /^dependencies\s*=\s*\[/.test(line)
    : TOML_ARRAY_TABLES.test(table) && /^[\w-]+\s*=\s*\[/.test(line);
}

/** The requirements quoted on one line of an array. */
function quotedRequirements(content: string, lineNumber: number): Dependency[] {
  return [...content.matchAll(/"([^"]+)"|'([^']+)'/g)].flatMap((item) => {
    const dependency = parseRequirement(item[1] ?? item[2] ?? '', lineNumber);
    return dependency ? [dependency] : [];
  });
}

/** `name = "version"` or `name = { git = "…" }` in a Poetry or Pipenv table. */
function tableEntry(line: string, lineNumber: number): Dependency | undefined {
  const entry = /^["']?([A-Za-z0-9][\w.-]*)["']?\s*=\s*(.+)$/.exec(line);
  return entry?.[1] && entry[2] ? tableDependency(entry[1], entry[2], lineNumber) : undefined;
}

/** Tables whose dependencies are shipped with the project; all others are development or optional. */
const TOML_RUNTIME_TABLES = new Set(['project', 'tool.poetry.dependencies', 'packages']);

/** The license a pyproject.toml declares: `license = "MIT"` or `license = { text = "MIT" }`. */
function tomlLicense(table: string, line: string): string | undefined {
  if (table !== 'project' && table !== 'tool.poetry') {
    return undefined;
  }
  const value = /^license\s*=\s*(.+)$/.exec(line)?.[1];
  return value === undefined ? undefined : /["']([^"']+)["']\s*\}?\s*$/.exec(value)?.[1];
}

/**
 * Reads the dependency lists of a pyproject.toml or Pipfile without a TOML parser: the arrays of
 * requirement strings (`[project]`, optional dependencies, dependency groups) and the
 * `name = "version"` tables (Poetry, Pipenv). Anything else in the file is left alone.
 */
function parseToml(path: string, text: string): Manifest {
  const dependencies: Dependency[] = [];
  let table = '';
  let inArray = false;
  let license: string | undefined;
  for (const [index, raw] of text.split(/\r\n|\r|\n/).entries()) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    license ??= tomlLicense(table, line);
    const header = /^\[\[?([^\]]+)\]\]?$/.exec(line)?.[1];
    if (!inArray && header !== undefined) {
      table = header.trim();
    } else if (inArray || opensRequirementArray(table, line)) {
      const content: string = inArray ? line : line.slice(line.indexOf('[') + 1);
      dependencies.push(...markDev(quotedRequirements(content, index + 1), table));
      // A `]` inside a quoted extra such as "requests[socks]" does not close the array.
      inArray = !content.replace(/"[^"]*"|'[^']*'/g, '').includes(']');
    } else if (TOML_DEPENDENCY_TABLES.test(table)) {
      dependencies.push(...markDev(optional(tableEntry(line, index + 1)), table));
    }
  }
  return { path, ecosystem: 'python', dependencies, ...(license === undefined ? {} : { license }) };
}

const optional = <T>(value: T | undefined): T[] => (value === undefined ? [] : [value]);

/** Marks the dependencies read from a table that is not shipped with the project. */
function markDev(dependencies: readonly Dependency[], table: string): Dependency[] {
  return TOML_RUNTIME_TABLES.has(table)
    ? [...dependencies]
    : dependencies.map((d) => ({ ...d, dev: true }));
}

// ---------- NuGet: *.csproj

export function classifyNuget(raw: string): Pinning {
  const version = raw.trim();
  if (version.includes('*') || /,\s*[)\]]\s*$/.test(version)) {
    return 'floating'; // `1.*`, or a range with no upper bound such as `[1.0,)`
  }
  return /^\[?\d+(?:\.\d+){1,3}(?:-[\w.]+)?\]?$/.test(version) && !version.includes(',')
    ? 'pinned'
    : 'ranged';
}

function parseCsproj(path: string, text: string): Manifest {
  const dependencies: Dependency[] = [];
  const references = text.matchAll(
    /<PackageReference\b([^>]*?)(?:\/>|>([\s\S]*?)<\/PackageReference>)/g,
  );
  for (const reference of references) {
    const attributes = reference[1] ?? '';
    const name = /\b(?:Include|Update)\s*=\s*"([^"]+)"/.exec(attributes)?.[1];
    const version =
      /\bVersion\s*=\s*"([^"]*)"/.exec(attributes)?.[1] ??
      /<Version>\s*([^<]*?)\s*<\/Version>/.exec(reference[2] ?? '')?.[1];
    if (name && version !== undefined) {
      // A version taken from a property (`$(Version)`) is not visible here: treat it as a range.
      const pinning = version.includes('$(') ? 'ranged' : classifyNuget(version);
      dependencies.push({
        name,
        spec: version,
        pinning,
        line: text.slice(0, reference.index).split('\n').length,
      });
    }
  }
  const license = /<PackageLicenseExpression>\s*([^<]*?)\s*<\/PackageLicenseExpression>/.exec(
    text,
  )?.[1];
  return { path, ecosystem: 'nuget', dependencies, ...(license ? { license } : {}) };
}

// ---------- discovery of manifests

function parserFor(
  path: string,
): ((path: string, text: string) => Manifest | undefined) | undefined {
  const name = posix.basename(path);
  if (name === 'package.json') {
    return parsePackageJson;
  }
  if (/^requirements(?:[-_.][\w.-]*)?\.txt$/i.test(name)) {
    return parseRequirementsTxt;
  }
  if (name === 'pyproject.toml' || name === 'Pipfile') {
    return parseToml;
  }
  return name.endsWith('.csproj') ? parseCsproj : undefined;
}

/** Reads every dependency manifest in the project (npm, Python, NuGet). */
export async function readManifests(repo: RepoView): Promise<readonly Manifest[]> {
  const manifests = await Promise.all(
    repo.files.map(async (path) => {
      const parse = parserFor(path);
      const text = parse ? await repo.read(path) : undefined;
      return parse && text !== undefined ? parse(path, text) : undefined;
    }),
  );
  return manifests.filter((manifest) => manifest !== undefined);
}
