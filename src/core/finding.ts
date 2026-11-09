import { createHash } from 'node:crypto';
import type { ConfiguredRule } from '../rules/resolve.js';
import type { Confidence, RuleHit } from '../rules/types.js';
import { compareStrings } from './compare.js';
import type { Severity } from './severity.js';

/** One detected issue at one place in one file. */
export interface Finding {
  readonly ruleId: string;
  readonly severity: Severity;
  readonly confidence: Confidence;
  /** Relative to the scan root, with forward slashes. */
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly message: string;
  /**
   * Stable identity of the finding: derived from the rule, the file, and what was flagged, not the
   * line numbers, so it survives edits elsewhere in the file. Used by baselines and SARIF.
   */
  readonly fingerprint: string;
}

/** How a finding came to be accepted: a comment in the code (with its reason), or the baseline file. */
export type AcceptedVia =
  | { readonly kind: 'suppression'; readonly reason: string; readonly line: number }
  | { readonly kind: 'baseline' };

/** A finding the team has already accepted. It is kept for the reports but never fails a scan. */
export interface AcceptedFinding {
  readonly finding: Finding;
  readonly via: AcceptedVia;
}

/**
 * `occurrence` is 1 for the first hit with this key in the file, 2 for the next, and so on, so two
 * overloads with the same name still get different fingerprints.
 */
export function createFinding(
  rule: ConfiguredRule,
  path: string,
  hit: RuleHit,
  occurrence: number,
): Finding {
  const identity = [rule.meta.id, path, hit.key, occurrence].join('\n');
  return {
    ruleId: rule.meta.id,
    severity: rule.severityOverride ?? hit.severity ?? rule.meta.defaultSeverity,
    confidence: rule.meta.confidence,
    path,
    startLine: hit.startLine,
    endLine: hit.endLine,
    message: hit.message,
    fingerprint: createHash('sha256').update(identity).digest('hex').slice(0, 32),
  };
}

/** The deterministic output order: by file, then line, then rule. */
export function compareFindings(a: Finding, b: Finding): number {
  return (
    compareStrings(a.path, b.path) ||
    a.startLine - b.startLine ||
    compareStrings(a.ruleId, b.ruleId) ||
    a.endLine - b.endLine
  );
}
