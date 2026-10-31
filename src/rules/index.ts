import { functionLength } from './metrics/function-length.js';
import type { RuleDefinition } from './types.js';

/** Every rule SiftCode ships, in id order. Adding a rule means adding it here. */
export const ALL_RULES: readonly RuleDefinition[] = [functionLength];

export function findRule(id: string): RuleDefinition | undefined {
  return ALL_RULES.find((rule) => rule.meta.id === id);
}
