import { z } from 'zod';
import { anchorPath, isProject } from '../anchor.js';
import { defineRepoRule } from '../define.js';
import { osiLicenses, reuseSpecification, scorecardCheck, spdxLicenses } from '../standards.js';
import type { RepoHit, RepoView } from '../types.js';
import { identificationIds } from './messages.js';
import {
  detectProjectLicense,
  type DeclaredLicense,
  type LicenseFile,
  type ProjectLicense,
} from './project.js';
import { licenseFamily, licensesIn } from './spdx.js';

const hit = (
  path: string,
  key: string,
  message: string,
  severity?: RepoHit['severity'],
): RepoHit => ({
  path,
  startLine: 1,
  endLine: 1,
  message,
  key,
  ...(severity ? { severity } : {}),
});

/** Stands for a license that reserves all rights, when comparing what files and manifests say. */
const PROPRIETARY = 'proprietary';

/** The licenses (as families) a project's license files contain. */
const familiesInFiles = (files: readonly LicenseFile[]): Set<string> =>
  new Set(
    files.flatMap((file) =>
      file.proprietary ? [PROPRIETARY] : identificationIds(file.identification).map(licenseFamily),
    ),
  );

export const noLicense = defineRepoRule({
  meta: {
    id: 'SC-LIC-001',
    title: 'The project has no license',
    category: 'licensing',
    defaultSeverity: 'warning',
    confidence: 'high',
    heuristic: false,
    standards: [spdxLicenses, reuseSpecification, scorecardCheck('License', 'license')],
    rationale:
      'Code with no license is "all rights reserved" by default: nobody else may legally use, change, or share it, and companies will not adopt it. Choosing a license is the owner’s decision, but leaving it out is rarely the intent.',
    suggestion: {
      summary:
        'Add a LICENSE file with the full text of an SPDX-listed license (for example MIT or Apache-2.0 for a permissive one; choosealicense.com helps compare), and declare it in your package manifest.',
      before: '# no license',
      after: '"license": "Apache-2.0"   // package.json, plus a LICENSE file',
    },
  },
  options: z.strictObject({}),
  async check(repo) {
    if (!isProject(repo)) {
      return [];
    }
    const license = await detectProjectLicense(repo);
    return license.files.length > 0 || license.declared.length > 0
      ? []
      : [
          hit(
            anchorPath(repo),
            'no-license',
            'No license was found: there is no LICENSE file and no license declared in package.json, pyproject.toml, or a .csproj. Without one, others have no permission to use, change, or share this code.',
          ),
        ];
  },
});

export const unrecognizedLicenseFile = defineRepoRule({
  meta: {
    id: 'SC-LIC-002',
    title: 'The license file is not a standard license text',
    category: 'licensing',
    defaultSeverity: 'info',
    confidence: 'medium',
    heuristic: true,
    standards: [spdxLicenses, osiLicenses, reuseSpecification],
    rationale:
      'A license that is edited or custom cannot be identified by tools, so users, scanners, and package registries cannot tell what they may do; a changed standard license also no longer means what the well-known original means.',
    suggestion: {
      summary:
        'Use the unmodified text of an SPDX-listed license. If custom terms are really intended, keep them in a file with a clear name and say so in the README.',
    },
  },
  options: z.strictObject({}),
  async check(repo) {
    if (!isProject(repo)) {
      return [];
    }
    const { files } = await detectProjectLicense(repo);
    return files.flatMap((file): RepoHit[] => {
      const { identification } = file;
      if (file.proprietary) {
        return [];
      }
      if (identification.kind === 'modified') {
        return [
          hit(
            file.path,
            `modified:${file.path}`,
            `${file.path} looks like ${identification.ids.join(' or ')} with added or removed wording (${Math.round(identification.score * 100)}% similar to the standard text): if you meant the standard license, restore its unmodified text.`,
          ),
        ];
      }
      return identification.kind === 'unrecognized'
        ? [
            hit(
              file.path,
              `unrecognized:${file.path}`,
              `${file.path} is not a license text SiftCode recognizes: it may be custom or unusual terms, or it may not be a license at all.`,
            ),
          ]
        : [];
    });
  },
});

/** Describes a declared license for a message. */
const describeDeclared = (declared: DeclaredLicense): string =>
  `${declared.path} declares "${declared.raw}"`;

