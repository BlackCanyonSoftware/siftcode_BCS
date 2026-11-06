import type { StandardRef } from '../types.js';
import { licenseFamily, type Expression } from './spdx.js';

/**
 * The compatibility table: how SiftCode sorts licenses, and which combinations of a project
 * license and a dependency license it reports. It is data with a version and a source for every
 * claim, meant to be reviewed by a person (PRD risk R8). It is a screening aid, not legal advice:
 * it does not know whether a dependency is linked, bundled, or only run as a separate program.
 */
export const COMPATIBILITY_TABLE_VERSION = '1 (2026-11-05)';

/**
 * - `permissive`: may be used in almost any project if the notice is kept (MIT, BSD, Apache-2.0)
 * - `public-domain`: no conditions (Unlicense, CC0)
 * - `weak-copyleft`: changes to the library itself stay under its license (LGPL, MPL, EPL)
 * - `strong-copyleft`: a work that includes it has to be offered under the same license (GPL)
 * - `network-copyleft`: as strong, and it also applies to software used over a network (AGPL)
 * - `restricted`: source-available or limits who may use it or how (SSPL, BUSL, non-commercial)
 * - `proprietary`: all rights reserved
 */
export type Family =
  | 'permissive'
  | 'public-domain'
  | 'weak-copyleft'
  | 'strong-copyleft'
  | 'network-copyleft'
  | 'restricted'
  | 'proprietary';

export interface Traits {
  readonly family: Family;
  /** For the GNU licenses: the major version and whether later versions are allowed. */
  readonly gpl?: { readonly version: 2 | 3; readonly orLater: boolean };
}

export const GNU_LICENSE_LIST: StandardRef = {
  standard: 'GNU Project: Various Licenses and Comments about Them',
  url: 'https://www.gnu.org/licenses/license-list.html',
};
export const GPL_FAQ: StandardRef = {
  standard: 'GNU GPL FAQ: combining works under different licenses',
  url: 'https://www.gnu.org/licenses/gpl-faq.html#AllCompatibility',
};
export const GPL_3: StandardRef = {
  standard: 'GNU General Public License, version 3',
  url: 'https://www.gnu.org/licenses/gpl-3.0.html',
};
export const AGPL_3: StandardRef = {
  standard: 'GNU Affero General Public License, version 3 (section 13)',
  url: 'https://www.gnu.org/licenses/agpl-3.0.html',
};
export const LGPL_3: StandardRef = {
  standard: 'GNU Lesser General Public License, version 3',
  url: 'https://www.gnu.org/licenses/lgpl-3.0.html',
};
export const APACHE_GPL: StandardRef = {
  standard: 'Apache Software Foundation: Apache License v2.0 and GPL compatibility',
  url: 'https://www.apache.org/licenses/GPL-compatibility.html',
};
export const MPL_FAQ: StandardRef = {
  standard: 'Mozilla Public License 2.0 FAQ',
  url: 'https://www.mozilla.org/en-US/MPL/2.0/FAQ/',
};
export const SSPL: StandardRef = {
  standard: 'Server Side Public License v1 (MongoDB)',
  url: 'https://www.mongodb.com/legal/licensing/server-side-public-license',
};
export const BUSL: StandardRef = {
  standard: 'Business Source License 1.1 (MariaDB)',
  url: 'https://mariadb.com/bsl11/',
};
export const ELASTIC: StandardRef = {
  standard: 'Elastic License 2.0',
  url: 'https://www.elastic.co/licensing/elastic-license',
};
export const CC_NC: StandardRef = {
  standard: 'Creative Commons Attribution-NonCommercial 4.0 legal code',
  url: 'https://creativecommons.org/licenses/by-nc/4.0/legalcode',
};

/** Every source the table rests on, for the rules' standards lists. */
export const COMPATIBILITY_SOURCES: readonly StandardRef[] = [
  GNU_LICENSE_LIST,
  GPL_FAQ,
  GPL_3,
  AGPL_3,
  LGPL_3,
  APACHE_GPL,
  MPL_FAQ,
  SSPL,
  BUSL,
  ELASTIC,
  CC_NC,
];

