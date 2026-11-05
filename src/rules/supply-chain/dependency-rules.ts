import { posix } from 'node:path';
import { z } from 'zod';
import { defineRepoRule } from '../define.js';
import { cwe, owaspTop10, scorecardCheck, slsa } from '../standards.js';
import type { RepoHit, RepoView } from '../types.js';
import { directoryOf, readManifests, type Dependency, type Manifest } from './manifests.js';

const NPM_LOCKS = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'bun.lockb',
];
const PYTHON_LOCKS = ['poetry.lock', 'Pipfile.lock', 'uv.lock', 'pdm.lock'];
const NUGET_LOCKS = ['packages.lock.json'];

/** Whether a lockfile sits in `directory` or any folder above it (npm workspaces lock at the top). */
function lockedInScope(repo: RepoView, directory: string, names: readonly string[]): boolean {
  for (let current = directory; ; current = posix.dirname(current)) {
    if (names.some((name) => repo.has(current === '.' ? name : `${current}/${name}`))) {
      return true;
    }
    if (current === '.') {
      return false;
    }
  }
}

/** Dependencies fetched from a registry or an address; links to folders inside the project do not count. */
const external = (manifest: Manifest): readonly Dependency[] =>
  manifest.dependencies.filter((dependency) => dependency.pinning !== 'local');

const fullyPinned = (manifest: Manifest): boolean => {
  const dependencies = external(manifest);
  return dependencies.length > 0 && dependencies.every((entry) => entry.pinning === 'pinned');
};

const isRequirementsFile = (path: string): boolean => /^requirements/i.test(posix.basename(path));

function pythonLocked(repo: RepoView, manifest: Manifest, all: readonly Manifest[]): boolean {
  const directory = directoryOf(manifest.path);
  if (lockedInScope(repo, directory, PYTHON_LOCKS)) {
    return true;
  }
  if (isRequirementsFile(manifest.path)) {
    return fullyPinned(manifest);
  }
  // pyproject.toml or Pipfile: a fully pinned requirements file beside it serves as the lock.
  return all.some(
    (other) =>
      isRequirementsFile(other.path) && directoryOf(other.path) === directory && fullyPinned(other),
  );
}

function lockfileHit(manifest: Manifest, advice: string, severity?: 'info'): RepoHit {
  return {
    path: manifest.path,
    startLine: 1,
    endLine: 1,
    message: `${posix.basename(manifest.path)} lists ${external(manifest).length} ${external(manifest).length === 1 ? 'dependency' : 'dependencies'} but no lockfile is committed: ${advice}`,
    key: `lockfile:${manifest.path}`,
    ...(severity ? { severity } : {}),
  };
}

export const missingLockfile = defineRepoRule({
  meta: {
    id: 'SC-SUP-001',
    title: 'Dependencies are not locked to exact versions',
    category: 'supply-chain',
    defaultSeverity: 'warning',
    confidence: 'high',
    heuristic: false,
    standards: [
      scorecardCheck('Pinned-Dependencies', 'pinned-dependencies'),
      owaspTop10(
        'A08',
        'Software and Data Integrity Failures',
        'A08_2021-Software_and_Data_Integrity_Failures',
      ),
      slsa,
    ],
    rationale:
      'Without a lockfile every install can pick different versions, so a build cannot be reproduced and a compromised or broken new release reaches you the next time anyone installs.',
    suggestion: {
      summary:
        'Commit the lockfile your package manager writes (package-lock.json, yarn.lock, pnpm-lock.yaml, poetry.lock, uv.lock, Pipfile.lock, packages.lock.json), or pin every requirement to one exact version.',
      before: 'pip install requests  # newest version at install time',
      after: 'requests==2.32.3  # in requirements.txt, ideally with --hash',
    },
  },
  options: z.strictObject({}),
  async check(repo) {
    const manifests = await readManifests(repo);
    const hits: RepoHit[] = [];
    const nugetUnlocked: Manifest[] = [];
    for (const manifest of manifests) {
      if (external(manifest).length === 0) {
        continue;
      }
      const directory = directoryOf(manifest.path);
      if (manifest.ecosystem === 'npm') {
        if (!lockedInScope(repo, directory, NPM_LOCKS)) {
          hits.push(
            lockfileHit(manifest, 'commit the file `npm install` creates (package-lock.json).'),
          );
        }
      } else if (manifest.ecosystem === 'python') {
        if (!pythonLocked(repo, manifest, manifests)) {
          const pyproject = posix.basename(manifest.path) === 'pyproject.toml';
          hits.push(
            lockfileHit(
              manifest,
              'lock with your tool (uv lock, poetry lock, pipenv lock) or pin each requirement with ==.',
              pyproject ? 'info' : undefined,
            ),
          );
        }
      } else if (!lockedInScope(repo, directory, NUGET_LOCKS)) {
        nugetUnlocked.push(manifest);
      }
    }
    // NuGet lock files are opt-in and per project, so the whole solution is one low-key finding.
    const [first] = nugetUnlocked;
    if (first) {
      hits.push({
        path: first.path,
        startLine: 1,
        endLine: 1,
        message: `${nugetUnlocked.length} .NET project${nugetUnlocked.length === 1 ? ' has' : 's have'} no packages.lock.json: set RestorePackagesWithLockFile to true and commit the lock files.`,
        key: 'lockfile:nuget',
        severity: 'info',
      });
    }
    return hits;
  },
});

