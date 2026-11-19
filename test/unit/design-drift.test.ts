import { describe, expect, it } from 'vitest';
import { scan } from '../../src/core/scan.js';
import { parseDiagrams } from '../../src/rules/documentation/diagrams.js';
import { declaredModule } from '../../src/rules/documentation/design-drift.js';
import { onlyRule, useProjects } from '../helpers/project.js';

const projects = useProjects();

const fence = (kind: string, body: string): string =>
  `# Architecture\n\n\`\`\`${kind}\n${body}\n\`\`\`\n`;

describe('reading diagrams (US-044)', () => {
  it('reads the boxes of a Mermaid flowchart in every shape, with their lines', () => {
    const [diagram] = parseDiagrams(
      'docs/a.md',
      fence(
        'mermaid',
        [
          'flowchart LR',
          '    A[cli: args] --> B(core/scan) --> C([Rules]) --> D[(store)]',
          '    E{{Ev}} -->|text| F>flag]',
          '    subgraph Core [core: engine]',
          '    G["quoted<br/>label"]',
          '    end',
        ].join('\n'),
      ),
    );

    expect(diagram?.kind).toBe('mermaid');
    expect(diagram?.nodes).toEqual([
      { label: 'cli: args', line: 5 },
      { label: 'core/scan', line: 5 },
      { label: 'Rules', line: 5 },
      { label: 'store', line: 5 },
      { label: 'Ev', line: 6 },
      { label: 'flag', line: 6 },
      { label: 'core: engine', line: 7 },
      { label: 'quoted label', line: 8 },
    ]);
  });

  it('reads a whole .mmd file, C4 elements, and PlantUML components', () => {
    const mmd = parseDiagrams('x.mmd', 'graph TD\n  a[one] --> b[two]\n');
    const c4 = parseDiagrams(
      'x.md',
      fence('mermaid', 'C4Container\n  Container(api, "api", "Node")\n  Person(u, "User")'),
    );
    const puml = parseDiagrams(
      'x.puml',
      '@startuml\n[core/scan] --> [cli]\ncomponent "Catalog.API" as cat\n\' [commented]\n@enduml\n',
    );

    expect(mmd[0]?.nodes.map((n) => n.label)).toEqual(['one', 'two']);
    expect(c4[0]?.nodes.map((n) => n.label)).toEqual(['api']);
    expect(puml[0]?.kind).toBe('plantuml');
    expect(puml[0]?.nodes.map((n) => n.label)).toEqual(['core/scan', 'cli', 'Catalog.API']);
  });

  it('ignores diagram kinds that do not draw modules, and text that is not a diagram', () => {
    const sequence = parseDiagrams('a.md', fence('mermaid', 'sequenceDiagram\n  A->>B: hi'));
    const none = parseDiagrams('a.md', '# Title\n\nText with [brackets] and (parens).\n');

    expect(sequence[0]?.nodes).toEqual([]);
    expect(none).toEqual([]);
  });
});

describe('which labels claim a module (US-044)', () => {
  it.each([
    ['cli: args, exit codes', 'cli'],
    ['core/scan: orchestrator', 'core/scan'],
    ['Catalog.API', 'Catalog.API'],
    ['repo-files', 'repo-files'],
    ['OrderService', 'OrderService'],
    ['rules', 'rules'],
  ])('%s names %s', (label, name) => {
    expect(declaredModule(label)).toBe(name);
  });

  it.each([
    'Developer / CI',
    'Project files',
    'Terminal, Markdown, JSON',
    'Reviewer',
    'Orders',
    'database',
    'User',
    'https://example.com/x',
    'x',
  ])('%s is a description, not a claim about the code', (label) => {
    expect(declaredModule(label)).toBeUndefined();
  });

  it('keeps a capitalized word when it has a description after a colon', () => {
    expect(declaredModule('Orders: place and track')).toBe('Orders');
  });
});

async function drift(id: string, files: Record<string, string>, options: object = {}) {
  const folder = await projects.create(files);
  return (await scan(folder, { config: onlyRule(id, options) })).findings;
}

const code = (names: string[], perFolder = 3): Record<string, string> =>
  Object.fromEntries(
    names.flatMap((name) =>
      Array.from({ length: perFolder }, (_, i) => [
        `src/${name}/m${i}.ts`,
        `export const v${i} = ${i};\n`,
      ]),
    ),
  );

