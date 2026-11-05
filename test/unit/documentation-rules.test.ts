import { describe, expect, it } from 'vitest';
import { scan } from '../../src/core/scan.js';
import { onlyRule, useProjects } from '../helpers/project.js';

const projects = useProjects();

/** Scans a Git-repository-shaped project with only rule `id` switched on. */
async function findingsFor(
  id: string,
  files: Record<string, string>,
  options: object = {},
  git = true,
) {
  const folder = await projects.create({
    ...files,
    ...(git ? { '.git/HEAD': 'ref: refs/heads/main\n' } : {}),
  });
  return (await scan(folder, { config: onlyRule(id, options) })).findings;
}

const CODE = { 'src/app.ts': 'export const answer = 42;\n' };
/** `count` small source files. */
const manyFiles = (count: number): Record<string, string> =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`src/m${i}.ts`, `export const v${i} = ${i};\n`]),
  );
const MERMAID = '```mermaid\nflowchart LR\n  A --> B\n```\n';

describe('SC-DOC-001 no design documentation (US-033)', () => {
  it('flags a larger project with no design artifacts at warning level, anchored on the README', async () => {
    const findings = await findingsFor('SC-DOC-001', { ...manyFiles(25), 'README.md': '# Demo\n' });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ path: 'README.md', severity: 'warning' });
    expect(findings[0]?.message).toContain('25 source files');
  });

  it('reports a small project at note level, and honors minSourceFiles', async () => {
    const small = await findingsFor('SC-DOC-001', CODE);
    const lowBar = await findingsFor('SC-DOC-001', CODE, { minSourceFiles: 1 });

    expect(small[0]?.severity).toBe('note');
    expect(lowBar[0]?.severity).toBe('warning');
  });

  it.each([
    ['an architecture document', { 'docs/architecture.md': '# Architecture\n' }],
    ['a design document', { 'DESIGN.md': '# Design\n' }],
    ['a document in a design folder', { 'docs/design/overview.md': 'text\n' }],
    ['a decision record folder', { 'docs/adr/0001-use-postgres.md': '# 1. Use Postgres\n' }],
    ['a Mermaid file', { 'docs/context.mmd': 'graph TD\n' }],
    ['a PlantUML file', { 'diagrams/system.puml': '@startuml\n@enduml\n' }],
    ['a draw.io file', { 'docs/system.drawio': '<mxfile/>' }],
    ['a diagram image', { 'docs/architecture-overview.png': 'png' }],
    ['a fenced Mermaid block in the README', { 'README.md': `# Demo\n\n${MERMAID}` }],
    [
      'an architecture section in the README',
      { 'README.md': '# Demo\n\n## Architecture\n\ntext\n' },
    ],
    ['an OpenAPI description', { 'api/openapi.yaml': 'openapi: 3.1.0\n' }],
  ])('accepts %s', async (_label, extra) => {
    expect(await findingsFor('SC-DOC-001', { ...manyFiles(25), ...extra })).toEqual([]);
  });

  it('does not take UI design-system documents for software design', async () => {
    const findings = await findingsFor('SC-DOC-001', {
      ...CODE,
      'docs/design-system.md': '# Colors\n',
      'docs/design-tokens.md': '# Tokens\n',
    });

    expect(findings).toHaveLength(1);
  });

  it('ignores documents under vendored folders', async () => {
    const findings = await findingsFor('SC-DOC-001', {
      ...CODE,
      'vendor/lib/architecture.md': '# Lib\n',
    });

    expect(findings).toHaveLength(1);
  });

  it('stays quiet outside a Git repository root and in a project with no source code', async () => {
    expect(await findingsFor('SC-DOC-001', CODE, {}, false)).toEqual([]);
    expect(await findingsFor('SC-DOC-001', { 'README.md': '# Notes\n' })).toEqual([]);
  });

  it('rejects an invalid option with a usage error', async () => {
    await expect(findingsFor('SC-DOC-001', CODE, { minSourceFiles: -1 })).rejects.toThrow(
      /SC-DOC-001/,
    );
  });
});

describe('SC-DOC-002 documents without diagrams (US-033)', () => {
  it('flags written design documents when a larger project has no diagram', async () => {
    const findings = await findingsFor('SC-DOC-002', {
      ...manyFiles(25),
      'docs/architecture.md': '# Architecture\n\nThe API calls the database.\n',
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ path: 'docs/architecture.md', severity: 'info' });
  });

  it.each([
    ['a fenced block in the document', { 'docs/architecture.md': `# Architecture\n\n${MERMAID}` }],
    [
      'a diagram file',
      { 'docs/architecture.md': '# Architecture\n', 'docs/system.puml': '@startuml\n@enduml\n' },
    ],
    [
      'a diagram image',
      { 'docs/architecture.md': '# Architecture\n', 'docs/diagrams/context.png': 'png' },
    ],
  ])('accepts %s', async (_label, extra) => {
    expect(await findingsFor('SC-DOC-002', { ...manyFiles(25), ...extra })).toEqual([]);
  });

  it('stays quiet for a small project, and when there is no design document at all', async () => {
    const small = await findingsFor('SC-DOC-002', { ...CODE, 'docs/architecture.md': '# A\n' });
    const none = await findingsFor('SC-DOC-002', manyFiles(25));

    expect([small, none]).toEqual([[], []]);
  });
});

describe('SC-DOC-003 diagrams without decision records (US-033)', () => {
  it('flags diagrams in a larger project with no decision records', async () => {
    const findings = await findingsFor('SC-DOC-003', {
      ...manyFiles(25),
      'docs/system.puml': '@startuml\n@enduml\n',
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ path: 'docs/system.puml', severity: 'note' });
  });

  it.each(['docs/adr/0001-first.md', 'docs/decisions/0001-first.md', 'adr-001-first.md'])(
    'accepts a decision record at %s',
    async (path) => {
      const findings = await findingsFor('SC-DOC-003', {
        ...manyFiles(25),
        'docs/system.puml': '@startuml\n@enduml\n',
        [path]: '# 1. First\n',
      });

      expect(findings).toEqual([]);
    },
  );

  it('stays quiet when there are no diagrams', async () => {
    expect(await findingsFor('SC-DOC-003', manyFiles(25))).toEqual([]);
  });
});

describe('SC-DOC-004 unreferenced diagrams (US-033)', () => {
  it('flags a diagram file that no document mentions', async () => {
    const findings = await findingsFor('SC-DOC-004', {
      'docs/context.puml': '@startuml\n@enduml\n',
      'docs/other.drawio': '<mxfile/>',
      'README.md': '# Demo\n\nSee [the other diagram](docs/other.drawio).\n',
    });

    expect(findings.map((f) => f.path)).toEqual(['docs/context.puml']);
  });

  it('counts a mention of the exported image as a reference', async () => {
    const findings = await findingsFor('SC-DOC-004', {
      'docs/context.puml': '@startuml\n@enduml\n',
      'README.md': '![context](docs/context.svg)\n',
    });

    expect(findings).toEqual([]);
  });

  it('stays quiet outside a Git repository root', async () => {
    const findings = await findingsFor(
      'SC-DOC-004',
      { 'docs/context.puml': '@startuml\n@enduml\n' },
      {},
      false,
    );

    expect(findings).toEqual([]);
  });
});
