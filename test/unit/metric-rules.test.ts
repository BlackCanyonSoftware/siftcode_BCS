import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/config/load.js';
import { UsageError } from '../../src/core/errors.js';
import type { ScanResult } from '../../src/core/result.js';
import { scan } from '../../src/core/scan.js';
import { ALL_RULES } from '../../src/rules/index.js';
import { fixture, useProjects } from '../helpers/project.js';

const projects = useProjects();

const withOptions = (rule: string, options: object) =>
  parseConfig(JSON.stringify({ rules: { [rule]: { options } } }), 'test config');

/** A function with `n` independent branches: long, branchy, and dense. */
const bigFunction = (n: number): string => {
  const branches = Array.from(
    { length: n },
    (_, i) => `  if (x > ${i}) {\n    total += ${i} * x;\n  }`,
  );
  return `export function big(x) {\n  let total = 0;\n${branches.join('\n')}\n  return total;\n}\n`;
};

const summarize = (result: ScanResult) =>
  result.findings.map(({ ruleId, path, message }) => ({ ruleId, path, message }));

describe('SC-MET-002 cyclomatic complexity (US-010)', () => {
  it.each(['classify.js', 'classify.ts', 'classify.py', 'Classify.cs'])(
    'flags %s at the default limit of 10, and nothing else fires',
    async (file) => {
      const result = await scan(fixture(`metrics/${file}`));

      expect(summarize(result)).toEqual([
        {
          ruleId: 'SC-MET-002',
          path: file,
          message: expect.stringMatching(
            / "classify" has a cyclomatic complexity of 11 \(limit 10\)\./i,
          ) as string,
        },
      ]);
      expect(result.findings[0]?.severity).toBe('warning');
      expect(result.findings[0]?.confidence).toBe('high');
    },
  );

  it('uses a configurable limit', async () => {
    const config = withOptions('SC-MET-002', { maxComplexity: 11 });

    expect((await scan(fixture('metrics/classify.js'), { config })).findings).toEqual([]);
  });
});

describe('SC-MET-003 parameter count (US-012)', () => {
  it.each(['many.js', 'many.ts', 'many.py', 'Many.cs'])(
    'flags six parameters in %s',
    async (file) => {
      const result = await scan(fixture(`metrics/${file}`));

      expect(result.findings.map((f) => [f.ruleId, f.message])).toEqual([
        ['SC-MET-003', expect.stringContaining('takes 6 parameters (limit 5).') as string],
      ]);
    },
  );

  it('is satisfied by raising the limit, and by functions with fewer parameters', async () => {
    const config = withOptions('SC-MET-003', { maxParameters: 6 });

    expect((await scan(fixture('metrics/many.py'), { config })).findings).toEqual([]);
    expect((await scan(fixture('metrics/deep.py'))).findings).toEqual([]);
  });
});

describe('SC-MET-004 nesting depth (US-012)', () => {
  it.each(['deep.js', 'deep.ts', 'deep.py', 'Deep.cs'])(
    'allows four levels by default and flags them against a limit of 3: %s',
    async (file) => {
      expect((await scan(fixture(`metrics/${file}`))).findings).toEqual([]);

      const result = await scan(fixture(`metrics/${file}`), {
        config: withOptions('SC-MET-004', { maxDepth: 3 }),
      });

      expect(result.findings.map((f) => [f.ruleId, f.message])).toEqual([
        [
          'SC-MET-004',
          expect.stringContaining('nests control structures 4 levels deep (limit 3).') as string,
        ],
      ]);
    },
  );
});

describe('SC-MET-005 maintainability index (US-011)', () => {
  it('flags a large, branchy function, but not a modest one', async () => {
    const folder = await projects.create({
      'big.js': bigFunction(80),
      'modest.js': bigFunction(10),
    });

    const result = await scan(folder);

    expect(result.findings.map((f) => [f.path, f.ruleId, f.message])).toEqual([
      ['big.js', 'SC-MET-001', expect.stringContaining('is 244 lines long') as string],
      ['big.js', 'SC-MET-002', expect.stringContaining('cyclomatic complexity of 81') as string],
      [
        'big.js',
        'SC-MET-005',
        expect.stringMatching(/maintainability index of 11\.\d+ \(minimum 20\)/) as string,
      ],
      ['modest.js', 'SC-MET-002', expect.stringContaining('cyclomatic complexity of 11') as string],
    ]);
  });

  it('compares against the configured minimum, and the boundary is not a breach', async () => {
    const folder = await projects.create({ 'big.js': bigFunction(80) });
    const index = (await scan(folder)).files[0]?.units[0]?.metrics.maintainabilityIndex ?? NaN;

    const at = await scan(folder, { config: withOptions('SC-MET-005', { minIndex: index }) });
    const above = await scan(folder, {
      config: withOptions('SC-MET-005', { minIndex: index + 0.01 }),
    });
    const none = await scan(folder, { config: withOptions('SC-MET-005', { minIndex: 0 }) });

    expect(at.findings.some((f) => f.ruleId === 'SC-MET-005')).toBe(false);
    expect(above.findings.some((f) => f.ruleId === 'SC-MET-005')).toBe(true);
    expect(none.findings.some((f) => f.ruleId === 'SC-MET-005')).toBe(false);
  });
});

describe('rule options are validated', () => {
  it.each([
    ['SC-MET-002', { maxComplexity: 0 }, 'maxComplexity'],
    ['SC-MET-002', { maxComplexity: 2.5 }, 'maxComplexity'],
    ['SC-MET-003', { maxParameters: -1 }, 'maxParameters'],
    ['SC-MET-004', { maxDepth: 'deep' }, 'maxDepth'],
    ['SC-MET-005', { minIndex: 150 }, 'minIndex'],
    ['SC-MET-005', { maxIndex: 5 }, 'maxIndex'],
  ])('%s with %j names the option', async (rule, options, option) => {
    const error = await scan(fixture('sample'), { config: withOptions(rule, options) }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(UsageError);
    expect((error as Error).message).toContain(rule);
    expect((error as Error).message).toContain(option);
  });
});

describe('the rule catalog', () => {
  it('lists unique, well-formed ids in order', () => {
    const ids = ALL_RULES.map((rule) => rule.meta.id);

    expect(ids.every((id) => /^SC-[A-Z]{3}-\d{3}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
  });

  it.each(ALL_RULES.map((rule) => [rule.meta.id, rule.meta] as const))(
    '%s documents itself: standards, rationale, and a suggestion (US-040)',
    (_id, meta) => {
      expect(meta.title).not.toBe('');
      expect(meta.rationale).not.toBe('');
      expect(meta.suggestion.summary).not.toBe('');
      expect(meta.standards.length).toBeGreaterThan(0);
      for (const standard of meta.standards) {
        expect(standard.standard).not.toBe('');
        if (standard.url !== undefined) {
          expect(standard.url).toMatch(/^https:\/\//);
        }
      }
    },
  );

  it('never makes a heuristic rule more severe than a warning by default (NFR-6)', () => {
    for (const { meta } of ALL_RULES) {
      if (meta.heuristic) {
        expect(['warning', 'info', 'note']).toContain(meta.defaultSeverity);
      }
    }
  });
});