export const floatingVersions = defineRepoRule({
  meta: {
    id: 'SC-SUP-002',
    title: 'Dependency accepts any version',
    category: 'supply-chain',
    defaultSeverity: 'warning',
    confidence: 'high',
    heuristic: false,
    standards: [
      scorecardCheck('Pinned-Dependencies', 'pinned-dependencies'),
      cwe(829, 'Inclusion of Functionality from Untrusted Control Sphere'),
      owaspTop10(
        'A08',
        'Software and Data Integrity Failures',
        'A08_2021-Software_and_Data_Integrity_Failures',
      ),
    ],
    rationale:
      'A dependency set to `*`, `latest`, or no version at all takes whatever is newest, including a release with breaking changes or one published by an attacker who took over the package.',
    suggestion: {
      summary:
        'Give the dependency a version range you have tested (for example ^4.17.21, >=2.31,<3, or 13.0.3), and let a dependency-update tool propose newer versions.',
      before: '"lodash": "*"',
      after: '"lodash": "^4.17.21"',
    },
  },
  options: z.strictObject({}),
  async check(repo) {
    const manifests = await readManifests(repo);
    return manifests.flatMap((manifest) =>
      manifest.dependencies
        .filter((dependency) => dependency.pinning === 'floating')
        .map((dependency) => ({
          path: manifest.path,
          startLine: dependency.line,
          endLine: dependency.line,
          message: `${dependency.name} accepts any version (${dependency.spec === '' ? 'no version given' : dependency.spec}): give it a version range.`,
          key: `floating:${dependency.name}`,
        })),
    );
  },
});

/** A git commit or a content hash is as good as a version number. */
const FIXED_REFERENCE = /(?:[#@][0-9a-f]{40}\b|#sha(?:256|512)=)/i;

export const remoteDependencies = defineRepoRule({
  meta: {
    id: 'SC-SUP-003',
    title: 'Dependency is fetched from a repository or address',
    category: 'supply-chain',
    defaultSeverity: 'warning',
    confidence: 'high',
    heuristic: false,
    standards: [
      cwe(494, 'Download of Code Without Integrity Check'),
      scorecardCheck('Pinned-Dependencies', 'pinned-dependencies'),
      slsa,
    ],
    rationale:
      'A dependency taken from a git branch or a web address skips the registry, so there is no published version to audit, scan, or roll back to, and the code can change without any change in your project.',
    suggestion: {
      summary:
        'Depend on a released version from the registry. If you must use a repository or address, pin it to a full commit hash or a checksum.',
      before: '"widget": "github:acme/widget"',
      after: '"widget": "github:acme/widget#3f1c0a2b9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a"',
    },
  },
  options: z.strictObject({}),
  async check(repo) {
    const manifests = await readManifests(repo);
    return manifests.flatMap((manifest) =>
      manifest.dependencies
        .filter((dependency) => dependency.pinning === 'git' || dependency.pinning === 'url')
        .map((dependency) => {
          const fixed = FIXED_REFERENCE.test(dependency.spec);
          return {
            path: manifest.path,
            startLine: dependency.line,
            endLine: dependency.line,
            message: fixed
              ? `${dependency.name} comes from a ${dependency.pinning === 'git' ? 'repository' : 'web address'}, pinned to a fixed reference: prefer a registry release.`
              : `${dependency.name} comes from a ${dependency.pinning === 'git' ? 'repository' : 'web address'} without a pinned commit or checksum: it can change at any time.`,
            key: `remote:${dependency.name}`,
            ...(fixed ? { severity: 'info' as const } : {}),
          };
        }),
    );
  },
});
