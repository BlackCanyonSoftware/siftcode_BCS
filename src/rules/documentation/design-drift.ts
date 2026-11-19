import { z } from 'zod';
import { assignComponents, LOOSE } from '../architecture/components.js';
import { defineRepoRule } from '../define.js';
import { projectCode } from '../code-text.js';
import { isTestFile } from '../shared.js';
import { c4, iso42010 } from '../standards.js';
import type { RepoHit, RepoView } from '../types.js';
import { collectCodeNames, namesWrittenInCode, normalizeName } from './code-names.js';
import { detectDesignArtifacts } from './detect.js';
import { parseDiagrams, type Diagram } from './diagrams.js';

/** The text diagram formats this reads; draw.io, Visio, and pictures cannot be read as text. */
const READABLE = /\.(?:mmd|mermaid|puml|plantuml|pu|wsd|iuml|md|mdx|markdown)$/i;

async function readDiagrams(repo: RepoView): Promise<readonly Diagram[]> {
  const artifacts = await detectDesignArtifacts(repo);
  // A diagram is a claim about this project's structure when it is a diagram file of its own, or is
  // drawn in a design document (an architecture document, the README's design section). A flowchart
  // in a tutorial, or one that explains a workflow, draws steps and syntax, not modules.
  const designDocuments = new Set(artifacts.documents);
  const paths = [
    ...artifacts.diagramSources.filter((path) => !isTestFile(path)),
    ...artifacts.embeddedDiagrams.filter((path) => designDocuments.has(path)),
  ].filter((path) => READABLE.test(path));
  const diagrams = await Promise.all(
    [...new Set(paths)].sort().map(async (path) => {
      const text = await repo.read(path);
      return text === undefined ? [] : parseDiagrams(path, text);
    }),
  );
  return diagrams.flat();
}

/**
 * Words that name what is around the system or a kind of part, not a module of the code: a box
 * with one of these alone is a user, an outside service, or a layer of the picture.
 */
const NOT_A_MODULE = new Set([
  'user',
  'users',
  'customer',
  'admin',
  'browser',
  'client',
  'clients',
  'internet',
  'external',
  'database',
  'db',
  'cache',
  'queue',
  'storage',
  'server',
  'cloud',
  'network',
  'frontend',
  'backend',
  'ui',
  'api',
  'app',
  'web',
  'system',
  'service',
  'services',
  'actor',
  'developer',
  'dev',
  'ci',
  'cd',
  'start',
  'end',
  'stop',
  'yes',
  'no',
]);

/**
 * What a box says about the code, if it says anything. `cli: args, exit codes` names the module `cli`;
 * `core/scan` and `Catalog.API` name a path and a project. Free text (`Developer / CI`, `Project
 * files`) is a description, not a claim about the code, and is left alone.
 */
export function declaredModule(label: string): string | undefined {
  const head = label.includes('://') ? label : (label.split(':')[0] ?? '').trim();
  if (!/^[A-Za-z][\w./-]*$/.test(head) || head.length < 2) {
    return undefined;
  }
  // A single capitalized word with no description (`Reviewer`, `Orders`) reads as a name for a person
  // or an idea as often as for a module; `cli`, `OrderService`, and `core/scan` do not.
  const described = label.includes(':') && !label.includes('://');
  if (!described && /^[A-Z][a-z0-9]*$/.test(head)) {
    return undefined;
  }
  return NOT_A_MODULE.has(head.toLowerCase()) ? undefined : head;
}

const place = (diagram: Diagram, line: number): RepoHit['startLine'] =>
  diagram.nodes.length ? line : 1;

