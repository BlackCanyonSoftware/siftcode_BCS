import type { StandardRef } from './types.js';

/** Builders for the standards that more than one rule area cites. */

export const cwe = (id: number, title: string): StandardRef => ({
  standard: 'MITRE Common Weakness Enumeration',
  id: `CWE-${id}: ${title}`,
  url: `https://cwe.mitre.org/data/definitions/${id}.html`,
});

export const owaspTop10 = (code: string, title: string, slug: string): StandardRef => ({
  standard: 'OWASP Top 10 (2021)',
  id: `${code}: ${title}`,
  url: `https://owasp.org/Top10/${slug}/`,
});

export const cheatSheet = (title: string, slug: string): StandardRef => ({
  standard: 'OWASP Cheat Sheet Series',
  id: title,
  url: `https://cheatsheetseries.owasp.org/cheatsheets/${slug}.html`,
});

/** OpenSSF Scorecard check, e.g. `scorecardCheck('Pinned-Dependencies', 'pinned-dependencies')`. */
export const scorecardCheck = (name: string, anchor: string): StandardRef => ({
  standard: 'OpenSSF Scorecard',
  id: name,
  url: `https://github.com/ossf/scorecard/blob/main/docs/checks.md#${anchor}`,
});

export const slsa: StandardRef = {
  standard: 'SLSA (Supply-chain Levels for Software Artifacts)',
  url: 'https://slsa.dev/spec/v1.0/',
};

export const spdxLicenses: StandardRef = {
  standard: 'SPDX License List and license expressions (ISO/IEC 5962:2021)',
  url: 'https://spdx.org/licenses/',
};

export const reuseSpecification: StandardRef = {
  standard: 'REUSE Specification',
  url: 'https://reuse.software/spec/',
};

export const osiLicenses: StandardRef = {
  standard: 'Open Source Initiative: OSI Approved Licenses',
  url: 'https://opensource.org/licenses',
};

/** A license's own published text or the FSF/ASF/MPL statement that a compatibility rule rests on. */
export const licenseSource = (standard: string, url: string): StandardRef => ({ standard, url });

export const nistSsdf = (practice: string, title: string): StandardRef => ({
  standard: 'NIST SP 800-218 Secure Software Development Framework (SSDF)',
  id: `${practice}: ${title}`,
  url: 'https://csrc.nist.gov/pubs/sp/800/218/final',
});
