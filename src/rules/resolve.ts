import type { Config } from '../config/schema.js';
import { UsageError } from '../core/errors.js';
import type { Severity } from '../core/severity.js';
import type { FileCheck, RuleDefinition, RuleMeta } from './types.js';

/** A rule that is switched on, with the severity the config gave it (if any) and validated options bound in. */
export interface ConfiguredRule {
  readonly meta: RuleMeta;
  /** Set when the config file names a severity for the rule; it beats the rule's and a hit's own. */
  readonly severityOverride?: Severity;
  readonly check: FileCheck;
}

/**
 * Applies the config to the available rules. Fails fast, before any file is read, on an unknown
 * rule id or invalid rule options.
 */
export function resolveRules(
  config: Config,
  available: readonly RuleDefinition[],
): readonly ConfiguredRule[] {
  const known = new Set(available.map((rule) => rule.meta.id));
  for (const id of Object.keys(config.rules)) {
    if (!known.has(id)) {
      throw new UsageError(
        `Unknown rule "${id}" in config. Known rules: ${[...known].join(', ')}.`,
      );
    }
  }

  return available.flatMap((rule) => {
    const setting = config.rules[rule.meta.id];
    if (setting?.enabled === false) {
      return [];
    }
    return [
      {
        meta: rule.meta,
        ...(setting?.severity === undefined ? {} : { severityOverride: setting.severity }),
        check: rule.configure(setting?.options ?? {}),
      },
    ];
  });
}
