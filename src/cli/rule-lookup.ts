import { ALL_RULES } from '../rules/index.js';
import type { RuleDefinition } from '../rules/types.js';

/**
 * `SC-MET-001` written loosely: any letter case, with or without the `SC-` prefix, and without the
 * leading zeros (`met-1`, `sc-met-01`). Anything else is returned upper-cased and left alone.
 */
export function normalizeRuleId(text: string): string {
  const upper = text.trim().toUpperCase();
  const match = /^(?:SC-?)?([A-Z]{2,4})-?(\d{1,3})$/.exec(upper);
  return match?.[1] === undefined || match[2] === undefined
    ? upper
    : `SC-${match[1]}-${match[2].padStart(3, '0')}`;
}

export type RuleLookup =
  | { readonly found: RuleDefinition }
  | { readonly found?: undefined; readonly suggestions: readonly string[] };

/** The longest edit distance that still counts as a likely typo of a rule id. */
const MAX_TYPO_DISTANCE = 2;
const MAX_SUGGESTIONS = 3;

/** Finds a rule by a loosely written id, or suggests the nearest ids when there is no such rule. */
export function lookupRule(text: string): RuleLookup {
  const id = normalizeRuleId(text);
  const found = ALL_RULES.find((rule) => rule.meta.id === id);
  if (found) {
    return { found };
  }
  const ranked = ALL_RULES.map((rule) => ({
    id: rule.meta.id,
    distance: editDistance(id, rule.meta.id),
  })).filter((candidate) => candidate.distance <= MAX_TYPO_DISTANCE);
  const best = Math.min(...ranked.map((candidate) => candidate.distance));
  return {
    suggestions: ranked
      .filter((candidate) => candidate.distance === best)
      .slice(0, MAX_SUGGESTIONS)
      .map((candidate) => candidate.id),
  };
}

/** Number of single-character edits (insert, delete, change) that turn `a` into `b`. */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const change = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(change, (previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1);
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}
