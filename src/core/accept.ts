import { applyBaseline, describeStaleEntries, type Baseline } from './baseline.js';
import { compareFindings, type AcceptedFinding, type Finding } from './finding.js';
import { applySuppressions, type Suppression } from './suppressions.js';

export interface Acceptance {
  /** What is left to report: neither suppressed in the code nor listed in the baseline. */
  readonly findings: readonly Finding[];
  readonly accepted: readonly AcceptedFinding[];
  readonly notes: readonly string[];
}

/**
 * Sets aside the findings a team has already accepted. A comment in the code comes first, because it
 * carries a reason; the baseline takes what is left.
 */
export function acceptFindings(
  all: readonly Finding[],
  suppressions: readonly Suppression[],
  baseline: Baseline | undefined,
  enabledRules: ReadonlySet<string>,
): Acceptance {
  const suppressed = applySuppressions(all, suppressions, enabledRules);
  const baselined =
    baseline === undefined
      ? { active: suppressed.active, accepted: [] }
      : applyBaseline(suppressed.active, baseline);
  const stale = baseline === undefined ? undefined : describeStaleEntries(baseline, all);
  return {
    findings: baselined.active,
    accepted: [...suppressed.accepted, ...baselined.accepted].sort((a, b) =>
      compareFindings(a.finding, b.finding),
    ),
    notes: [...suppressed.notes, ...(stale === undefined ? [] : [stale])],
  };
}
