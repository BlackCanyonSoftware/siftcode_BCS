import { posix } from 'node:path';
import { z } from 'zod';
import { defineRepoRule } from '../define.js';
import { arc42, iso42010 } from '../standards.js';
import type { RepoHit, RepoView } from '../types.js';
import { detectDesignArtifacts } from './detect.js';

/** A source file a document names, and where. */
export interface PathReference {
  readonly path: string;
  readonly line: number;
  /** `code`: inside inline code (`src/a.py`); `link`: the target of a relative link. */
  readonly kind: 'code' | 'link';
}

/** The source languages SiftCode reads: a file with one of these extensions is checkable. */
const SOURCE_PATH =
  /^(?:\.{1,2}\/)*(?:[\w.@+-]+\/)*[\w.@+-]+\.(?:py|pyi|js|jsx|mjs|cjs|ts|tsx|cs)$/;

/** Inline code: `x` in Markdown, ``x`` in reStructuredText (and the text of a role such as :file:`x`). */
const CODE_SPAN = /`{1,2}([^`\n]+)`{1,2}/g;
/** The target of a Markdown link, without an anchor. */
const LINK_TARGET = /\]\(([^)\s#]+)(?:#[^)\s]*)?\)/g;
const FENCE = /^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm;
const LINE_SUFFIX = /(?::\d+(?:[-:]\d+)?|#L\d+(?:-L?\d+)?)$/;

/** Names that mark an example rather than a real file. */
const PLACEHOLDER_STEMS = new Set([
  'foo',
  'bar',
  'baz',
  'qux',
  'xxx',
  'abc',
  'example',
  'examples',
  'sample',
  'file',
  'filename',
  'module',
  'script',
  'myapp',
  'myproject',
  'mymodule',
  'yourapp',
]);
const PLACEHOLDER_SEGMENTS = new Set(['path', 'to', 'your', 'my', 'foo', 'bar', 'example']);
/**
 * Folders whose files cannot be checked: build output (a file there exists only after a build), and
 * the folders SiftCode does not scan, which are therefore not in the project's file list. A name in
 * one of them is left out rather than reported as missing. That includes `bin`, so a JavaScript
 * project's `bin/cli.js` is not checked either.
 */
const GENERATED_FOLDERS = new Set([
  'dist',
  'build',
  'out',
  'target',
  'node_modules',
  'bin',
  'obj',
  'venv',
  '.venv',
  'coverage',
  '__pycache__',
]);

function isPlaceholder(path: string): boolean {
  const segments = path.toLowerCase().split('/');
  const stem = (segments[segments.length - 1] ?? '').replace(/\.[^.]+$/, '');
  return (
    PLACEHOLDER_STEMS.has(stem) ||
    /^(?:my|your|some)[_-]/.test(stem) ||
    segments.slice(0, -1).some((segment) => PLACEHOLDER_SEGMENTS.has(segment))
  );
}

function isCheckable(path: string): boolean {
  const firstFolder = path.replace(/^(?:\.{1,2}\/)+/, '').split('/')[0] ?? '';
  return SOURCE_PATH.test(path) && !isPlaceholder(path) && !GENERATED_FOLDERS.has(firstFolder);
}

/** `"src/a.ts:12",` -> `src/a.ts` */
function cleanToken(token: string): string {
  return token.replace(/^[("'[]+|[)"'\],;:.]+$/g, '').replace(LINE_SUFFIX, '');
}

/** Blanks fenced code blocks but keeps every line where it is: examples there are not claims. */
const withoutFences = (text: string): string =>
  text.replace(FENCE, (block) => block.replace(/[^\n]/g, ' '));

const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length;

/**
 * The source file paths a document names, outside code blocks: in inline code (each word of it,
 * so `python tools/release.py` gives `tools/release.py`) and in the targets of relative links.
 * Placeholders, patterns, absolute paths, web addresses, generated folders, and files that are not
 * source code are left out: only a path that could be checked, and that the document claims, counts.
 */
export function referencedPaths(text: string): readonly PathReference[] {
  const prose = withoutFences(text);
  const found: PathReference[] = [];
  for (const match of prose.matchAll(CODE_SPAN)) {
    const line = lineOf(prose, match.index);
    for (const word of (match[1] ?? '').split(/\s+/)) {
      const path = cleanToken(word);
      if (isCheckable(path)) {
        found.push({ path, line, kind: 'code' });
      }
    }
  }
  for (const match of prose.matchAll(LINK_TARGET)) {
    const path = cleanToken(match[1] ?? '');
    if (isCheckable(path)) {
      found.push({ path, line: lineOf(prose, match.index), kind: 'link' });
    }
  }
  return found.sort((a, b) => a.line - b.line);
}

/** Looks a referenced path up among the project's files, however it was written. */
class ProjectFiles {
  private readonly all: Set<string>;
  private readonly endings: Set<string>;

  constructor(files: readonly string[]) {
    this.all = new Set(files.map((file) => file.toLowerCase()));
    // every trailing part of every path: `a/b/c.py` -> `c.py`, `b/c.py`, `a/b/c.py`
    this.endings = new Set(
      files.flatMap((file) => {
        const parts = file.toLowerCase().split('/');
        return parts.map((_, index) => parts.slice(index).join('/'));
      }),
    );
  }

  has(path: string, documentFolder: string): boolean {
    const wanted = path.toLowerCase();
    const relative = posix.normalize(posix.join(documentFolder, wanted));
    const normalized = posix.normalize(wanted).replace(/^(?:\.\.\/)+/, '');
    return this.all.has(relative) || this.all.has(normalized) || this.endings.has(normalized);
  }
}

/** The line to show and the paths missing, for one document, or `undefined` if it is fine. */
async function missingReferences(
  repo: RepoView,
  documentPath: string,
  files: ProjectFiles,
): Promise<{ total: number; missing: PathReference[] } | undefined> {
  const text = await repo.read(documentPath);
  if (text === undefined) {
    return undefined;
  }
  const folder = posix.dirname(documentPath);
  const references = [
    ...new Map(referencedPaths(text).map((reference) => [reference.path, reference])).values(),
  ];
  return {
    total: references.length,
    missing: references.filter((reference) => !files.has(reference.path, folder)),
  };
}

function describe(
  documentPath: string,
  total: number,
  missing: readonly PathReference[],
  listed: number,
) {
  const names = missing.slice(0, listed).map((reference) => reference.path);
  const more = missing.length > listed ? ` and ${missing.length - listed} more` : '';
  return `${documentPath} names ${total} source files, and ${missing.length} are not in the project: ${names.join(', ')}${more}.`;
}

export const designDocumentsNamingMissingFiles = defineRepoRule({
  meta: {
    id: 'SC-DOC-006',
    title: 'Design document names files that are not in the project',
    category: 'documentation',
    defaultSeverity: 'info',
    confidence: 'medium',
    heuristic: true,
    standards: [iso42010, arc42],
    rationale:
      'A design document that points at files which no longer exist is verifiably out of date: it describes a structure the code has left behind, and a reader who follows it ends up nowhere. This is more reliable than guessing from how much code has changed, because a document that talks about ideas does not go stale when files are rewritten, but one that names files does when they move or go.',
    suggestion: {
      summary:
        'Update each name to where the code is now, or remove the sentence. If the document is deliberately historical, say so at the top and move it out of the folder of current design documents.',
    },
  },
  options: z.strictObject({
    /** A document is reported only when it names at least this many files that are missing. */
    minMissing: z.number().int().min(1).default(2),
    /** At most this many design documents are checked. */
    maxDocuments: z.number().int().min(1).default(20),
    /** How many missing names the message lists. */
    listed: z.number().int().min(1).default(5),
  }),
  async check(repo, options) {
    if (!repo.isRepositoryRoot || repo.sourceFileCount === 0) {
      return [];
    }
    const { documents } = await detectDesignArtifacts(repo);
    const files = new ProjectFiles(repo.files);
    const hits: RepoHit[] = [];
    for (const documentPath of documents.slice(0, options.maxDocuments)) {
      const result = await missingReferences(repo, documentPath, files);
      const [first] = result?.missing ?? [];
      if (
        result === undefined ||
        first === undefined ||
        result.missing.length < options.minMissing
      ) {
        continue;
      }
      hits.push({
        path: documentPath,
        startLine: first.line,
        endLine: first.line,
        message: describe(documentPath, result.total, result.missing, options.listed),
        key: 'missing-files',
      });
    }
    return hits;
  },
});
