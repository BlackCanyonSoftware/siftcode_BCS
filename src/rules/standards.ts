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

export const nistSsdf = (practice: string, title: string): StandardRef => ({
  standard: 'NIST SP 800-218 Secure Software Development Framework (SSDF)',
  id: `${practice}: ${title}`,
  url: 'https://csrc.nist.gov/pubs/sp/800/218/final',
});
