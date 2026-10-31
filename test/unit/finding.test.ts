import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/config/load.js';
import { compareFindings, type Finding } from '../../src/core/finding.js';
import { scan } from '../../src/core/scan.js';
import { compareSeverity, isAtLeast } from '../../src/core/severity.js';
import { longJsFunction, useProjects } from '../helpers/project.js';

const projects = useProjects();
const strict = parseConfig('{"rules":{"SC-MET-001":{"options":{"maxLines":3}}}}', 'test');

describe('finding fingerprints (US-040)', () => {
  it('survive code moving down the file and the project moving to another folder', async () => {
    const original = await projects.create({ 'a.js': longJsFunction('work', 6) });
    const shifted = await projects.create({
      'a.js': `// a\n// b\n// c\n${longJsFunction('work', 6)}`,
    });

    const [before] = (await scan(original, { config: strict })).findings;
    const [after] = (await scan(shifted, { config: strict })).findings;

    expect(before?.startLine).toBe(1);
    expect(after?.startLine).toBe(4);
    expect(after?.fingerprint).toBe(before?.fingerprint);
  });

  it('differ between files and between two functions of the same name in one file', async () => {
    const folder = await projects.create({
      'a.js': longJsFunction('work', 6),
      'b.js': `${longJsFunction('work', 6)}${longJsFunction('work', 6)}`,
    });

    const { findings } = await scan(folder, { config: strict });

    expect(findings).toHaveLength(3);
    expect(new Set(findings.map((f) => f.fingerprint)).size).toBe(3);
  });

  it('are the same on every run', async () => {
    const folder = await projects.create({ 'a.js': longJsFunction('work', 6) });

    const first = await scan(folder, { config: strict });
    const second = await scan(folder, { config: strict });

    expect(second.findings).toEqual(first.findings);
  });
});

describe('finding order (NFR-3)', () => {
  it('sorts by path, then line, then rule', async () => {
    const folder = await projects.create({
      'b.js': longJsFunction('late', 6),
      'a.js': `${longJsFunction('first', 6)}${longJsFunction('second', 6)}`,
    });

    const { findings } = await scan(folder, { config: strict });

    expect(findings.map((f) => `${f.path}:${f.startLine}`)).toEqual(['a.js:1', 'a.js:7', 'b.js:1']);
  });

  it('compareFindings is consistent with that order', () => {
    const base: Finding = {
      ruleId: 'SC-MET-001',
      severity: 'info',
      confidence: 'medium',
      path: 'a.js',
      startLine: 1,
      endLine: 2,
      message: 'm',
      fingerprint: 'f',
    };

    expect(compareFindings(base, { ...base, path: 'b.js' })).toBeLessThan(0);
    expect(compareFindings({ ...base, startLine: 9 }, base)).toBeGreaterThan(0);
    expect(compareFindings(base, { ...base })).toBe(0);
  });
});

describe('severity ordering', () => {
  it('ranks error above warning above info above note', () => {
    expect(compareSeverity('error', 'warning')).toBeGreaterThan(0);
    expect(compareSeverity('warning', 'info')).toBeGreaterThan(0);
    expect(compareSeverity('info', 'note')).toBeGreaterThan(0);
    expect(compareSeverity('note', 'note')).toBe(0);
  });

  it('isAtLeast includes the threshold itself', () => {
    expect(isAtLeast('warning', 'warning')).toBe(true);
    expect(isAtLeast('error', 'warning')).toBe(true);
    expect(isAtLeast('info', 'warning')).toBe(false);
  });
});
