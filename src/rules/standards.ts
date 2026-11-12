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

/** Standards and practices for documenting a software design. */
export const c4: StandardRef = {
  standard: 'The C4 model for visualising software architecture',
  url: 'https://c4model.com/',
};
export const uml: StandardRef = {
  standard: 'Unified Modeling Language (ISO/IEC 19505-2)',
  url: 'https://www.omg.org/spec/UML/',
};
export const iso42010: StandardRef = {
  standard: 'ISO/IEC/IEEE 42010: Architecture description',
  url: 'https://www.iso.org/standard/74393.html',
};
export const arc42: StandardRef = {
  standard: 'arc42 architecture documentation template',
  url: 'https://arc42.org/',
};
export const adr: StandardRef = {
  standard: 'Architecture Decision Records',
  id: 'Documenting Architecture Decisions (Michael Nygard)',
  url: 'https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions',
};

/** Testing: what a project's tests are for, and the techniques that find what examples miss. */
export const selfTestingCode: StandardRef = {
  standard: 'Fowler, Self Testing Code',
  url: 'https://martinfowler.com/bliki/SelfTestingCode.html',
};
export const testPyramid: StandardRef = {
  standard: 'Fowler, The Test Pyramid',
  url: 'https://martinfowler.com/bliki/TestPyramid.html',
};
export const mutationTesting: StandardRef = {
  standard:
    'DeMillo, Lipton, and Sayward, Hints on Test Data Selection: Help for the Practicing Programmer (IEEE Computer, 1978)',
  id: 'Mutation testing',
};
export const propertyBasedTesting: StandardRef = {
  standard:
    'Claessen and Hughes, QuickCheck: A Lightweight Tool for Random Testing of Haskell Programs (ICFP 2000)',
  id: 'Property-based testing',
};
export const fuzzTesting: StandardRef = {
  standard:
    'Miller, Fredriksen, and So, An Empirical Study of the Reliability of UNIX Utilities (Communications of the ACM, 1990)',
  id: 'Fuzz testing',
};
export const owaspFuzzing: StandardRef = {
  standard: 'OWASP, Fuzzing',
  url: 'https://owasp.org/www-community/Fuzzing',
};

/** Resilience: what a program does when something it calls is slow, down, or failing. */
export const nygardReleaseIt: StandardRef = {
  standard: 'Nygard, Release It! (2nd edition, 2018)',
  id: 'Stability patterns: Timeouts, Circuit Breaker',
};
export const retryPattern: StandardRef = {
  standard: 'Microsoft Azure Architecture Center, Retry pattern',
  url: 'https://learn.microsoft.com/en-us/azure/architecture/patterns/retry',
};
export const circuitBreakerPattern: StandardRef = {
  standard: 'Microsoft Azure Architecture Center, Circuit Breaker pattern',
  url: 'https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker',
};
