import { posix } from 'node:path';
import { isTestFile } from '../shared.js';
import { directoryOf, readManifests } from '../supply-chain/manifests.js';
import type { RepoView } from '../types.js';
import { loadCatalog, type Catalog } from './catalog.js';
import { identifyLicenseText, type Identification } from './identify.js';
import { parseExpression, type Expression } from './spdx.js';

export interface LicenseFile {
  /** Path relative to the scan root. */
  readonly path: string;
  readonly text: string;
  readonly identification: Identification;
}

/** A license a manifest declares for the project, classified. */
export type DeclaredLicense = { readonly path: string; readonly raw: string } & (
  | { readonly kind: 'expression'; readonly expression: Expression }
  /** Not SPDX syntax (`MIT License`, `Apache 2.0`): written for people, not for tools. */
  | { readonly kind: 'invalid'; readonly reason: string }
  /** `UNLICENSED` or `Proprietary`: the owner chose not to grant a license. */
  | { readonly kind: 'proprietary' }
  /** `SEE LICENSE IN LICENSE.md`: the license is in a file. */
  | { readonly kind: 'see-file' }
);

export interface ProjectLicense {
  /** License files at the top of the project (and in a REUSE `LICENSES/` folder). */
  readonly files: readonly LicenseFile[];
  /** License files further down, usually bundled third-party code. */
  readonly nested: readonly LicenseFile[];
  readonly declared: readonly DeclaredLicense[];
  /** The license the project is under, for comparing with its dependencies' licenses. */
  readonly effective?: Expression;
}

const NOT_TEXT =
  /\.(?:js|mjs|cjs|ts|tsx|json|py|cs|html?|xml|ya?ml|toml|cfg|sh|png|jpe?g|svg|gif|ico)$/i;

/** `LICENSE`, `LICENSE.md`, `LICENSE-MIT`, `COPYING`, `COPYING.LESSER`, `UNLICENSE`; not `license-checker.js`. */
export function isLicenseFileName(name: string): boolean {
  return /^(?:licen[cs]es?|copying|unlicen[cs]e)(?:$|[-_.])/i.test(name) && !NOT_TEXT.test(name);
}

const isReuseText = (path: string): boolean => /^LICENSES\/[^/]+$/.test(path);

async function readLicenseFiles(repo: RepoView, catalog: Catalog): Promise<LicenseFile[]> {
  const paths = repo.files.filter(
    (path) => isLicenseFileName(posix.basename(path)) || isReuseText(path),
  );
  const files = await Promise.all(
    paths.map(async (path) => {
      const text = await repo.read(path);
      return text === undefined
        ? undefined
        : { path, text, identification: identifyLicenseText(text, catalog) };
    }),
  );
  return files.filter((file) => file !== undefined);
}

function classify(path: string, raw: string, catalog: Catalog): DeclaredLicense {
  if (/^(?:unlicensed|proprietary|commercial)$/i.test(raw.trim())) {
    return { path, raw, kind: 'proprietary' };
  }
  if (/^see licen[cs]e in\b/i.test(raw.trim())) {
    return { path, raw, kind: 'see-file' };
  }
  const parsed = parseExpression(raw, catalog);
  return parsed.ok
    ? { path, raw, kind: 'expression', expression: parsed.expression }
    : { path, raw, kind: 'invalid', reason: parsed.reason };
}

/** What the manifests at the top of the project (and every .NET project) say its license is. */
async function readDeclared(repo: RepoView, catalog: Catalog): Promise<DeclaredLicense[]> {
  const manifests = await readManifests(repo);
  return manifests.flatMap((manifest) =>
    manifest.license !== undefined &&
    (directoryOf(manifest.path) === '.' || manifest.ecosystem === 'nuget')
      ? [classify(manifest.path, manifest.license, catalog)]
      : [],
  );
}

/** Joins the ids with OR: several license files are most often a choice (`LICENSE-MIT`, `LICENSE-APACHE`). */
function anyOf(ids: readonly string[]): Expression | undefined {
  const [first, ...rest] = ids;
  if (first === undefined) {
    return undefined;
  }
  return rest.reduce<Expression>(
    (left, id) => ({ kind: 'or', left, right: { kind: 'license', id, known: true } }),
    { kind: 'license', id: first, known: true },
  );
}

/**
 * The license in force: the declared SPDX expression when there is a valid one, otherwise the
 * licenses the license files contain. Files of identical text (GPL-3.0-only and -or-later) count
 * as the stricter "only" until a declaration says otherwise.
 */
function effectiveLicense(
  files: readonly LicenseFile[],
  declared: readonly DeclaredLicense[],
): Expression | undefined {
  const fromManifest = declared.find((entry) => entry.kind === 'expression');
  if (fromManifest?.kind === 'expression') {
    return fromManifest.expression;
  }
  const ids = files.flatMap(({ identification }) =>
    identification.kind === 'match' || identification.kind === 'modified'
      ? [identification.ids.find((id) => id.endsWith('-only')) ?? identification.ids[0]]
      : [],
  );
  return anyOf([...new Set(ids.filter((id) => id !== undefined))]);
}

const cache = new WeakMap<RepoView, Promise<ProjectLicense>>();

/** Finds the project's license files and declarations. Cached for the scan. */
export function detectProjectLicense(repo: RepoView): Promise<ProjectLicense> {
  let pending = cache.get(repo);
  if (!pending) {
    pending = detect(repo);
    cache.set(repo, pending);
  }
  return pending;
}

async function detect(repo: RepoView): Promise<ProjectLicense> {
  const catalog = await loadCatalog();
  const [all, declared] = await Promise.all([
    readLicenseFiles(repo, catalog),
    readDeclared(repo, catalog),
  ]);
  const isTop = (file: LicenseFile): boolean => !file.path.includes('/') || isReuseText(file.path);
  const files = all.filter(isTop);
  const nested = all.filter((file) => !isTop(file) && !isTestFile(file.path));
  const effective = effectiveLicense(files, declared);
  return { files, nested, declared, ...(effective ? { effective } : {}) };
}
