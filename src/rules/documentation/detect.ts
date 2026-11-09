import { posix } from 'node:path';
import { isVendored } from '../shared.js';
import type { RepoView } from '../types.js';

/** What a project has to show how it is designed, found by file names and a few fenced blocks. */
export interface DesignArtifacts {
  /** Written design or architecture documents (architecture.md, docs/design/…, a README section). */
  readonly documents: readonly string[];
  /** Architecture decision records (docs/adr/0001-….md and similar). */
  readonly decisionRecords: readonly string[];
  /** Diagram source files: text formats (Mermaid, PlantUML, D2, DBML, Structurizr, Graphviz) and editor or interchange files (draw.io, Excalidraw, Visio, XMI, ArchiMate). */
  readonly diagramSources: readonly string[];
  /** Pictures of diagrams: images under design folders or named like a diagram. */
  readonly diagramImages: readonly string[];
  /** Markdown, reStructuredText, or AsciiDoc files holding a fenced diagram block. */
  readonly embeddedDiagrams: readonly string[];
  /** OpenAPI, Swagger, or AsyncAPI descriptions. */
  readonly apiSpecs: readonly string[];
}

export const hasDiagrams = (artifacts: DesignArtifacts): boolean =>
  artifacts.diagramSources.length +
    artifacts.diagramImages.length +
    artifacts.embeddedDiagrams.length >
  0;

export const hasAnyDesignArtifact = (artifacts: DesignArtifacts): boolean =>
  artifacts.documents.length +
    artifacts.decisionRecords.length +
    artifacts.apiSpecs.length +
    Number(hasDiagrams(artifacts)) >
  0;

const TEXT_DOCUMENT = /\.(?:md|mdx|markdown|rst|adoc|asciidoc|txt)$/i;
const BINARY_DOCUMENT = /\.(?:docx?|odt|pdf)$/i;
const TEXT_AND_BINARY = (path: string): boolean =>
  TEXT_DOCUMENT.test(path) || BINARY_DOCUMENT.test(path);

const DIAGRAM_AS_CODE =
  /\.(?:mmd|mermaid|puml|plantuml|pu|wsd|iuml|d2|dbml|dot|gv)$|(?:^|\/)workspace[\w.-]*\.dsl$/i;
const DIAGRAM_EDITOR_FILE =
  /\.(?:drawio|dio|excalidraw|vsdx|vsdm|vsd|xmi|uml|archimate|mdj|graffle)$|\.drawio\.(?:png|svg)$/i;
const IMAGE = /\.(?:png|svg|jpe?g|gif|webp)$/i;
const DESIGN_FOLDERS = new Set([
  'architecture',
  'design',
  'designs',
  'diagrams',
  'diagram',
  'uml',
  'c4',
  'arc42',
  'adr',
  'adrs',
]);
const DIAGRAM_NAME =
  /diagram|architecture|\buml\b|\bc4\b|\berd\b|sequence|flowchart|topology|data-?flow|deployment|infrastructure|system-overview/i;

const API_SPEC = /(?:^|[-_.])(?:openapi|swagger|asyncapi)(?:[-_.][\w.-]*)?\.(?:ya?ml|json)$/i;

const DESIGN_WORD = /(?:^|[-_. ])(?:architecture|design|arc42|hld|lld)(?:$|[-_. ])/i;
const NOT_DESIGN_DOCUMENT =
  /design[-_ ](?:systems?|tokens?|guidelines?|principles|language|patterns?)/i;
const DESIGN_DOCUMENT_FOLDERS = new Set([
  'architecture',
  'design',
  'designs',
  'arc42',
  'c4',
  'rfc',
  'rfcs',
]);
const DECISION_FOLDER =
  /(?:^|\/)(?:adrs?|decisions?|architecture-decisions?|architecture_decisions?)\//i;
