import { z } from 'zod';
import { compareStrings } from './compare.js';
import { UsageError } from './errors.js';
import type { AcceptedFinding, Finding } from './finding.js';
import { describeIssues } from './issues.js';

/** Current version of the baseline file layout. */
export const BASELINE_VERSION = 1;

/** The default file name, next to the scanned folder's config. */
export const BASELINE_FILE_NAME = 'siftcode-baseline.json';

const entry = z.strictObject({
  /** What a finding is matched by: rule, file, and what was flagged, never line numbers. */
  fingerprint: z.string().min(1),
  // The rest is for the person reading a diff of the file; it is not used for matching.
  ruleId: z.string(),
  path: z.string(),
  message: z.string(),
});

const baselineSchema = z.strictObject({
  version: z.literal(BASELINE_VERSION),
  findings: z.array(entry),
});

/** The findings a team has chosen to accept for now, so a scan reports only new ones. */
export type Baseline = z.output<typeof baselineSchema>;

/** A baseline that accepts these findings. Sorted and free of dates, so a diff shows what changed. */
export function createBaseline(findings: readonly Finding[]): Baseline {
  const byFingerprint = new Map(findings.map((finding) => [finding.fingerprint, finding]));
  return {
    version: BASELINE_VERSION,
    findings: [...byFingerprint.values()]
      .map(({ fingerprint, ruleId, path, message }) => ({ fingerprint, ruleId, path, message }))
      .sort(
        (a, b) =>
          compareStrings(a.path, b.path) ||
          compareStrings(a.ruleId, b.ruleId) ||
          compareStrings(a.fingerprint, b.fingerprint),
      ),
  };
}

export function serializeBaseline(baseline: Baseline): string {
  return `${JSON.stringify(baseline, null, 2)}\n`;
}

/** Validates baseline text; `source` names the file in error messages. */
export function parseBaseline(text: string, source: string): Baseline {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new UsageError(`Invalid JSON in ${source}: ${reason}`);
  }
  const parsed = baselineSchema.safeParse(json);
  if (!parsed.success) {
    throw new UsageError(
      `Invalid baseline ${source}:\n${describeIssues(parsed.error)}\nCreate it again with "siftcode baseline".`,
    );
  }
  return parsed.data;
}

export interface BaselineOutcome {
  readonly active: readonly Finding[];
  readonly accepted: readonly AcceptedFinding[];
}

/** Moves the findings the baseline lists from `active` to `accepted`. */
export function applyBaseline(findings: readonly Finding[], baseline: Baseline): BaselineOutcome {
  const listed = new Set(baseline.findings.map((item) => item.fingerprint));
  const active: Finding[] = [];
  const accepted: AcceptedFinding[] = [];
  for (const finding of findings) {
    if (listed.has(finding.fingerprint)) {
      accepted.push({ finding, via: { kind: 'baseline' } });
    } else {
      active.push(finding);
    }
  }
  return { active, accepted };
}

/** A note when the baseline lists findings that no longer occur, or `undefined` when it is current. */
export function describeStaleEntries(
  baseline: Baseline,
  found: readonly Finding[],
): string | undefined {
  const present = new Set(found.map((finding) => finding.fingerprint));
  const stale = baseline.findings.filter((item) => !present.has(item.fingerprint)).length;
  if (stale === 0) {
    return undefined;
  }
  const what =
    stale === 1 ? '1 finding that no longer occurs' : `${stale} findings that no longer occur`;
  return `The baseline lists ${what}. Run "siftcode baseline" to refresh it.`;
}
