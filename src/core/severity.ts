/** Most severe first. */
export const SEVERITIES = ['error', 'warning', 'info', 'note'] as const;

export type Severity = (typeof SEVERITIES)[number];

const RANK: Readonly<Record<Severity, number>> = { error: 3, warning: 2, info: 1, note: 0 };

/** Positive when `a` is more severe than `b`. */
export function compareSeverity(a: Severity, b: Severity): number {
  return RANK[a] - RANK[b];
}

/** True when `severity` is as severe as `threshold` or worse. */
export function isAtLeast(severity: Severity, threshold: Severity): boolean {
  return RANK[severity] >= RANK[threshold];
}
