import { z } from 'zod';
import type { CodeUnit } from '../../languages/model/types.js';
import { defineRule } from '../define.js';
import type { RuleDefinition, RuleMeta } from '../types.js';

interface UnitThresholdSpec {
  readonly meta: RuleMeta;
  /** Name of the rule's option in the config file, e.g. `maxLines`. */
  readonly option: string;
  /** What values the option may take, before the default is applied. */
  readonly limit: z.ZodNumber;
  readonly defaultLimit: number;
  readonly measure: (unit: CodeUnit) => number;
  /** `above`: a unit breaks the rule when its value exceeds the limit; `below`: when it falls short. */
  readonly breaks: 'above' | 'below';
  readonly message: (unit: CodeUnit, value: number, limit: number) => string;
}

/** "Function" or "Method", for messages. */
export function unitLabel(unit: CodeUnit): string {
  return unit.kind === 'method' ? 'Method' : 'Function';
}

/** A rule that compares one measurement of every function and method with a configurable limit. */
export function defineUnitThresholdRule(spec: UnitThresholdSpec): RuleDefinition {
  return defineRule({
    meta: spec.meta,
    options: z.strictObject({ [spec.option]: spec.limit.default(spec.defaultLimit) }),
    check(file, options) {
      const limit = options[spec.option] ?? spec.defaultLimit;
      return file.units.flatMap((unit) => {
        const value = spec.measure(unit);
        const breaksLimit = spec.breaks === 'above' ? value > limit : value < limit;
        if (!breaksLimit) {
          return [];
        }
        return [
          {
            startLine: unit.startLine,
            endLine: unit.endLine,
            message: spec.message(unit, value, limit),
            key: `${unit.kind}:${unit.name}`,
          },
        ];
      });
    },
  });
}