const PERMISSIVE = [
  'MIT',
  'MIT-0',
  'Apache-2.0',
  'Apache-1.1',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BSD-3-Clause-Clear',
  'BSD-4-Clause',
  '0BSD',
  'ISC',
  'Zlib',
  'BSL-1.0',
  'PostgreSQL',
  'NCSA',
  'X11',
  'Python-2.0',
  'PSF-2.0',
  'Unicode-3.0',
  'Unicode-DFS-2016',
  'BlueOak-1.0.0',
  'UPL-1.0',
  'Artistic-2.0',
  'AFL-3.0',
  'OFL-1.1',
  'MS-PL',
  'WTFPL',
  'CC-BY-3.0',
  'CC-BY-4.0',
  'BSD-1-Clause',
  'curl',
  'Libpng',
  'FTL',
  'HPND',
  'JSON',
  'Beerware',
  'MIT-CMU',
  'MIT-Modern-Variant',
  'BSD-2-Clause-Patent',
  'BSD-3-Clause-Attribution',
  'BSD-3-Clause-LBNL',
  'BSD-Source-Code',
  'CNRI-Python',
  'Python-2.0.1',
  'W3C',
  'W3C-20150513',
  'ImageMagick',
  'IJG',
  'Info-ZIP',
  'Ruby',
  'TCL',
  'ICU',
  'Apache-1.0',
  'OpenSSL',
  'CC-BY-2.0',
  'CC-BY-2.5',
];
const PUBLIC_DOMAIN = ['Unlicense', 'CC0-1.0'];
const WEAK_COPYLEFT = [
  'MPL-1.1',
  'MPL-2.0',
  'EPL-1.0',
  'EPL-2.0',
  'CDDL-1.0',
  'CDDL-1.1',
  'MS-RL',
  'LGPL-2.0',
  'LGPL-2.1',
  'LGPL-3.0',
];
/** Copyleft that is not the GNU GPL but applies to the whole work. */
const OTHER_STRONG_COPYLEFT = ['EUPL-1.2', 'OSL-3.0', 'CC-BY-SA-3.0', 'CC-BY-SA-4.0'];
const RESTRICTED = ['SSPL-1.0', 'BUSL-1.1', 'Elastic-2.0', 'Commons-Clause'];

/** What each restricted license limits, in a sentence. */
const RESTRICTION: Readonly<Record<string, { text: string; source: StandardRef }>> = {
  'SSPL-1.0': {
    text: 'offering the software as a service requires releasing the source of the whole service stack',
    source: SSPL,
  },
  'BUSL-1.1': {
    text: 'production use is limited until the change date set by the licensor',
    source: BUSL,
  },
  'Elastic-2.0': {
    text: 'it may not be provided to others as a managed service, and license-key features may not be worked around',
    source: ELASTIC,
  },
  'Commons-Clause': { text: 'the software may not be sold', source: GNU_LICENSE_LIST },
};
const NON_COMMERCIAL =
  /^(?:CC-BY(?:-SA)?-NC|CC-BY-ND|CC-BY-NC)|^PolyForm-(?:Noncommercial|Small-Business)/i;

/** Licenses the FSF lists as incompatible with the GNU GPL, whatever the version. */
const GPL_INCOMPATIBLE = new Set([
  'BSD-4-Clause',
  'Apache-1.0',
  'Apache-1.1',
  'OpenSSL',
  'CDDL-1.0',
  'CDDL-1.1',
  'EPL-1.0',
  'MPL-1.1',
  'OSL-3.0',
  'AFL-3.0',
]);

const KNOWN = new Map<string, Traits>([
  ...PERMISSIVE.map((id): [string, Traits] => [id.toLowerCase(), { family: 'permissive' }]),
  ...PUBLIC_DOMAIN.map((id): [string, Traits] => [id.toLowerCase(), { family: 'public-domain' }]),
  ...OTHER_STRONG_COPYLEFT.map((id): [string, Traits] => [
    id.toLowerCase(),
    { family: 'strong-copyleft' },
  ]),
  ...RESTRICTED.map((id): [string, Traits] => [id.toLowerCase(), { family: 'restricted' }]),
  ['licenseref-proprietary', { family: 'proprietary' }],
]);

const GNU_ID = /^(A?GPL|LGPL)-(\d)\.(\d)(?:-(only|or-later))?$/;

function gnuTraits(id: string): Traits | undefined {
  const match = GNU_ID.exec(id);
  if (!match) {
    return undefined;
  }
  const kind = match[1];
  const version = match[2] === '3' ? 3 : 2;
  const orLater = match[4] === 'or-later';
  const family: Family =
    kind === 'AGPL' ? 'network-copyleft' : kind === 'LGPL' ? 'weak-copyleft' : 'strong-copyleft';
  return { family, gpl: { version, orLater } };
}

/** Exceptions that let a GNU-licensed library be linked without making the whole work GPL. */
const LINKING_EXCEPTIONS = new Set([
  'classpath-exception-2.0',
  'gcc-exception-2.0',
  'gcc-exception-3.1',
  'lgpl-3.0-linking-exception',
  'openjdk-assembly-exception-1.0',
]);

