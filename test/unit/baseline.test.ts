import { describe, expect, it } from 'vitest';
import {
  BASELINE_VERSION,
  createBaseline,
  parseBaseline,
  serializeBaseline,
} from '../../src/core/baseline.js';
import { UsageError } from '../../src/core/errors.js';
import { scan } from '../../src/core/scan.js';
import { onlyRule, useProjects } from '../helpers/project.js';

const projects = useProjects();
const config = onlyRule('SC-MET-001', { maxLines: 3 });

const longFunction = (name: string, firstLine = '') =>
  `function ${name}() {${firstLine}\n  a();\n  b();\n  c();\n}\n`;

describe('baseline (US-070)', () => {
  it('accepts the findings it lists, so only new findings are reported', async () => {
    const folder = await projects.create({ 'a.js': longFunction('one') + longFunction('two') });
    const first = await scan(folder, { config });
    expect(first.findings).toHaveLength(2);

    const baseline = createBaseline(first.findings);
    const again = await scan(folder, { config, baseline });

    expect(again.findings).toEqual([]);
    expect(again.accepted.map((a) => a.via.kind)).toEqual(['baseline', 'baseline']);
    expect(again.notes).toEqual([]);
  });

  it('still recognizes accepted findings after the code above them moves', async () => {
    const original = await projects.create({ 'a.js': longFunction('one') });
    const baseline = createBaseline((await scan(original, { config })).findings);
    const edited = await projects.create({
      'a.js': `const added = 1;\n\n${longFunction('one')}${longFunction('brandNew')}`,
    });

    const result = await scan(edited, { config, baseline });

    expect(result.accepted).toHaveLength(1);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.message).toContain('"brandNew"');
  });

  it('says how many entries no longer match anything, so the file can be refreshed', async () => {
    const original = await projects.create({ 'a.js': longFunction('one') + longFunction('two') });
    const baseline = createBaseline((await scan(original, { config })).findings);
    const fixed = await projects.create({ 'a.js': longFunction('one') });

    const result = await scan(fixed, { config, baseline });

    expect(result.notes).toEqual([
      'The baseline lists 1 finding that no longer occurs. Run "siftcode baseline" to refresh it.',
    ]);
  });

  it('lets an inline suppression take precedence, with its reason, and counts the entry as used', async () => {
    const plain = await projects.create({ 'a.js': longFunction('one') });
    const baseline = createBaseline((await scan(plain, { config })).findings);
    const suppressed = await projects.create({
      'a.js': longFunction('one', ' // siftcode-ignore SC-MET-001: reason'),
    });

    const result = await scan(suppressed, { config, baseline });

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.via).toMatchObject({ kind: 'suppression', reason: 'reason' });
    expect(result.notes).toEqual([]);
  });

  describe('file format', () => {
    it('is sorted, has no dates or absolute paths, and survives a round trip', async () => {
      const folder = await projects.create({
        'b.js': longFunction('two'),
        'a.js': longFunction('one') + longFunction('three'),
      });
      const { findings } = await scan(folder, { config });

      const text = serializeBaseline(createBaseline([...findings].reverse()));

      expect(text.endsWith('}\n')).toBe(true);
      expect(text).toBe(serializeBaseline(createBaseline(findings)));
      expect(text).not.toContain(folder);
      const parsed = parseBaseline(text, 'baseline.json');
      expect(parsed.version).toBe(BASELINE_VERSION);
      expect(parsed.findings.map((f) => f.path)).toEqual(['a.js', 'a.js', 'b.js']);
      expect(parsed.findings[0]).toEqual({
        fingerprint: findings[0]?.fingerprint,
        ruleId: 'SC-MET-001',
        path: 'a.js',
        message: findings[0]?.message,
      });
    });

    it.each([
      ['not json', 'Invalid JSON in baseline.json'],
      ['{"version":2,"findings":[]}', 'baseline.json'],
      ['{"version":1}', 'findings'],
      [
        '{"version":1,"findings":[{"ruleId":"SC-MET-001","path":"a.js","message":"m"}]}',
        'fingerprint',
      ],
    ])('rejects %s with a message that names the file', (text, expected) => {
      expect(() => parseBaseline(text, 'baseline.json')).toThrow(UsageError);
      expect(() => parseBaseline(text, 'baseline.json')).toThrow(expected);
    });
  });
});
