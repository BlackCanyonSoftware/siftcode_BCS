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

/** How many package names a grouped finding lists before saying "and N more". */
const LISTED_NAMES = 5;

const label = (dependency: DependencyLicense): string =>
  dependency.version === undefined ? dependency.name : `${dependency.name} ${dependency.version}`;

/** "left-pad 1.3.0", or "12 dependencies (a, b, c, d, e, and 7 more)". */
function subject(members: readonly DependencyLicense[]): string {
  const [only] = members;
  if (members.length === 1 && only) {
    return label(only);
  }
  const names = members.slice(0, LISTED_NAMES).map(label).join(', ');
  const more = members.length > LISTED_NAMES ? `, and ${members.length - LISTED_NAMES} more` : '';
  return `${members.length} dependencies (${names}${more})`;
}

/** A finding about one or more dependencies of one manifest that share the same issue. */
interface Issue {
  readonly dependency: DependencyLicense;
  /** Dependencies with the same group are reported together. */
  readonly group: string;
  readonly severity: 'warning' | 'info';
  /** The sentence, given the subject and whether there is more than one. */
  readonly say: (who: string, plural: boolean) => string;
}

function toHits(issues: readonly Issue[], keyPrefix: string): RepoHit[] {
  const groups = new Map<string, Issue[]>();
  for (const issue of issues) {
    const key = `${issue.dependency.manifest}\n${issue.group}`;
    groups.set(key, [...(groups.get(key) ?? []), issue]);
  }
  return [...groups.values()].flatMap((members): RepoHit[] => {
    const [first] = members;
    if (!first) {
      return [];
    }
    const plural = members.length > 1;
    return [
      {
        path: first.dependency.manifest,
        startLine: 1,
        endLine: 1,
        message: `${first.say(subject(members.map((member) => member.dependency)), plural)} ${NOT_LEGAL_ADVICE}`,
        key: `${keyPrefix}:${first.group}`,
        severity: first.severity,
      },
    ];
  });
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
    const issues = dependencies.flatMap((dependency): Issue[] => {
      const claim =
        dependency.license === undefined
          ? undefined
          : classifyLicenseText(dependency.license, catalog);
      const assessment =
        claim?.kind === 'expression'
          ? assessDependency(project.effective, claim.expression)
          : undefined;
      if (claim?.kind !== 'expression' || !assessment) {
        return [];
      }
      const license = formatExpression(claim.expression);
      const source = assessment.sources[0];
      return [
        {
          dependency,
          group: `${license}|${assessment.kind}|${assessment.severity}`,
          severity: assessment.severity,
          say: (who, plural) =>
            `${who} ${plural ? 'are' : 'is'} licensed ${license}. ${assessment.reason}.${source ? ` (${source.standard}: ${source.url ?? ''})` : ''}`,
        },
      ];
    });
    return toHits(issues, 'conflict');
  },
});

/** Why a dependency's license text could not be used, or undefined when it can. */
function unclearIssue(dependency: DependencyLicense, catalog: Catalog): Issue | undefined {
  if (dependency.license === undefined) {
    return undefined;
  }
  const claim = classifyLicenseText(dependency.license, catalog);
  const group = `${claim.kind}|${claim.raw}`;
  switch (claim.kind) {
    case 'proprietary':
      return {
        dependency,
        group,
        severity: 'warning',
        say: (who, plural) =>
          `${who} ${plural ? 'state' : 'states'} "${claim.raw}", meaning no license is granted (all rights reserved): you may not have permission to use ${plural ? 'them' : 'it'}.`,
      };
    case 'see-file':
      return {
        dependency,
        group,
        severity: 'info',
        say: (who, plural) =>
          `${who} ${plural ? 'say' : 'says'} "${claim.raw}": the license is in a file SiftCode does not read.`,
      };
    case 'invalid':
      return {
        dependency,
        group,
        severity: 'info',
        say: (who, plural) =>
          `${who} ${plural ? 'state' : 'states'} the license "${claim.raw}", which is not an SPDX expression (for example "BSD" does not say which BSD license): check the package.`,
      };
    case 'expression': {
      const known = licensesIn(claim.expression).some((entry) =>
        traitsOf(entry.id, entry.exception),
      );
      const license = formatExpression(claim.expression);
      return known
        ? undefined
        : {
            dependency,
            group: `unclassified|${license}`,
            severity: 'info',
            say: (who, plural) =>
              `${who} ${plural ? 'are' : 'is'} licensed ${license}, which SiftCode’s compatibility table (version ${COMPATIBILITY_TABLE_VERSION}) does not cover: check its terms.`,
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
    if (missing.length === 0) {
      return [];
    }
    return [
      {
        path: manifest,
        startLine: 1,
        endLine: 1,
        message: `${missing.length} of ${all.length} runtime dependencies of ${manifest} have no license information available offline (${subject(
          missing,
        )
          .replace(/^\d+ dependencies \(/, '')
          .replace(
            /\)$/,
            '',
          )}): install them, or commit a lockfile that records licenses, so they can be checked. ${NOT_LEGAL_ADVICE}`,
        key: `unknown:${manifest}`,
        severity: 'info',
      },
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
    const issues = dependencies.flatMap((dependency) => {
      const issue = unclearIssue(dependency, catalog);
      return issue ? [issue] : [];
    });
    return [...toHits(issues, 'unclear'), ...missingInformation(dependencies)];
  },
});
