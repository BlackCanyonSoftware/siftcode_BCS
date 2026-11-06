import { z } from 'zod';
import { defineRepoRule } from '../define.js';
import { osiLicenses, spdxLicenses } from '../standards.js';
import type { RepoHit } from '../types.js';
import { loadCatalog, type Catalog } from './catalog.js';
import {
  assessDependency,
  COMPATIBILITY_SOURCES,
  COMPATIBILITY_TABLE_VERSION,
  traitsOf,
} from './compatibility.js';
import { collectDependencyLicenses, type DependencyLicense } from './dependencies.js';
import { NOT_LEGAL_ADVICE } from './messages.js';
import { classifyLicenseText, detectProjectLicense } from './project.js';
import { formatExpression, licensesIn } from './spdx.js';

const label = (dependency: DependencyLicense): string =>
  dependency.version === undefined ? dependency.name : `${dependency.name} ${dependency.version}`;

function hit(
  dependency: DependencyLicense,
  key: string,
  message: string,
  severity: 'warning' | 'info',
): RepoHit {
  return {
    path: dependency.manifest,
    startLine: 1,
    endLine: 1,
    message: `${message} ${NOT_LEGAL_ADVICE}`,
    key,
    severity,
  };
}

export const dependencyLicenseConflicts = defineRepoRule({
  meta: {
    id: 'SC-LIC-007',
    title: 'A dependency’s license conflicts with the project’s',
    category: 'licensing',
    defaultSeverity: 'warning',
    confidence: 'medium',
    heuristic: true,
    standards: [spdxLicenses, osiLicenses, ...COMPATIBILITY_SOURCES],
    rationale: `A dependency under strong copyleft (GPL, AGPL) can force the whole program that includes it to be offered under that license; some licenses cannot be combined at all (Apache-2.0 with GPL version 2 only); and source-available or non-commercial licenses (SSPL, BUSL, CC-BY-NC) restrict how the software may be used. The rule reads each dependency’s license from what is installed or recorded in the lockfile and compares it with the project’s license using a cited table (version ${COMPATIBILITY_TABLE_VERSION}). It cannot tell whether the dependency is linked, bundled, or only run as a separate program, which changes the answer.`,
    suggestion: {
      summary:
        'Look for an alternative under a license that fits the project, ask the author for a different license, keep the dependency out of what you distribute (a separate program, a build tool), or change the project’s license if that is acceptable. Ask a lawyer before shipping if it matters.',
    },
  },
  options: z.strictObject({}),
  async check(repo) {
    const [catalog, project, dependencies] = await Promise.all([
      loadCatalog(),
      detectProjectLicense(repo),
      collectDependencyLicenses(repo),
    ]);
    return dependencies.flatMap((dependency): RepoHit[] => {
      const claim =
        dependency.license === undefined
          ? undefined
          : classifyLicenseText(dependency.license, catalog);
      if (claim?.kind !== 'expression') {
        return [];
      }
      const assessment = assessDependency(project.effective, claim.expression);
      if (!assessment) {
        return [];
      }
      const source = assessment.sources[0];
      return [
        hit(
          dependency,
          `conflict:${dependency.ecosystem}:${dependency.name}`,
          `${label(dependency)} is licensed ${formatExpression(claim.expression)}. ${assessment.reason}.${source ? ` (${source.standard}: ${source.url ?? ''})` : ''}`,
          assessment.severity,
        ),
      ];
    });
  },
});

/** Why a license text could not be used, or undefined when it can. */
function unusableReason(
  dependency: DependencyLicense,
  catalog: Catalog,
): { text: string; severity: 'warning' | 'info' } | undefined {
  if (dependency.license === undefined) {
    return undefined;
  }
  const claim = classifyLicenseText(dependency.license, catalog);
  switch (claim.kind) {
    case 'proprietary':
      return {
        text: `${label(dependency)} states "${claim.raw}", meaning no license is granted (all rights reserved): you may not have permission to use it`,
        severity: 'warning',
      };
    case 'see-file':
      return {
        text: `${label(dependency)} says "${claim.raw}": its license is in a file SiftCode does not read`,
        severity: 'info',
      };
    case 'invalid':
      return {
        text: `${label(dependency)} states the license "${claim.raw}", which is not an SPDX expression (for example "BSD" does not say which BSD license): check the package`,
        severity: 'info',
      };
    case 'expression': {
      const known = licensesIn(claim.expression).some((entry) =>
        traitsOf(entry.id, entry.exception),
      );
      return known
        ? undefined
        : {
            text: `${label(dependency)} is licensed ${formatExpression(claim.expression)}, which SiftCode’s compatibility table (version ${COMPATIBILITY_TABLE_VERSION}) does not cover: check its terms`,
            severity: 'info',
          };
    }
  }
}

/** Dependencies with no license information offline, one finding per manifest. */
function missingInformation(dependencies: readonly DependencyLicense[]): RepoHit[] {
  const byManifest = new Map<string, DependencyLicense[]>();
  for (const dependency of dependencies) {
    byManifest.set(dependency.manifest, [
      ...(byManifest.get(dependency.manifest) ?? []),
      dependency,
    ]);
  }
  return [...byManifest].flatMap(([manifest, all]): RepoHit[] => {
    const missing = all.filter((dependency) => dependency.license === undefined);
    const [first] = missing;
    if (!first) {
      return [];
    }
    const names = missing
      .slice(0, 5)
      .map((dependency) => dependency.name)
      .join(', ');
    const more = missing.length > 5 ? `, and ${missing.length - 5} more` : '';
    return [
      hit(
        { ...first, manifest },
        `unknown:${manifest}`,
        `${missing.length} of ${all.length} runtime dependencies of ${manifest} have no license information available offline (${names}${more}): install them, or commit a lockfile that records licenses, so they can be checked.`,
        'info',
      ),
    ];
  });
}

export const unknownDependencyLicenses = defineRepoRule({
  meta: {
    id: 'SC-LIC-008',
    title: 'A dependency’s license is missing, unclear, or not granted',
    category: 'licensing',
    defaultSeverity: 'info',
    confidence: 'medium',
    heuristic: true,
    standards: [spdxLicenses, osiLicenses],
    rationale:
      'A dependency with no license is “all rights reserved”, and one whose license cannot be identified (“BSD”, a text pointing at a file) cannot be checked against yours. SiftCode only reads what is on disk, so a dependency that is not installed and not in a lockfile with licenses is reported as unknown instead of being guessed at.',
    suggestion: {
      summary:
        'Install the dependencies or commit a lockfile so their licenses can be read; for a package with an unclear license, check its repository or ask its author, and replace it if no license is granted.',
    },
  },
  options: z.strictObject({}),
  async check(repo) {
    const [catalog, dependencies] = await Promise.all([
      loadCatalog(),
      collectDependencyLicenses(repo),
    ]);
    const unclear = dependencies.flatMap((dependency): RepoHit[] => {
      const reason = unusableReason(dependency, catalog);
      return reason
        ? [
            hit(
              dependency,
              `unclear:${dependency.ecosystem}:${dependency.name}`,
              `${reason.text}.`,
              reason.severity,
            ),
          ]
        : [];
    });
    return [...unclear, ...missingInformation(dependencies)];
  },
});
