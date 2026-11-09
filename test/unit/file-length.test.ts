import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/config/load.js';
import { scan } from '../../src/core/scan.js';
import { fixture, longJsFunction, useProjects } from '../helpers/project.js';

const RULE = 'SC-MET-006';
const positive = fixture('rules/SC-MET-006/positive');
const negative = fixture('rules/SC-MET-006/negative');

const withOptions = (options: object, extra: object = {}) =>
  parseConfig(JSON.stringify({ rules: { [RULE]: { options, ...extra } } }), 'test config');
const strict = withOptions({ maxLines: 10 });

describe('SC-MET-006 file length (US-010 family, US-040)', () => {
  it.each([
    ['long.js', 13],
    ['long.ts', 13],
    ['long.py', 13],
    ['Long.cs', 20],
  ])('flags %s with its exact size', async (file, lines) => {
    const result = await scan(join(positive, file), { config: strict });

    expect(result.problems).toEqual([]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      ruleId: RULE,
      path: file,
      startLine: 1,
      endLine: lines,
      severity: 'info',
    });
    expect(result.findings[0]?.message).toContain(`${lines} lines long (limit 10)`);
  });

  it('does not flag short files in any language', async () => {
    const result = await scan(negative, { config: strict });

    expect(result.filesScanned).toBe(4);
    expect(result.findings).toEqual([]);
  });

  it('uses a default limit of 500 lines', async () => {
    expect((await scan(positive)).findings).toEqual([]);
  });

  describe('boundary and exclusions', () => {
    const projects = useProjects();
    const lines = (count: number) => longJsFunction('f', count);

    it('allows a file of exactly the limit and flags one line more', async () => {
      const folder = await projects.create({ 'at.js': lines(10), 'over.js': lines(11) });

      const result = await scan(folder, { config: strict });

      expect(result.findings.map((f) => f.path)).toEqual(['over.js']);
    });

    it('names the functions the file holds, to judge whether it does one job', async () => {
      const folder = await projects.create({
        'two.js': `${lines(8)}${lines(8).replace('f()', 'g()')}`,
      });

      const result = await scan(folder, { config: strict });

      expect(result.findings[0]?.message).toContain('2 functions');
    });

    it('leaves out test code, vendored code, and generated files', async () => {
      const folder = await projects.create({
        'src/App.Tests/Big.js': lines(30),
        'src/big.test.js': lines(30),
        'vendor/lib/big.js': lines(30),
        'src/Models/Data.g.cs': lines(30),
        'src/Models/Form.Designer.cs': lines(30),
        'api/service_pb2.py': lines(30),
        'public/app.min.js': lines(30),
        'app/migrations/0001_initial.py': lines(30),
        'src/real.js': lines(30),
      });

      const result = await scan(folder, { config: strict });

      expect(result.findings.map((f) => f.path)).toEqual(['src/real.js']);
    });
  });

  it('lets the config raise the severity, and can be switched off', async () => {
    const raised = withOptions({ maxLines: 10 }, { severity: 'warning' });
    const off = parseConfig(JSON.stringify({ rules: { [RULE]: { enabled: false } } }), 'test');

    const result = await scan(join(positive, 'long.js'), { config: raised });
    const none = await scan(positive, { config: off });

    expect(result.findings[0]?.severity).toBe('warning');
    expect(none.rules.map((rule) => rule.id)).not.toContain(RULE);
  });

  it('describes the rule with its standards, rationale, and suggestion (US-040)', async () => {
    const result = await scan(negative);

    const rule = result.rules.find((candidate) => candidate.id === RULE);
    expect(rule?.standards.length).toBeGreaterThan(0);
    expect(rule?.rationale).not.toBe('');
    expect(rule?.suggestion.summary).not.toBe('');
  });
});
