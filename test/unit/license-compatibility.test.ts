import { describe, expect, it } from 'vitest';
import {
  assessDependency,
  COMPATIBILITY_TABLE_VERSION,
  isClassified,
  traitsOf,
} from '../../src/rules/licenses/compatibility.js';
import { loadCatalog } from '../../src/rules/licenses/catalog.js';
import { parseExpression, type Expression } from '../../src/rules/licenses/spdx.js';

const catalog = await loadCatalog();

function expression(text: string): Expression {
  const result = parseExpression(text, catalog);
  if (!result.ok) {
    throw new Error(`"${text}": ${result.reason}`);
  }
  return result.expression;
}

/** [project license, dependency license, expected kind and severity or "fine"] */
type Row = readonly [project: string | undefined, dependency: string, expected: string];

function outcome(project: string | undefined, dependency: string): string {
  const assessment = assessDependency(
    project === undefined ? undefined : expression(project),
    expression(dependency),
  );
  return assessment ? `${assessment.kind}/${assessment.severity}` : 'fine';
}

describe('license compatibility table (US-037)', () => {
  it('has a version, so a change to the table is visible', () => {
    expect(COMPATIBILITY_TABLE_VERSION).toMatch(/^\d+ \(\d{4}-\d{2}-\d{2}\)$/);
  });

  describe('permissive project', () => {
    it.each<Row>([
      ['MIT', 'MIT', 'fine'],
      ['MIT', 'Apache-2.0', 'fine'],
      ['MIT', 'BSD-3-Clause', 'fine'],
      ['MIT', 'ISC', 'fine'],
      ['MIT', 'Unlicense', 'fine'],
      ['MIT', 'CC0-1.0', 'fine'],
      ['Apache-2.0', 'MIT', 'fine'],
      ['MIT', 'GPL-3.0-only', 'copyleft/warning'],
      ['MIT', 'GPL-2.0-or-later', 'copyleft/warning'],
      ['Apache-2.0', 'GPL-2.0-only', 'copyleft/warning'],
      ['BSD-3-Clause', 'GPL-3.0-or-later', 'copyleft/warning'],
      ['MIT', 'AGPL-3.0-only', 'network-copyleft/warning'],
      ['MIT', 'LGPL-3.0-only', 'obligation/info'],
      ['MIT', 'LGPL-2.1-or-later', 'obligation/info'],
      ['MIT', 'MPL-2.0', 'obligation/info'],
      ['MIT', 'EPL-2.0', 'obligation/info'],
      ['MIT', 'CDDL-1.0', 'obligation/info'],
    ])('%s project, %s dependency: %s', (project, dependency, expected) => {
      expect(outcome(project, dependency)).toBe(expected);
    });
  });

  describe('restricted licenses are reported whatever the project license is', () => {
    it.each<Row>([
      ['MIT', 'SSPL-1.0', 'restricted/warning'],
      ['MIT', 'BUSL-1.1', 'restricted/warning'],
      ['MIT', 'Elastic-2.0', 'restricted/warning'],
      ['MIT', 'CC-BY-NC-4.0', 'restricted/warning'],
      ['MIT', 'CC-BY-NC-SA-4.0', 'restricted/warning'],
      ['GPL-3.0-only', 'SSPL-1.0', 'restricted/warning'],
      [undefined, 'SSPL-1.0', 'restricted/warning'],
    ])('%s project, %s dependency: %s', (project, dependency, expected) => {
      expect(outcome(project, dependency)).toBe(expected);
    });

    it('says what the license limits, with a source', () => {
      const assessment = assessDependency(expression('MIT'), expression('SSPL-1.0'));

      expect(assessment?.reason).toContain('offering the software as a service');
      expect(assessment?.sources.map((source) => source.url)).toContain(
        'https://www.mongodb.com/legal/licensing/server-side-public-license',
      );
    });
  });

  describe('a project without a known license', () => {
    it.each<Row>([
      [undefined, 'GPL-3.0-only', 'fine'],
      [undefined, 'MIT', 'fine'],
      ['Frobnicate-1.0', 'GPL-3.0-only', 'fine'],
    ])('%s project, %s dependency: %s', (project, dependency, expected) => {
      expect(outcome(project, dependency)).toBe(expected);
    });
  });

  describe('GNU license versions', () => {
    it.each<Row>([
      ['GPL-2.0-only', 'GPL-2.0-only', 'fine'],
      ['GPL-2.0-only', 'GPL-2.0-or-later', 'fine'],
      ['GPL-2.0-only', 'GPL-3.0-only', 'incompatible/warning'],
      ['GPL-2.0-only', 'GPL-3.0-or-later', 'incompatible/warning'],
      ['GPL-2.0-only', 'AGPL-3.0-only', 'incompatible/warning'],
      ['GPL-2.0-only', 'LGPL-3.0-only', 'incompatible/warning'],
      ['GPL-2.0-only', 'LGPL-2.1-only', 'fine'],
      ['GPL-2.0-or-later', 'GPL-3.0-only', 'fine'],
      ['GPL-3.0-only', 'GPL-3.0-only', 'fine'],
      ['GPL-3.0-only', 'GPL-2.0-only', 'incompatible/warning'],
      ['GPL-3.0-only', 'GPL-2.0-or-later', 'fine'],
      ['GPL-3.0-or-later', 'AGPL-3.0-only', 'fine'],
      ['AGPL-3.0-only', 'GPL-3.0-only', 'fine'],
      ['AGPL-3.0-only', 'GPL-2.0-only', 'incompatible/warning'],
      ['GPL-3.0-only', 'LGPL-3.0-only', 'fine'],
    ])('%s project, %s dependency: %s', (project, dependency, expected) => {
      expect(outcome(project, dependency)).toBe(expected);
    });

    it('maps deprecated ids before comparing', () => {
      expect(outcome('GPL-2.0', 'GPL-3.0')).toBe('incompatible/warning');
      expect(outcome('GPL-2.0+', 'GPL-3.0')).toBe('fine');
    });
  });

  describe('other licenses in a GPL project', () => {
    it.each<Row>([
      ['GPL-2.0-only', 'Apache-2.0', 'incompatible/warning'],
      ['GPL-2.0-or-later', 'Apache-2.0', 'fine'],
      ['GPL-3.0-only', 'Apache-2.0', 'fine'],
      ['GPL-3.0-only', 'MIT', 'fine'],
      ['GPL-3.0-only', 'MPL-2.0', 'fine'],
      ['GPL-3.0-only', 'BSD-4-Clause', 'incompatible/warning'],
      ['GPL-3.0-only', 'CDDL-1.0', 'incompatible/warning'],
      ['GPL-3.0-only', 'EPL-1.0', 'incompatible/warning'],
      ['GPL-3.0-only', 'EPL-2.0', 'incompatible/info'],
      ['GPL-3.0-only', 'MPL-1.1', 'incompatible/warning'],
      ['GPL-3.0-only', 'OSL-3.0', 'incompatible/warning'],
      ['GPL-3.0-only', 'EUPL-1.2', 'fine'],
    ])('%s project, %s dependency: %s', (project, dependency, expected) => {
      expect(outcome(project, dependency)).toBe(expected);
    });
  });

  describe('weak copyleft and proprietary projects', () => {
    it.each<Row>([
      ['MPL-2.0', 'GPL-3.0-only', 'copyleft/info'],
      ['MPL-2.0', 'LGPL-3.0-only', 'fine'],
      ['LGPL-3.0-only', 'GPL-3.0-only', 'copyleft/warning'],
      ['LicenseRef-Proprietary', 'GPL-3.0-only', 'copyleft/warning'],
      ['LicenseRef-Proprietary', 'AGPL-3.0-only', 'network-copyleft/warning'],
      ['LicenseRef-Proprietary', 'LGPL-3.0-only', 'obligation/info'],
      ['LicenseRef-Proprietary', 'MIT', 'fine'],
    ])('%s project, %s dependency: %s', (project, dependency, expected) => {
      expect(outcome(project, dependency)).toBe(expected);
    });
  });

  describe('license expressions', () => {
    it.each<Row>([
      ['MIT', 'MIT OR GPL-3.0-only', 'fine'],
      ['MIT', 'GPL-3.0-only AND MIT', 'copyleft/warning'],
      ['MIT', '(GPL-3.0-only OR LGPL-3.0-only) AND MIT', 'obligation/info'],
      ['MIT', 'GPL-2.0-only WITH Classpath-exception-2.0', 'obligation/info'],
      ['MIT', 'GPL-2.0-only WITH Frobnicate-exception', 'copyleft/warning'],
      ['MIT OR GPL-2.0-only', 'GPL-2.0-only', 'fine'],
      ['MIT AND GPL-2.0-only', 'Apache-2.0', 'incompatible/warning'],
    ])('%s project, %s dependency: %s', (project, dependency, expected) => {
      expect(outcome(project, dependency)).toBe(expected);
    });
  });

  it('knows which licenses it has classified', () => {
    expect(traitsOf('MIT')).toEqual({ family: 'permissive' });
    expect(traitsOf('GPL-3.0-or-later')).toEqual({
      family: 'strong-copyleft',
      gpl: { version: 3, orLater: true },
    });
    expect(traitsOf('AGPL-3.0-only')?.family).toBe('network-copyleft');
    expect(traitsOf('Frobnicate-1.0')).toBeUndefined();
    expect(isClassified(expression('MIT OR Apache-2.0'))).toBe(true);
    expect(isClassified(expression('MIT OR Frobnicate-1.0'))).toBe(false);
  });
});
