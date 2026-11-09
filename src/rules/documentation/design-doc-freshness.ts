import { posix } from 'node:path';
import { z } from 'zod';
import type { Commit } from '../../git/types.js';
import type { CodeFile } from '../../languages/model/types.js';
import { defineRepoRule } from '../define.js';
import { MAX_COMMITS, SECONDS_PER_DAY } from '../git/churn.js';
import { arc42, iso42010 } from '../standards.js';
import type { RepoHit } from '../types.js';
import { detectDesignArtifacts } from './detect.js';

/** Folder names that hold documentation about the code around them rather than being code areas. */
const DOCUMENTATION_FOLDERS = new Set([
  'docs',
  'doc',
  'documentation',
  'design',
  'designs',
  'architecture',
  'arc42',
  'c4',
  'diagrams',
  'specs',
  'wiki',
]);

/**
 * The folder a design document covers: where it sits, minus documentation folders on the way up
 * (`src/auth/docs` covers `src/auth`; `docs/architecture` covers the whole project).
 */
export function coveredFolder(documentPath: string): string {
  const parts = posix
    .dirname(documentPath)
    .split('/')
    .filter((part) => part !== '.');
  while (
    parts.length > 0 &&
    DOCUMENTATION_FOLDERS.has((parts[parts.length - 1] ?? '').toLowerCase())
  ) {
    parts.pop();
  }
  return parts.join('/');
}

interface Limits {
  readonly minChangedLines: number;
  readonly minChangedShare: number;
  readonly maxFilesPerCommit: number;
}

interface DatedDocument {
  readonly path: string;
  /** When it last changed, in seconds since 1970. */
  readonly time: number;
}

/** How much of the code a document covers changed in the commits after the document did. */
function codeChangedSince(
  document: DatedDocument,
  commits: readonly Commit[],
  codeFiles: readonly CodeFile[],
  maxFilesPerCommit: number,
) {
  const folder = coveredFolder(document.path);
  const area = codeFiles.filter((file) => folder === '' || file.path.startsWith(`${folder}/`));
  const inArea = new Set(area.map((file) => file.path));
  let commitCount = 0;
  let lines = 0;
  for (const commit of commits) {
    if (commit.time <= document.time || commit.files.length > maxFilesPerCommit) {
      continue;
    }
    const touched = commit.files.filter((file) => inArea.has(file.path));
    commitCount += touched.length > 0 ? 1 : 0;
    lines += touched.reduce((sum, file) => sum + file.added + file.deleted, 0);
  }
  return { commitCount, lines, currentLines: area.reduce((sum, file) => sum + file.lineCount, 0) };
}

function staleHit(
  document: DatedDocument,
  commits: readonly Commit[],
  codeFiles: readonly CodeFile[],
  limits: Limits,
  now: number,
): RepoHit | undefined {
  const { commitCount, lines, currentLines } = codeChangedSince(
    document,
    commits,
    codeFiles,
    limits.maxFilesPerCommit,
  );
  const share = currentLines === 0 ? 0 : lines / currentLines;
  if (lines < limits.minChangedLines || share < limits.minChangedShare) {
    return undefined;
  }
  const days = Math.floor((now - document.time) / SECONDS_PER_DAY);
  return {
    path: document.path,
    startLine: 1,
    endLine: 1,
    message: `${document.path} was last changed ${days} days ago; since then ${commitCount} commits changed ${lines} lines (${Math.round(share * 100)}% of the ${currentLines} lines now) of the code it covers: check that it still describes the code.`,
    key: 'stale',
  };
}

export const staleDesignDocuments = defineRepoRule({
  meta: {
    id: 'SC-DOC-005',
    title: 'Design document may be out of date',
    category: 'documentation',
    defaultSeverity: 'info',
    confidence: 'low',
    heuristic: true,
    standards: [iso42010, arc42],
    rationale:
      'A design document is only worth reading while it still describes the code. When a large share of the code it covers has been rewritten since the document last changed, it probably no longer does. This is a guess from Git history: the document may still be right.',
    suggestion: {
      summary:
        'Read the document against the code it covers and update what changed, or mark it as historical (or delete it) if it no longer applies.',
    },
  },
  options: z.strictObject({
    /** A document younger than this many days is not checked. */
    minAgeDays: z.number().int().min(0).default(90),
    /** At least this many lines of the covered code must have changed since the document. */
    minChangedLines: z.number().int().min(1).default(500),
    /** The lines changed must be at least this share of the covered code as it is now. */
    minChangedShare: z.number().min(0).default(0.5),
    /** A commit that changes more files than this is ignored (mass reformat, vendored import). */
    maxFilesPerCommit: z.number().int().min(1).default(100),
    /** At most this many design documents are checked. */
    maxDocuments: z.number().int().min(1).default(20),
  }),
  async check(repo, options) {
    const artifacts = await detectDesignArtifacts(repo);
    const documents = [...new Set([...artifacts.documents, ...artifacts.diagramSources])].slice(
      0,
      options.maxDocuments,
    );
    if (repo.codeFiles.length === 0 || documents.length === 0) {
      return [];
    }
    const git = await repo.git();
    if (!git.available) {
      repo.note(`Design document freshness (SC-DOC-005) was skipped: ${git.reason}.`);
      return [];
    }
    const now = Date.now() / 1000;
    const changed = await Promise.all(
      documents.map(async (path) => ({ path, time: await git.lastChange(path) })),
    );
    const old = changed.flatMap(({ path, time }): DatedDocument[] =>
      time !== undefined && now - time >= options.minAgeDays * SECONDS_PER_DAY
        ? [{ path, time }]
        : [],
    );
    if (old.length === 0) {
      return [];
    }
    const since = new Date(Math.min(...old.map((document) => document.time)) * 1000);
    const log = await git.commitsSince(since, MAX_COMMITS);
    if (log.truncated) {
      repo.note(
        `Design document freshness (SC-DOC-005) looked at the newest ${MAX_COMMITS} commits only.`,
      );
    }
    return old.flatMap((document) => {
      const hit = staleHit(document, log.commits, repo.codeFiles, options, now);
      return hit ? [hit] : [];
    });
  },
});