export const diagramNamesMissingModule = defineRepoRule({
  meta: {
    id: 'SC-DOC-007',
    title: 'A diagram names a module the code does not have',
    category: 'documentation',
    defaultSeverity: 'info',
    confidence: 'low',
    heuristic: true,
    standards: [c4, iso42010],
    rationale:
      'A diagram is a promise about the structure of the code. When it names a module (`repo-files`, `suggestions`) that no folder, file, package, namespace, or class in the project is called, either the code moved on and the picture did not, or the box was never a module. A reader who trusts the diagram goes looking for something that is not there. The check reads boxes written as a module name (`cli: args, exit codes`, `core/scan`, `Catalog.API`) and leaves free text alone, so a name that the code spells differently can be reported.',
    suggestion: {
      summary:
        'Rename the box to what the code calls it, remove it if the module is gone, or label it as external (a person, a service outside the project) so it is not read as a module.',
      before: 'Rank[ranking: sort by severity]   %% no folder or file called ranking',
      after: 'Rank[core/finding: sort by severity]',
    },
  },
  options: z.strictObject({}),
  async check(repo) {
    if (repo.codeFiles.length === 0) {
      return [];
    }
    const diagrams = await readDiagrams(repo);
    if (diagrams.length === 0) {
      return [];
    }
    const code = await collectCodeNames(repo);
    const claims = diagrams.flatMap((diagram) => {
      const seen = new Set<string>();
      return diagram.nodes.flatMap((node) => {
        const name = declaredModule(node.label);
        const normal = name === undefined ? '' : normalizeName(name);
        if (name === undefined || seen.has(normal) || code.has(name)) {
          return [];
        }
        seen.add(normal);
        return [{ diagram, node, name, normal }];
      });
    });
    // What no folder, file, or class is called may still be written in the code (an API such as
    // `chrome.storage.local`): that is not a module that went missing.
    const written = await namesWrittenInCode(
      repo,
      claims.map((claim) => claim.name),
    );
    return claims
      .filter((claim) => !written.has(claim.name))
      .map(({ diagram, node, name, normal }) => ({
        path: diagram.path,
        startLine: place(diagram, node.line),
        endLine: node.line,
        message: `The ${diagram.kind === 'mermaid' ? 'Mermaid' : 'PlantUML'} diagram names "${name}" as a module, but the project has no folder, file, package, namespace, or class called that.`,
        key: normal,
      }));
  },
});

/** A code component needs this many files to be expected in a diagram: a folder of two is a detail. */
const MIN_FILES = 3;
/** Diagrams that name fewer modules than this are not a map of the code, so nothing is expected of them. */
const MIN_DECLARED = 3;
const MAX_NAMED = 8;

/** The tokens of a folder name: `repo_view`, `RepoView`, and `repo-view` are `repo` and `view`. */
const tokensOf = (name: string): string[] =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length > 1);

export const componentMissingFromDiagrams = defineRepoRule({
  meta: {
    id: 'SC-DOC-008',
    title: 'A part of the code is not in the diagrams',
    category: 'documentation',
    defaultSeverity: 'note',
    confidence: 'low',
    heuristic: true,
    standards: [c4, iso42010],
    rationale:
      'When a project draws its modules (at least three boxes written as module names), the picture is expected to be the map: a folder of real size that appears nowhere in it is either new since the diagram was drawn or deliberately left out, and a reader of the diagram does not know it exists. A part is counted as shown if any word of its name appears anywhere in a diagram.',
    suggestion: {
      summary:
        'Add the folder to the diagram, or leave it out on purpose and say so (a note under the diagram that lists what is not drawn).',
      before: '%% diagram shows cli, core, rules; src/shared has 4 files',
      after:
        'Shared[shared: errors, severity, comparison] is drawn, with arrows from cli, core, and rules',
    },
  },
  options: z.strictObject({
    /** A folder needs at least this many source files to be expected in the diagrams. */
    minFiles: z.number().int().min(1).default(MIN_FILES),
  }),
  async check(repo, options) {
    const diagrams = await readDiagrams(repo);
    const declared = diagrams
      .flatMap((diagram) => diagram.nodes)
      .filter((node) => declaredModule(node.label));
    if (declared.length < MIN_DECLARED) {
      return [];
    }
    const shown = new Set(diagrams.flatMap((diagram) => [...diagram.words]));
    const files = projectCode(repo).map((file) => file.path);
    const components = assignComponents(files, projectFolders(repo));
    const sizes = new Map<string, number>();
    for (const component of components.values()) {
      if (component !== LOOSE) {
        sizes.set(component, (sizes.get(component) ?? 0) + 1);
      }
    }
    const missing = [...sizes]
      .filter(([, count]) => count >= options.minFiles)
      .map(([component]) => component)
      .filter((component) => {
        const name = component.split('/').pop() ?? component;
        return !tokensOf(name).some(
          (token) => shown.has(token) || shown.has(token.replace(/s$/, '')),
        );
      })
      .sort();
    const first = diagrams[0];
    if (missing.length === 0 || !first) {
      return [];
    }
    const named = missing.slice(0, MAX_NAMED).join(', ');
    const more = missing.length > MAX_NAMED ? ` and ${missing.length - MAX_NAMED} more` : '';
    return [
      {
        path: first.path,
        startLine: 1,
        endLine: 1,
        message: `The diagrams draw ${declared.length} modules, but not ${named}${more}: ${missing.length === 1 ? 'a folder' : 'folders'} of ${options.minFiles} or more source files that no diagram mentions.`,
        key: 'undrawn-components',
      },
    ];
  },
});

function projectFolders(repo: RepoView): string[] {
  return repo.files
    .filter((path) => path.endsWith('.csproj'))
    .map((path) => path.split('/').slice(0, -1).join('/'));
}