function declarationProblems(license: ProjectLicense): RepoHit[] {
  return license.declared.flatMap((declared): RepoHit[] => {
    if (declared.kind === 'invalid') {
      return [
        hit(
          declared.path,
          `invalid:${declared.path}`,
          `${describeDeclared(declared)}, which is not a valid SPDX expression (${declared.reason}): write an SPDX identifier such as MIT or Apache-2.0 so tools can read it.`,
          'info',
        ),
      ];
    }
    if (declared.kind !== 'expression') {
      return [];
    }
    const unknown = licensesIn(declared.expression).filter(
      (entry) =>
        !entry.known && !entry.id.startsWith('LicenseRef-') && !entry.id.startsWith('DocumentRef-'),
    );
    return unknown.map((entry) =>
      hit(
        declared.path,
        `unknown-id:${declared.path}:${entry.id}`,
        `${describeDeclared(declared)}, and "${entry.id}" is not on the SPDX license list: check the spelling.`,
        'info',
      ),
    );
  });
}

function mismatches(license: ProjectLicense): RepoHit[] {
  const inFiles = familiesInFiles(license.files);
  if (inFiles.size === 0) {
    return [];
  }
  return license.declared.flatMap((declared): RepoHit[] => {
    const shown = (families: readonly string[]): string =>
      families
        .map((family) => (family === PROPRIETARY ? 'an all-rights-reserved notice' : family))
        .join(', ');
    if (declared.kind === 'proprietary') {
      const open = [...inFiles].filter((family) => family !== PROPRIETARY);
      return open.length === 0
        ? []
        : [
            hit(
              declared.path,
              `mismatch:${declared.path}`,
              `${describeDeclared(declared)}, but the license files contain ${shown(open)}: one of them is wrong.`,
            ),
          ];
    }
    if (declared.kind !== 'expression') {
      return [];
    }
    const declaredFamilies = new Set(
      licensesIn(declared.expression).map((entry) => licenseFamily(entry.id)),
    );
    const missing = [...declaredFamilies].filter((family) => !inFiles.has(family));
    const extra = [...inFiles].filter((family) => !declaredFamilies.has(family));
    if (missing.length === 0 && extra.length === 0) {
      return [];
    }
    const parts = [
      ...(missing.length > 0 ? [`no license file contains ${shown(missing)}`] : []),
      ...(extra.length > 0 ? [`the license files also contain ${shown(extra)}`] : []),
    ];
    return [
      hit(
        declared.path,
        `mismatch:${declared.path}`,
        `${describeDeclared(declared)}, but ${parts.join(' and ')}: make the declaration and the files agree.`,
      ),
    ];
  });
}

export const licenseDeclarationMismatch = defineRepoRule({
  meta: {
    id: 'SC-LIC-003',
    title: 'The declared license is invalid or differs from the license file',
    category: 'licensing',
    defaultSeverity: 'warning',
    confidence: 'high',
    heuristic: false,
    standards: [spdxLicenses, reuseSpecification],
    rationale:
      'When the manifest says one license and the LICENSE file contains another, users and tools cannot know which applies; a declaration that is not an SPDX expression (“MIT License”, “Apache 2.0”) cannot be read by registries and scanners at all.',
    suggestion: {
      summary:
        'Declare the license as an SPDX expression (MIT, Apache-2.0, MIT OR Apache-2.0) and make sure the LICENSE file holds the same license.',
      before: '"license": "MIT License"',
      after: '"license": "MIT"',
    },
  },
  options: z.strictObject({}),
  async check(repo) {
    if (!isProject(repo)) {
      return [];
    }
    const license = await detectProjectLicense(repo);
    return [...declarationProblems(license), ...mismatches(license)];
  },
});

/** Licenses that require the copyright notice to be kept, so the file must name a holder. */
const NEEDS_COPYRIGHT_LINE = new Set([
  'MIT',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BSD-4-Clause',
  'ISC',
  'X11',
  'NCSA',
]);

const PLACEHOLDER =
  /<year>|<copyright holders?>|<name of author>|<fullname>|\[yyyy\]|\[year\]|\[name of copyright owner\]|\[fullname\]|\[copyright holders?\]|\{yyyy\}/i;