describe('SC-DOC-007 a diagram names a module the code does not have (US-044)', () => {
  it('flags a box named like a module that no folder, file, or class has, at its line', async () => {
    const findings = await drift('SC-DOC-007', {
      ...code(['cli', 'core']),
      'docs/architecture.md': fence(
        'mermaid',
        'flowchart TD\n  A[cli: args] --> B[core: engine]\n  B --> C[ranking: sort]\n  B --> D[core/m0: run]',
      ),
    });

    expect(findings.map((f) => [f.path, f.startLine, f.message])).toEqual([
      [
        'docs/architecture.md',
        6,
        'The Mermaid diagram names "ranking" as a module, but the project has no folder, file, package, namespace, or class called that.',
      ],
    ]);
    expect(findings[0]).toMatchObject({ severity: 'info', confidence: 'low' });
  });

  it('finds a module by folder, file name, path, class, import, or dependency', async () => {
    const findings = await drift('SC-DOC-007', {
      'src/orders/service.ts': "import axios from 'axios';\nexport class PaymentGateway {}\n",
      'package.json': JSON.stringify({ dependencies: { '@scope/stripe': '1.0.0' } }),
      'docs/architecture.md': fence(
        'mermaid',
        [
          'flowchart TD',
          '  A[order: place] --> B[orders/service: run]',
          '  B --> C[PaymentGateway]',
          '  B --> D[axios: http]',
          '  B --> E[stripe: cards]',
        ].join('\n'),
      ),
    });

    expect(findings).toEqual([]);
  });

  it('finds a box that names a file with its extension, and a name the code writes out (found in four projects)', async () => {
    const findings = await drift('SC-DOC-007', {
      'src/app/policy.py': 'x = 1\n',
      'src/static/sw.js': "chrome.storage.local.get('k');\n",
      'docs/architecture.md': fence(
        'mermaid',
        [
          'flowchart TD',
          '  A["policy.py"] --> B["sw.js"]',
          '  B --> C[(chrome.storage.local)]',
          '  C --> D["versions.py"]',
        ].join('\n'),
      ),
    });

    expect(findings.map((f) => f.message)).toEqual([
      'The Mermaid diagram names "versions.py" as a module, but the project has no folder, file, package, namespace, or class called that.',
    ]);
  });

  it('does not take a plain word that only appears in a comment or string for the module (found in SiftCode)', async () => {
    const findings = await drift('SC-DOC-007', {
      'src/core/a.ts':
        '// the suggestions are looked up by rule id; see repo-files below\nexport {};\n',
      'docs/architecture.md': fence(
        'mermaid',
        'flowchart TD\n  A[core: x] --> B[suggestions: lookup]\n  B --> C[repo-files: read]',
      ),
    });

    expect(findings.map((f) => f.message)).toHaveLength(2);
  });

  it('reads .puml files and says PlantUML', async () => {
    const findings = await drift('SC-DOC-007', {
      ...code(['core']),
      'docs/c.puml': '@startuml\n[core] --> [gone]\n@enduml\n',
    });

    expect(findings.map((f) => f.message)).toEqual([
      'The PlantUML diagram names "gone" as a module, but the project has no folder, file, package, namespace, or class called that.',
    ]);
  });

  it('says nothing about free-text labels, and each name once per diagram', async () => {
    const findings = await drift('SC-DOC-007', {
      ...code(['core']),
      'docs/architecture.md': fence(
        'mermaid',
        'flowchart TD\n  A[Developer / CI] --> B[core: x]\n  B --> C[(Project files)]\n  B --> D[gone: a]\n  D --> E[gone: b]',
      ),
    });

    expect(findings).toHaveLength(1);
  });

  it('reads diagrams in design documents and diagram files only, not in tutorials or tests', async () => {
    const tutorial = fence('mermaid', 'flowchart TD\n  A[gone: x] --> B[core: y]');
    const findings = await drift('SC-DOC-007', {
      ...code(['core']),
      'docs/tutorial.md': tutorial,
      'docs/howto/usage.md': tutorial,
      'tests/fixtures/flow.mmd': 'graph TD\n  a[gone] --> b[core]\n',
    });

    expect(findings).toEqual([]);
  });

  it('does nothing without a diagram or without source code', async () => {
    expect(await drift('SC-DOC-007', code(['core']))).toEqual([]);
    expect(
      await drift('SC-DOC-007', { 'docs/a.md': fence('mermaid', 'flowchart TD\n  A[gone: x]') }),
    ).toEqual([]);
  });
});

describe('SC-DOC-008 a part of the code is not in the diagrams (US-044)', () => {
  const diagram = fence(
    'mermaid',
    'flowchart TD\n  A[cli: args] --> B[core: engine]\n  B --> C[rules: checks]',
  );

  it('flags folders of real size that no diagram mentions, and says how many modules are drawn', async () => {
    const findings = await drift('SC-DOC-008', {
      ...code(['cli', 'core', 'rules', 'shared', 'reporters']),
      'docs/architecture.md': diagram,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'note', path: 'docs/architecture.md' });
    expect(findings[0]?.message).toBe(
      'The diagrams draw 3 modules, but not src/reporters, src/shared: folders of 3 or more source files that no diagram mentions.',
    );
  });

  it('counts a part as shown when any word of its name is in a diagram, in any form', async () => {
    const findings = await drift('SC-DOC-008', {
      ...code(['cli', 'core', 'rules', 'repo_view']),
      'docs/architecture.md': fence(
        'mermaid',
        'flowchart TD\n  A[cli: args] --> B[core: engine]\n  B --> C[rules: checks]\n  C --> D[Views of the repo]',
      ),
    });

    expect(findings).toEqual([]);
  });

  it('matches a folder with a short name, such as ai or ui, to the box that names it (found in SiftCode)', async () => {
    const findings = await drift('SC-DOC-008', {
      ...code(['cli', 'core', 'rules', 'ai']),
      'docs/architecture.md': fence(
        'mermaid',
        'flowchart TD\n  A[cli: args] --> B[core: engine]\n  B --> C[rules: checks]\n  B -.-> D[ai: suggestions]',
      ),
    });

    expect(findings).toEqual([]);
  });

  it('leaves small folders alone, and follows minFiles', async () => {
    const files = {
      ...code(['cli', 'core', 'rules']),
      ...code(['tiny'], 2),
      'docs/architecture.md': diagram,
    };

    expect(await drift('SC-DOC-008', files)).toEqual([]);
    expect(await drift('SC-DOC-008', files, { minFiles: 2 })).toHaveLength(1);
  });

  it('expects nothing of a diagram that draws fewer than three modules', async () => {
    const findings = await drift('SC-DOC-008', {
      ...code(['cli', 'core', 'other']),
      'docs/architecture.md': fence('mermaid', 'flowchart TD\n  A[cli: args] --> B[core: engine]'),
    });

    expect(findings).toEqual([]);
  });
});
