import type { z } from 'zod';
import { UsageError } from '../core/errors.js';
import { describeIssues } from '../core/issues.js';
import type { AnalyzedFile } from '../languages/model/types.js';
import type { RuleDefinition, RuleHit, RuleMeta } from './types.js';

interface RuleSpec<Options> {
  readonly meta: RuleMeta;
  /** Schema for the rule's `options` in the config file; supply defaults for every option. */
  readonly options: z.ZodType<Options>;
  readonly check: (file: AnalyzedFile, options: Options) => readonly RuleHit[];
}

/** Declares a rule with typed options. */
export function defineRule<Options>(spec: RuleSpec<Options>): RuleDefinition {
  return {
    meta: spec.meta,
    configure(rawOptions) {
      const parsed = spec.options.safeParse(rawOptions);
      if (!parsed.success) {
        throw new UsageError(
          `Invalid options for rule ${spec.meta.id}:\n${describeIssues(parsed.error)}`,
        );
      }
      const options = parsed.data;
      return (file) => spec.check(file, options);
    },
  };
}