/** Optional "how to apply" sections of the Apache, GPL, and MPL texts hold placeholders on purpose. */
const BOILERPLATE_START =
  /APPENDIX: How to apply|How to Apply These Terms to Your New Programs|Exhibit A\s*[-–—]\s*Source Code Form License Notice/i;

function noticeProblem(file: LicenseFile): RepoHit | undefined {
  const { identification } = file;
  if (identification.kind !== 'match' && identification.kind !== 'modified') {
    return undefined;
  }
  const text = file.text.slice(0, BOILERPLATE_START.exec(file.text)?.index ?? file.text.length);
  const placeholder = PLACEHOLDER.exec(text)?.[0];
  if (placeholder !== undefined) {
    return hit(
      file.path,
      `placeholder:${file.path}`,
      `${file.path} still contains the template placeholder "${placeholder}": fill in the year and the copyright holder.`,
    );
  }
  const needsLine = identification.ids.some((id) => NEEDS_COPYRIGHT_LINE.has(id));
  return needsLine && !/^\s*(?:copyright|\(c\)|©)\s*.{3,}/im.test(text)
    ? hit(
        file.path,
        `no-copyright-line:${file.path}`,
        `${file.path} has no copyright line: ${identification.ids.join(' or ')} requires the copyright holder to be named (for example "Copyright (c) 2026 Your Name").`,
        'info',
      )
    : undefined;
}

export const licenseNotices = defineRepoRule({
  meta: {
    id: 'SC-LIC-004',
    title: 'The license file is missing its copyright holder or has unfilled placeholders',
    category: 'licensing',
    defaultSeverity: 'warning',
    confidence: 'high',
    heuristic: false,
    standards: [spdxLicenses, osiLicenses],
    rationale:
      'MIT, BSD, and ISC licenses grant permission on condition that the copyright notice is kept; with no holder named, or with “[yyyy] [name of copyright owner]” still in the text, it is unclear who granted the license.',
    suggestion: {
      summary:
        'Replace the placeholders with the year and the copyright holder, and keep that line in the file.',
      before: 'Copyright (c) <year> <copyright holders>',
      after: 'Copyright (c) 2026 Black Canyon Software',
    },
  },
  options: z.strictObject({}),
  async check(repo) {
    if (!isProject(repo)) {
      return [];
    }
    const { files } = await detectProjectLicense(repo);
    return files.flatMap((file) => {
      const problem = noticeProblem(file);
      return problem ? [problem] : [];
    });
  },
});

const NOTICE_DOCUMENTS =
  /^(?:readme|notice|third[-_ ]?part(?:y|ies)|licenses?|attribution|credits|copyright|oss)[\w.-]*$/i;

async function documentationText(repo: RepoView): Promise<string> {
  const paths = repo.files.filter((path) => !path.includes('/') && NOTICE_DOCUMENTS.test(path));
  const texts = await Promise.all(paths.map((path) => repo.read(path)));
  return texts
    .filter((text) => text !== undefined)
    .join('\n')
    .toLowerCase();
}

export const undocumentedThirdPartyLicenses = defineRepoRule({
  meta: {
    id: 'SC-LIC-005',
    title: 'Bundled code carries a different license that the project does not mention',
    category: 'licensing',
    defaultSeverity: 'warning',
    confidence: 'medium',
    heuristic: true,
    standards: [spdxLicenses, reuseSpecification],
    rationale:
      'A folder with its own LICENSE file is code under different terms. Licenses such as MIT, BSD, and Apache-2.0 require their notice (and an Apache NOTICE file) to travel with the code, so the project must list what it bundles.',
    suggestion: {
      summary:
        'List each bundled component, its license, and where its license file is in a NOTICE or THIRD_PARTY file at the top of the project (the Apache-2.0 NOTICE text must be carried over as well).',
    },
  },
  options: z.strictObject({}),
  async check(repo) {
    if (!isProject(repo)) {
      return [];
    }
    const license = await detectProjectLicense(repo);
    const own = new Set(
      license.effective
        ? licensesIn(license.effective).map((entry) => licenseFamily(entry.id))
        : [],
    );
    const documented = await documentationText(repo);
    const hits: RepoHit[] = [];
    const seen = new Set<string>();
    for (const file of license.nested) {
      const folder = file.path.slice(0, file.path.lastIndexOf('/'));
      const ids = identificationIds(file.identification);
      const sameAsProject = ids.length > 0 && ids.every((id) => own.has(licenseFamily(id)));
      if (seen.has(folder) || sameAsProject || documented.includes(folder.toLowerCase())) {
        continue;
      }
      seen.add(folder);
      const what = ids.length > 0 ? ids.join(' or ') : 'an unrecognized license';
      const notice = repo.has(`${folder}/NOTICE`)
        ? ' It also has a NOTICE file that must be carried over.'
        : '';
      hits.push(
        hit(
          file.path,
          `third-party:${folder}`,
          `${folder} has its own license (${what}) and is not mentioned in the README, NOTICE, or a THIRD_PARTY file.${notice}`,
        ),
      );
    }
    return hits;
  },
});

