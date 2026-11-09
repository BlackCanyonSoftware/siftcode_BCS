import type { AcceptedFinding, Finding } from '../core/finding.js';
import type { FileProblem, ScanResult } from '../core/result.js';
import { SEVERITIES, type Severity } from '../core/severity.js';
import type { RuleMeta, StandardRef } from '../rules/types.js';

export const TOOL_NAME = 'SiftCode';
export const TOOL_URL = 'https://github.com/BlackCanyonSoftware/siftcode_BCS';

export interface ReportContext {
  readonly version: string;
}

/** A finding together with the description of the rule that produced it. */
export interface FindingDetail {
  readonly finding: Finding;
  readonly rule: RuleMeta;
}

export function withRules(result: ScanResult): FindingDetail[] {
  const rules = new Map(result.rules.map((rule) => [rule.id, rule]));
  return result.findings.map((finding) => {
    const rule = rules.get(finding.ruleId);
    if (!rule) {
      throw new Error(`Finding refers to rule ${finding.ruleId}, which did not run.`);
    }
    return { finding, rule };
  });
}

/** Groups findings by file, in the order files first appear (findings arrive sorted by path). */
export function groupByFile(details: readonly FindingDetail[]): [string, FindingDetail[]][] {
  const groups = new Map<string, FindingDetail[]>();
  for (const detail of details) {
    const group = groups.get(detail.finding.path) ?? [];
    group.push(detail);
    groups.set(detail.finding.path, group);
  }
  return [...groups];
}

export function countBySeverity(findings: readonly Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0, note: 0 };
  for (const finding of findings) {
    counts[finding.severity] += 1;
  }
  return counts;
}

/** "2 error, 0 warning, 1 info, 0 note" */
export function describeCounts(findings: readonly Finding[]): string {
  const counts = countBySeverity(findings);
  return SEVERITIES.map((severity) => `${counts[severity]} ${severity}`).join(', ');
}

/** How many findings were accepted and how, or `undefined` when none were. */
export function describeAccepted(accepted: readonly AcceptedFinding[]): string | undefined {
  if (accepted.length === 0) {
    return undefined;
  }
  const baselined = accepted.filter((item) => item.via.kind === 'baseline').length;
  const commented = accepted.length - baselined;
  const parts = [
    ...(baselined > 0 ? [`${baselined} by the baseline`] : []),
    ...(commented > 0 ? [`${commented} by comments in the code`] : []),
  ];
  return `${accepted.length} (${parts.join(', ')})`;
}

export function describeProblem(reason: FileProblem['reason']): string {
  switch (reason) {
    case 'syntax-error':
      return 'has syntax errors, so it was not checked';
    case 'timeout':
      return 'took too long to parse, so it was not checked';
    case 'unreadable':
      return 'could not be read';
  }
}

/** "Refactoring (Fowler): Extract Function (https://...)" */
export function formatStandard(ref: StandardRef): string {
  const named = ref.id === undefined ? ref.standard : `${ref.standard}: ${ref.id}`;
  return ref.url === undefined ? named : `${named} (${ref.url})`;
}

export function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}
