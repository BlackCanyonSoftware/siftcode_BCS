import { z } from 'zod';
import { SEVERITIES } from '../core/severity.js';

const severity = z.enum(SEVERITIES);

const ruleSetting = z.strictObject({
  enabled: z.boolean().default(true),
  /** Overrides the rule's default severity. */
  severity: severity.optional(),
  /** Rule-specific options; the rule validates them. */
  options: z.record(z.string(), z.unknown()).default({}),
});

/** The shape of `siftcode.config.json`. Unknown keys are rejected so typos are caught. */
export const configSchema = z.strictObject({
  /** gitignore-style patterns, relative to the scanned folder, added to the built-in ignores. */
  ignore: z.array(z.string()).default([]),
  /** Settings per rule id, e.g. `"SC-MET-001": { "options": { "maxLines": 80 } }`. */
  rules: z.record(z.string(), ruleSetting).default({}),
  /** Exit with code 1 when a finding is at least this severe (the `--fail-on` flag overrides it). */
  failOn: severity.optional(),
});

export type Config = z.output<typeof configSchema>;

export const DEFAULT_CONFIG: Config = configSchema.parse({});
