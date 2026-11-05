import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/config/load.js';
import type { ScanResult } from '../../src/core/result.js';
import { scan } from '../../src/core/scan.js';
import { fixture, longJsFunction, useProjects } from '../helpers/project.js';

const RULE = 'SC-MET-001';
const positive = fixture('rules/SC-MET-001/positive');
const negative = fixture('rules/SC-MET-001/negative');

const withOptions = (options: object, extra: object = {}) =>
  parseConfig(JSON.stringify({ rules: { [RULE]: { options, ...extra } } }), 'test config');
const strict = withOptions({ maxLines: 5 });

const flaggedNames = (result: ScanResult) =>
  result.findings.map((finding) => /"([^"]+)"/.exec(finding.message)?.[1]);

describe('SC-MET-001 function length (US-010 family, US-040)', () => {
  it.each([
    ['long.js', ['longFunction', 'longArrow', 'longMethod']],
    ['long.ts', ['longFunction', 'longMethod']],
    ['long.tsx', ['LongComponent']],
    ['long.py', ['long_function', 'long_method']],
    ['Cart.cs', ['LongMethod', 'Outer', 'Helper']],
  ])('flags the long named functions in %s and nothing else', async (file, names) => {
    const result = await scan(join(positive, file), { config: strict });

    expect(flaggedNames(result)).toEqual(names);
    expect(result.problems).toEqual([]);
  });

  it('reports the exact size and position, and labels methods and functions', async () => {
    const result = await scan(join(positive, 'long.py'), { config: strict });

    expect(
      result.findings.map(({ message, startLine, endLine }) => ({ message, startLine, endLine })),
    ).toEqual([
      { message: 'Function "long_function" is 6 lines long (limit 5).', startLine: 1, endLine: 6 },
      { message: 'Method "long_method" is 6 lines long (limit 5).', startLine: 10, endLine: 15 },
    ]);
  });

  it('does not flag short code in any language', async () => {
    const result = await scan(negative, { config: strict });

    expect(result.filesScanned).toBe(4);
    expect(result.findings).toEqual([]);
  });

  it('uses a default limit of 50 lines', async () => {
    const result = await scan(positive);

    expect(result.findings).toEqual([]);
  });

  describe('boundary', () => {
    const projects = useProjects();

    it('allows a function of exactly the limit and flags one line more', async () => {
      const folder = await projects.create({
        'at-limit.js': longJsFunction('atLimit', 10),
        'over-limit.js': longJsFunction('overLimit', 11),
      });

      const result = await scan(folder, { config: withOptions({ maxLines: 10 }) });

      expect(flaggedNames(result)).toEqual(['overLimit']);
    });
  });

  it('reports at the rule default severity, `info`, and the rule confidence', async () => {
    const result = await scan(join(positive, 'long.js'), { config: strict });

    expect(new Set(result.findings.map((f) => f.severity))).toEqual(new Set(['info']));
    expect(new Set(result.findings.map((f) => f.confidence))).toEqual(new Set(['medium']));
  });

  it('lets the config raise the severity', async () => {
    const config = withOptions({ maxLines: 5 }, { severity: 'warning' });

    const result = await scan(join(positive, 'long.js'), { config });

    expect(new Set(result.findings.map((f) => f.severity))).toEqual(new Set(['warning']));
  });

  it('can be switched off, and then does not appear among the rules that ran', async () => {
    const config = parseConfig(JSON.stringify({ rules: { [RULE]: { enabled: false } } }), 'test');

    const result = await scan(positive, { config });

    expect(result.findings).toEqual([]);
    expect(result.rules.map((rule) => rule.id)).not.toContain(RULE);
  });

  it('describes the rule with its standards, rationale, and suggestion (US-040)', async () => {
    const result = await scan(negative);

    const [rule] = result.rules;
    expect(rule?.id).toBe(RULE);
    expect(rule?.standards.length).toBeGreaterThan(0);
    expect(rule?.rationale).not.toBe('');
    expect(rule?.suggestion.summary).not.toBe('');
    expect(rule?.suggestion.before).toBeDefined();
    expect(rule?.suggestion.after).toBeDefined();
  });
});