const DECISION_FILE = /^adr[-_ ]?\d+/i;
const FENCED_DIAGRAM =
  /^[ \t]*(?:```|~~~)[ \t]*\{?\.?(?:mermaid|plantuml|puml|d2|graphviz|dot|structurizr|c4plantuml|nomnoml|ditaa|blockdiag|seqdiag)\b|^\.\. (?:uml|graphviz|mermaid)::|^\[(?:plantuml|mermaid|graphviz|ditaa)[,\]]/im;
const README_DESIGN_SECTION =
  /^#{1,3}[ \t]+(?:architecture|system design|software design|high[- ]level design|design)\b/im;

/** At most this many prose files are opened to look for fenced diagrams and references. */
const MAX_PROSE_FILES = 300;

const segments = (path: string): string[] => path.toLowerCase().split('/');

function isDecisionRecord(path: string): boolean {
  return (
    TEXT_AND_BINARY(path) &&
    (DECISION_FOLDER.test(path) || DECISION_FILE.test(posix.basename(path)))
  );
}

function isDesignDocument(path: string): boolean {
  if (!TEXT_AND_BINARY(path) || isDecisionRecord(path)) {
    return false;
  }
  const folders = segments(posix.dirname(path));
  if (folders.some((folder) => DESIGN_DOCUMENT_FOLDERS.has(folder))) {
    return TEXT_DOCUMENT.test(path);
  }
  const name = posix.basename(path).replace(/\.[^.]+$/, '');
  return DESIGN_WORD.test(name) && !NOT_DESIGN_DOCUMENT.test(name);
}

function isDiagramImage(path: string): boolean {
  if (!IMAGE.test(path) || DIAGRAM_EDITOR_FILE.test(path)) {
    return false;
  }
  const folders = segments(posix.dirname(path));
  return (
    folders.some((folder) => DESIGN_FOLDERS.has(folder)) || DIAGRAM_NAME.test(posix.basename(path))
  );
}

const isProse = (path: string): boolean => TEXT_DOCUMENT.test(path);

const cache = new WeakMap<RepoView, Promise<DesignArtifacts>>();

/** Looks through the project's files for design documentation. The result is cached per scan. */
export function detectDesignArtifacts(repo: RepoView): Promise<DesignArtifacts> {
  let pending = cache.get(repo);
  if (!pending) {
    pending = detect(repo);
    cache.set(repo, pending);
  }
  return pending;
}

async function detect(repo: RepoView): Promise<DesignArtifacts> {
  const files = repo.files.filter((path) => !isVendored(path));
  const documents = files.filter(isDesignDocument);
  const prose = files.filter(isProse).slice(0, MAX_PROSE_FILES);

  const embeddedDiagrams: string[] = [];
  await Promise.all(
    prose.map(async (path) => {
      const text = await repo.read(path);
      if (text !== undefined && FENCED_DIAGRAM.test(text)) {
        embeddedDiagrams.push(path);
      }
      if (
        text !== undefined &&
        /^readme(?:\.\w+)?$/i.test(path) &&
        README_DESIGN_SECTION.test(text)
      ) {
        documents.push(path);
      }
    }),
  );

  return {
    documents: documents.sort(),
    decisionRecords: files.filter(isDecisionRecord),
    diagramSources: files.filter(
      (path) => DIAGRAM_AS_CODE.test(path) || DIAGRAM_EDITOR_FILE.test(path),
    ),
    diagramImages: files.filter(isDiagramImage),
    embeddedDiagrams: embeddedDiagrams.sort(),
    apiSpecs: files.filter((path) => API_SPEC.test(posix.basename(path))),
  };
}

/**
 * Diagram source files that no document mentions. A document counts as mentioning a diagram when
 * it contains the file name, or the name with an image extension (a draw.io file exported to PNG).
 */
export async function unreferencedDiagramSources(
  repo: RepoView,
  artifacts: DesignArtifacts,
): Promise<readonly string[]> {
  if (artifacts.diagramSources.length === 0) {
    return [];
  }
  const prose = repo.files
    .filter((path) => !isVendored(path) && isProse(path))
    .slice(0, MAX_PROSE_FILES);
  const texts = (await Promise.all(prose.map((path) => repo.read(path)))).filter(
    (text): text is string => text !== undefined,
  );
  const corpus = texts.join('\n').toLowerCase();
  return artifacts.diagramSources.filter((path) => {
    const name = posix.basename(path).toLowerCase();
    const stem = name.replace(/(?:\.drawio)?\.[^.]+$/, '');
    return !(
      corpus.includes(name) ||
      new RegExp(`${escapeForRegExp(stem)}\\.(?:png|svg|jpe?g|gif|webp|pdf)`).test(corpus)
    );
  });
}

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