/** How a license is sorted, or undefined when it is not in the table. */
export function traitsOf(id: string, exception?: string): Traits | undefined {
  const base = gnuTraits(id) ?? KNOWN.get(id.toLowerCase()) ?? weakByFamily(id);
  if (base?.gpl && base.family === 'strong-copyleft' && exception !== undefined) {
    return LINKING_EXCEPTIONS.has(exception.toLowerCase())
      ? { ...base, family: 'weak-copyleft' }
      : base;
  }
  if (base || !NON_COMMERCIAL.test(id)) {
    return base;
  }
  return { family: 'restricted' };
}

function weakByFamily(id: string): Traits | undefined {
  return WEAK_COPYLEFT.some((weak) => licenseFamily(id).toLowerCase() === weak.toLowerCase())
    ? { family: 'weak-copyleft' }
    : undefined;
}

export type AssessmentKind =
  'copyleft' | 'network-copyleft' | 'incompatible' | 'restricted' | 'obligation';

export interface Assessment {
  readonly kind: AssessmentKind;
  readonly severity: 'warning' | 'info';
  /** What is wrong or asked, in a sentence about the two licenses. */
  readonly reason: string;
  readonly sources: readonly StandardRef[];
}

interface Leaf {
  readonly id: string;
  readonly traits: Traits;
}

const rank = (assessment: Assessment | undefined): number =>
  assessment === undefined ? 0 : assessment.severity === 'info' ? 1 : 2;

function restricted(dependency: Leaf): Assessment {
  const known = RESTRICTION[dependency.id];
  return {
    kind: 'restricted',
    severity: 'warning',
    reason: `${dependency.id} is not an open-source license: ${known?.text ?? 'it limits who may use the software or for what, for example to non-commercial use'}`,
    sources: [known?.source ?? CC_NC, GNU_LICENSE_LIST],
  };
}

/** Strong or network copyleft dependency in a project under a license that is not copyleft. */
function copyleftInOtherProject(project: Leaf, dependency: Leaf): Assessment {
  const proprietary = project.traits.family === 'proprietary';
  const target = proprietary ? 'a proprietary project' : `the project’s ${project.id}`;
  // MPL-2.0 expressly allows combining with the GNU licenses; the result is then GNU-licensed.
  const severity = project.id === 'MPL-2.0' ? 'info' : 'warning';
  if (dependency.traits.family === 'network-copyleft') {
    return {
      kind: 'network-copyleft',
      severity,
      reason: `${dependency.id} also covers software used over a network: if it is combined into ${target}, everyone who uses the service must be offered the complete source under ${dependency.id}`,
      sources: [AGPL_3, GPL_FAQ],
    };
  }
  const conflict = proprietary ? '' : `, which ${project.id} does not provide`;
  return {
    kind: 'copyleft',
    severity,
    reason: `${dependency.id} is strong copyleft: if it is bundled or linked into ${target}, the combined work has to be offered under ${dependency.id}${conflict}`,
    sources: [GPL_3, GPL_FAQ],
  };
}

const incompatible = (reason: string, ...sources: StandardRef[]): Assessment => ({
  kind: 'incompatible',
  severity: 'warning',
  reason,
  sources,
});

/** Both licenses are GNU licenses: the version rules of the GPL family. */
function gnuAgainstGnu(project: Leaf, dependency: Leaf): Assessment | undefined {
  const p = project.traits.gpl;
  const d = dependency.traits.gpl;
  if (!p || !d) {
    return undefined;
  }
  const dependencyIsNewer = d.version === 3 && !(p.version === 3 || p.orLater);
  const dependencyIsOlderOnly = p.version === 3 && d.version === 2 && !d.orLater;
  if (dependencyIsNewer) {
    return incompatible(
      `${dependency.id} is version 3 code and ${project.id} allows only version 2: version 2 only cannot take in code that comes with version 3 terms`,
      GNU_LICENSE_LIST,
      GPL_FAQ,
    );
  }
  return dependencyIsOlderOnly
    ? incompatible(
        `${dependency.id} allows only version 2 and ${project.id} is version 3: code limited to version 2 cannot be relicensed under version 3`,
        GNU_LICENSE_LIST,
        GPL_FAQ,
      )
    : undefined;
}

