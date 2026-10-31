import type { SkippedCounts } from '../discovery/discover.js';
import type { RuleMeta } from '../rules/types.js';
import type { Finding } from './finding.js';

export interface FileProblem {
  readonly path: string;
  readonly reason: 'syntax-error' | 'timeout' | 'unreadable';
}

/** Everything a scan produced; reporters turn this into text, JSON, Markdown, or SARIF. */
export interface ScanResult {
  /** Absolute path that was scanned. Reporters that must be machine-independent leave it out. */
  readonly root: string;
  readonly filesScanned: number;
  /** Files per language display name, sorted by name. */
  readonly byLanguage: readonly (readonly [language: string, count: number])[];
  /** Findings in deterministic order (file, line, rule). */
  readonly findings: readonly Finding[];
  /** The rules that were switched on for this scan, in id order. */
  readonly rules: readonly RuleMeta[];
  /**
   * Files that could not be read or parsed cleanly. The scan continues past them, and rules are not
   * run on them, because findings on half-parsed code would be unreliable.
   */
  readonly problems: readonly FileProblem[];
  readonly skipped: SkippedCounts;
}
