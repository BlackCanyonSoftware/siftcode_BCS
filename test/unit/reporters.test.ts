import { beforeAll, describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/config/load.js';
import type { ScanResult } from '../../src/core/result.js';
import { scan } from '../../src/core/scan.js';
import { REPORT_FORMATS, renderReport } from '../../src/reporters/index.js';
import { escapeMarkdown } from '../../src/reporters/markdown.js';
import { fixture, longJsFunction, useProjects } from '../helpers/project.js';
import { sarifErrors } from '../helpers/sarif.js';

const strict = parseConfig('{"rules":{"SC-MET-001":{"options":{"maxLines":5}}}}', 'test');
const context = { version: '9.9.9' };
const projects = useProjects();

let withFindings: ScanResult;
let clean: ScanResult;

beforeAll(async () => {
  withFindings = await scan(fixture('rules/SC-MET-001/positive'), { config: strict });
  clean = await scan(fixture('rules/SC-MET-001/negative'), { config: strict });
});

describe('text report', () => {
  it('shows the summary, then each finding with why, try, and the standard (US-040)', () => {
    const text = renderReport('text', withFindings, context);

    expect(text).toContain('Findings: 11 (0 error, 0 warning, 11 info, 0 note)');
    expect(text).toContain('long.js:1  info  SC-MET-001  Function "longFunction" is 8 lines long');
    expect(text).toContain('Why: Long functions are harder to read');
    expect(text).toContain('Try: Extract cohesive blocks');
    expect(text).toContain(
      'Standard: Refactoring (Fowler): Extract Function (https://refactoring.com/catalog/extractFunction.html)',
    );
  });

  it('says so when there is nothing to report', () => {
    const text = renderReport('text', clean, context);

    expect(text).toContain('No findings.');
    expect(text).not.toContain('Why:');
  });

  it('never relies on color or control codes', () => {
    const escapeCharacter = String.fromCharCode(27);

    expect(renderReport('text', withFindings, context)).not.toContain(escapeCharacter);
  });
});

describe('JSON report (US-004)', () => {
  it('carries the tool, a summary, the rules, and complete findings', () => {
    const report = JSON.parse(renderReport('json', withFindings, context)) as {
      schemaVersion: number;
      tool: { name: string; version: string };
      summary: { filesScanned: number; findings: Record<string, number>; languages: object };
      rules: { id: string }[];
      findings: Record<string, unknown>[];
    };

    expect(report.schemaVersion).toBe(1);
    expect(report.tool).toEqual({ name: 'SiftCode', version: '9.9.9' });
    expect(report.summary.filesScanned).toBe(5);
    expect(report.summary.findings).toEqual({ error: 0, warning: 0, info: 11, note: 0 });
    expect(report.summary.languages).toEqual({ 'C#': 1, JavaScript: 1, Python: 1, TypeScript: 2 });
    expect(report.rules.map((r) => r.id)).toEqual(['SC-MET-001']);
    expect(report.findings).toHaveLength(11);
    expect(report.findings[0]).toMatchObject({
      ruleId: 'SC-MET-001',
      severity: 'info',
      confidence: 'medium',
      path: 'Cart.cs',
      rationale: expect.any(String) as string,
      standards: expect.any(Array) as unknown[],
      suggestion: { summary: expect.any(String) as string },
      fingerprint: expect.stringMatching(/^[0-9a-f]{32}$/) as string,
    });
  });
});

describe('Markdown report (US-004)', () => {
  it('has headings, a code-span path, why, try, and before/after examples', () => {
    const markdown = renderReport('markdown', withFindings, context);

    expect(markdown).toContain('# SiftCode report');
    expect(markdown).toContain('### `long.js`');
    expect(markdown).toContain('**Why:**');
    expect(markdown).toContain('**Try:**');
    expect(markdown).toContain('Before:');
    expect(markdown).toContain('After:');
    expect(markdown).toContain('**Standards:** Refactoring \\(Fowler\\): Extract Function');
  });

  it('escapes characters Markdown would interpret', () => {
    expect(escapeMarkdown('a_b*c<d>[e](f)')).toBe('a\\_b\\*c\\<d\\>\\[e\\]\\(f\\)');
  });

  it('says so when there is nothing to report', () => {
    expect(renderReport('markdown', clean, context)).toContain('No findings.');
  });
});

describe('SARIF report (US-003)', () => {
  it('is valid SARIF 2.1.0 according to the official schema', () => {
    const sarif: unknown = JSON.parse(renderReport('sarif', withFindings, context));

    expect(sarifErrors(sarif)).toEqual([]);
  });

  it('is valid when there are no findings', () => {
    expect(sarifErrors(JSON.parse(renderReport('sarif', clean, context)))).toEqual([]);
  });

  it('has the check itself catch a document that is not SARIF', () => {
    expect(sarifErrors({ version: '1.0.0', runs: 'none' }).length).toBeGreaterThan(0);
  });

  it('describes each rule and links each result to it with a stable fingerprint', () => {
    const sarif = JSON.parse(renderReport('sarif', withFindings, context)) as {
      runs: {
        tool: {
          driver: {
            name: string;
            version: string;
            rules: { id: string; help: { text: string } }[];
          };
        };
        results: {
          ruleId: string;
          ruleIndex: number;
          level: string;
          partialFingerprints: Record<string, string>;
          locations: { physicalLocation: { region: { startLine: number } } }[];
        }[];
      }[];
    };

    const [run] = sarif.runs;
    expect(run?.tool.driver.name).toBe('SiftCode');
    expect(run?.tool.driver.version).toBe('9.9.9');
    expect(run?.tool.driver.rules.map((r) => r.id)).toEqual(['SC-MET-001']);
    expect(run?.tool.driver.rules[0]?.help.text).toContain('Extract cohesive blocks');
    expect(run?.results).toHaveLength(11);
    for (const result of run?.results ?? []) {
      expect(result.ruleIndex).toBe(0);
      expect(result.level).toBe('note');
      expect(result.partialFingerprints['siftcodeFingerprint/v1']).toMatch(/^[0-9a-f]{32}$/);
      expect(result.locations[0]?.physicalLocation.region.startLine).toBeGreaterThan(0);
    }
  });

  it('maps warning and error severities to the same SARIF levels', async () => {
    const config = parseConfig(
      '{"rules":{"SC-MET-001":{"severity":"error","options":{"maxLines":5}}}}',
      'test',
    );
    const result = await scan(fixture('rules/SC-MET-001/positive/long.js'), { config });

    const sarif = JSON.parse(renderReport('sarif', result, context)) as {
      runs: { results: { level: string }[] }[];
    };

    expect(new Set(sarif.runs[0]?.results.map((r) => r.level))).toEqual(new Set(['error']));
  });

  it('reports files that could not be parsed as tool notifications (US-071)', async () => {
    const folder = await projects.create({
      'good.js': longJsFunction('work', 6),
      'broken.py': 'def broken(:\n',
    });
    const result = await scan(folder, {
      config: parseConfig('{"rules":{"SC-MET-001":{"options":{"maxLines":3}}}}', 'test'),
    });

    const sarif: unknown = JSON.parse(renderReport('sarif', result, context));

    expect(sarifErrors(sarif)).toEqual([]);
    const notifications = (
      sarif as {
        runs: { invocations: { toolExecutionNotifications: { message: { text: string } }[] }[] }[];
      }
    ).runs[0]?.invocations[0]?.toolExecutionNotifications;
    expect(notifications?.map((n) => n.message.text)).toEqual([
      'broken.py has syntax errors, so it was not checked.',
    ]);
  });
});

describe('every format (NFR-3)', () => {
  it.each(REPORT_FORMATS)(
    '%s output is identical across runs and has no machine-specific paths',
    async (format) => {
      const again = await scan(fixture('rules/SC-MET-001/positive'), { config: strict });

      const first = renderReport(format, withFindings, context);
      const second = renderReport(format, again, context);

      expect(second).toBe(first);
      if (format !== 'text') {
        expect(first).not.toContain(withFindings.root);
        expect(first).not.toContain(JSON.stringify(withFindings.root).slice(1, -1));
      }
    },
  );
});
