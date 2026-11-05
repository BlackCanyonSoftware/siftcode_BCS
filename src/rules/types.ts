import type { Severity } from '../core/severity.js';
import type { AnalyzedFile } from '../languages/model/types.js';

export type Category =
  'maintainability' | 'design' | 'reliability' | 'security' | 'performance' | 'documentation';

export type Confidence = 'high' | 'medium' | 'low';

/** A named standard, principle, or catalog entry a rule is based on. */
export interface StandardRef {
  readonly standard: string;
  /** The entry within the standard, e.g. "CWE-89" or "Long Function". */
  readonly id?: string;
  readonly url?: string;
}

export interface Suggestion {
  /** One sentence: what to do. */
  readonly summary: string;
  readonly before?: string;
  readonly after?: string;
}

/** Everything a person needs to understand a rule, shown by reports and `siftcode explain`. */
export interface RuleMeta {
  /** `SC-<AREA>-<NNN>`, stable once published. */
  readonly id: string;
  readonly title: string;
  readonly category: Category;
  readonly defaultSeverity: Severity;
  readonly confidence: Confidence;
  /** True when the rule is a judgment call rather than a fact; heuristics default to `warning` or lower. */
  readonly heuristic: boolean;
  readonly standards: readonly StandardRef[];
  /** Why this matters, in one or two sentences. */
  readonly rationale: string;
  readonly suggestion: Suggestion;
}

/** What a rule reports at one place in a file; the scan turns it into a finding. */
export interface RuleHit {
  readonly startLine: number;
  readonly endLine: number;
  readonly message: string;
  /**
   * Identifies what was flagged without using line numbers (e.g. `method:parse`), so a finding's
   * fingerprint survives code moving around the file.
   */
  readonly key: string;
  /**
   * Overrides the rule's default severity for this hit, for a rule whose findings differ in
   * seriousness (a secret in a known token format versus a guess from a variable name). A severity
   * set in the config file still wins.
   */
  readonly severity?: Severity;
}

export type FileCheck = (file: AnalyzedFile) => readonly RuleHit[];

/** A rule as registered: its description, and a way to bind it to validated options. */
export interface RuleDefinition {
  readonly meta: RuleMeta;
  /** Validates `options` against the rule's schema (throws `UsageError`) and returns the check. */
  configure(options: unknown): FileCheck;
}