/** A permissive or weak-copyleft dependency in a GNU-licensed project. */
function otherAgainstGnu(project: Leaf, dependency: Leaf): Assessment | undefined {
  const p = project.traits.gpl;
  if (!p) {
    return undefined;
  }
  if (GPL_INCOMPATIBLE.has(dependency.id)) {
    return incompatible(
      `${dependency.id} is listed by the Free Software Foundation as incompatible with the GNU GPL`,
      GNU_LICENSE_LIST,
    );
  }
  if (dependency.id === 'Apache-2.0' && p.version === 2 && !p.orLater) {
    return incompatible(
      'Apache-2.0 is incompatible with GPL version 2 only (its patent terms are an extra restriction); version 3 is compatible',
      APACHE_GPL,
      GNU_LICENSE_LIST,
    );
  }
  if (dependency.id === 'EPL-2.0') {
    return {
      kind: 'incompatible',
      severity: 'info',
      reason:
        'EPL-2.0 can be combined with the GNU GPL only when its authors named the GPL as a "Secondary License"',
      sources: [GNU_LICENSE_LIST],
    };
  }
  return dependency.traits.gpl?.version === 3 && p.version === 2 && !p.orLater
    ? gnuAgainstGnu(project, dependency)
    : undefined;
}

/** A weak-copyleft dependency in a project that is not itself copyleft. */
function weakInOtherProject(project: Leaf, dependency: Leaf): Assessment {
  const extra = dependency.id.startsWith('LGPL')
    ? 'users must be able to replace the library with their own version'
    : 'the source of those files must be available to recipients';
  const target =
    project.traits.family === 'proprietary'
      ? 'a proprietary project'
      : `the project’s ${project.id}`;
  return {
    kind: 'obligation',
    severity: 'info',
    reason: `${dependency.id} is weak copyleft: changes to the library itself have to stay under ${dependency.id}, and ${extra}; using it unchanged in ${target} is normally fine`,
    sources: [dependency.id.startsWith('LGPL') ? LGPL_3 : MPL_FAQ, GNU_LICENSE_LIST],
  };
}

const COPYLEFT_PROJECT = new Set<Family>(['strong-copyleft', 'network-copyleft']);

function assessLeaf(project: Leaf | undefined, dependency: Leaf): Assessment | undefined {
  const family = dependency.traits.family;
  if (family === 'restricted') {
    return restricted(dependency);
  }
  if (!project) {
    return undefined;
  }
  const inCopyleftProject = COPYLEFT_PROJECT.has(project.traits.family);
  if (family === 'strong-copyleft' || family === 'network-copyleft') {
    return inCopyleftProject
      ? (gnuAgainstGnu(project, dependency) ?? otherAgainstGnu(project, dependency))
      : copyleftInOtherProject(project, dependency);
  }
  if (inCopyleftProject) {
    return otherAgainstGnu(project, dependency);
  }
  return family === 'weak-copyleft' && project.traits.family !== 'weak-copyleft'
    ? weakInOtherProject(project, dependency)
    : undefined;
}

function leafOf(expression: Extract<Expression, { kind: 'license' }>): Leaf | undefined {
  const traits = traitsOf(expression.id, expression.exception);
  return traits ? { id: expression.id, traits } : undefined;
}

/** The one an OR lets you pick: no problem beats a note, which beats a warning. */
const easier = (a: Assessment | undefined, b: Assessment | undefined): Assessment | undefined =>
  rank(a) <= rank(b) ? a : b;
/** Everything an AND asks for: the more serious of the two. */
const stricter = (a: Assessment | undefined, b: Assessment | undefined): Assessment | undefined =>
  rank(a) >= rank(b) ? a : b;

function assessAgainst(project: Leaf | undefined, dependency: Expression): Assessment | undefined {
  if (dependency.kind === 'license') {
    const leaf = leafOf(dependency);
    return leaf ? assessLeaf(project, leaf) : undefined;
  }
  const left = assessAgainst(project, dependency.left);
  const right = assessAgainst(project, dependency.right);
  return dependency.kind === 'or' ? easier(left, right) : stricter(left, right);
}

/**
 * What a dependency's license means for a project under `project`, or undefined when the table
 * finds nothing to report. `OR` lets the user pick the easier side (of the dependency's license,
 * and of a dual-licensed project); `AND` asks for both.
 */
export function assessDependency(
  project: Expression | undefined,
  dependency: Expression,
): Assessment | undefined {
  if (project === undefined) {
    return assessAgainst(undefined, dependency);
  }
  if (project.kind === 'license') {
    return assessAgainst(leafOf(project), dependency);
  }
  const left = assessDependency(project.left, dependency);
  const right = assessDependency(project.right, dependency);
  return project.kind === 'or' ? easier(left, right) : stricter(left, right);
}

/** True when every license in the expression is in the table. */
export function isClassified(expression: Expression): boolean {
  return expression.kind === 'license'
    ? traitsOf(expression.id, expression.exception) !== undefined
    : isClassified(expression.left) && isClassified(expression.right);
}