const HEADER_SOURCE = /\.(?:js|jsx|mjs|cjs|ts|tsx|py|cs)$/;
const SPDX_TAG = /SPDX-License-Identifier:\s*([^\r\n*]*?)\s*(?:\*\/|-->|"""|$)/m;
/** How much of a file is searched for the tag. */
const HEADER_CHARS = 2000;
const MAX_HEADER_FILES = 1500;

async function readTag(repo: RepoView, path: string): Promise<string | undefined> {
  const text = await repo.read(path);
  return text === undefined ? undefined : SPDX_TAG.exec(text.slice(0, HEADER_CHARS))?.[1];
}

export const spdxHeaders = defineRepoRule({
  meta: {
    id: 'SC-LIC-006',
    title: 'Source file license headers are inconsistent',
    category: 'licensing',
    defaultSeverity: 'warning',
    confidence: 'medium',
    heuristic: true,
    standards: [reuseSpecification, spdxLicenses],
    rationale:
      'A project that tags its files with SPDX-License-Identifier headers is claiming a license per file. Files that name another license than the project’s, or that are left untagged among tagged ones, make the real terms of each file unclear.',
    suggestion: {
      summary:
        'Give every source file the same header, SPDX-License-Identifier: <the project license>, or remove the headers; the REUSE tool (reuse lint) checks this.',
      before: '# (no header in some files)',
      after: '# SPDX-License-Identifier: Apache-2.0',
    },
  },
  options: z.strictObject({}),
  async check(repo) {
    if (!isProject(repo)) {
      return [];
    }
    const paths = repo.files.filter((path) => HEADER_SOURCE.test(path)).slice(0, MAX_HEADER_FILES);
    const tags = await Promise.all(paths.map((path) => readTag(repo, path)));
    const tagged = paths.flatMap((path, index) =>
      tags[index] ? [{ path, tag: tags[index] }] : [],
    );
    if (tagged.length === 0) {
      return [];
    }
    const hits = [...(await otherLicenses(repo, tagged))];
    const untagged = paths.filter((_, index) => !tags[index]);
    const [firstUntagged] = untagged;
    if (firstUntagged !== undefined && tagged.length >= untagged.length) {
      hits.push(
        hit(
          firstUntagged,
          'untagged',
          `${untagged.length} of ${paths.length} source files have no SPDX-License-Identifier header while ${tagged.length} do: tag them all, or none.`,
          'info',
        ),
      );
    }
    return hits;
  },
});

/** One hit per license named in headers that the project's own license does not cover. */
async function otherLicenses(
  repo: RepoView,
  tagged: readonly { path: string; tag?: string }[],
): Promise<RepoHit[]> {
  const license = await detectProjectLicense(repo);
  if (!license.effective) {
    return [];
  }
  const own = new Set(licensesIn(license.effective).map((entry) => licenseFamily(entry.id)));
  const byTag = new Map<string, string[]>();
  for (const { path, tag } of tagged) {
    const families = tag
      ?.split(/\s+(?:AND|OR|WITH)\s+|[()\s]+/)
      .filter((word) => word !== '')
      .map((word) => licenseFamily(word.replace(/\+$/, '')));
    if (tag && families && !families.every((family) => own.has(family))) {
      byTag.set(tag, [...(byTag.get(tag) ?? []), path]);
    }
  }
  return [...byTag].map(([tag, paths]) =>
    hit(
      paths[0] ?? '.',
      `header:${tag}`,
      `${paths.length} source file${paths.length === 1 ? ' is' : 's are'} tagged "${tag}", which is not the project license (${[...own].join(', ')}): check whether this is bundled code or a wrong header.`,
    ),
  );
}
