import type { z } from 'zod';
import { UsageError } from '../core/errors.js';
import { describeIssues } from '../core/issues.js';
import type { AnalyzedFile } from '../languages/model/types.js';
import type { RepoHit, RepoView, RuleDefinition, RuleHit, RuleMeta } from './types.js';

interface RuleSpec<Options, Check> {
  readonly meta: RuleMeta;
  /** Schema for the rule's `options` in the config file; supply defaults for every option. */
  readonly options: z.ZodType<Options>;
  readonly check: Check;
}

/** Validates the options a rule was given, or throws a `UsageError` naming the rule and the key. */
function validated<Options>(spec: { meta: RuleMeta; options: z.ZodType<Options> }, raw: unknown) {
  const parsed = spec.options.safeParse(raw);
  if (!parsed.success) {
    throw new UsageError(
      `Invalid options for rule ${spec.meta.id}:\n${describeIssues(parsed.error)}`,
    );
  }
  return parsed.data;
}

/** What the schema gives for an empty `options`: every option with its default. */
function defaultsOf<Options>(spec: {
  meta: RuleMeta;
  options: z.ZodType<Options>;
}): Readonly<Record<string, unknown>> {
  const defaults: unknown = validated(spec, {});
  return typeof defaults === 'object' && defaults !== null ? { ...defaults } : {};
}

/** Declares a rule that checks one source file at a time, with typed options. */
export function defineRule<Options>(
  spec: RuleSpec<Options, (file: AnalyzedFile, options: Options) => readonly RuleHit[]>,
): RuleDefinition {
  return {
    meta: spec.meta,
    defaultOptions: defaultsOf(spec),
    configure(rawOptions) {
      const options = validated(spec, rawOptions);
      return (file) => spec.check(file, options);
    },
  };
}

/**
 * Declares a rule that checks the whole repository (its manifests, lockfiles, CI configuration,
 * documentation), not one source file. It runs once per scan of a folder.
 */
export function defineRepoRule<Options>(
  spec: RuleSpec<Options, (repo: RepoView, options: Options) => Promise<readonly RepoHit[]>>,
): RuleDefinition {
  return {
    meta: spec.meta,
    defaultOptions: defaultsOf(spec),
    configure(rawOptions) {
      validated(spec, rawOptions);
      return () => []; // there is nothing to check in a single source file
    },
    configureRepo(rawOptions) {
      const options = validated(spec, rawOptions);
      return (repo) => spec.check(repo, options);
    },
  };
}
