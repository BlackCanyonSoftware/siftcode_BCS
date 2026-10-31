import { readFile } from 'node:fs/promises';
import { discoverFiles, type SkippedCounts } from '../discovery/discover.js';
import { SyntaxParser } from '../languages/parser.js';

export interface FileProblem {
  readonly path: string;
  readonly reason: 'syntax-error' | 'timeout' | 'unreadable';
}

export interface ScanResult {
  /** Absolute path that was scanned. */
  readonly root: string;
  readonly filesScanned: number;
  /** Files per language display name, sorted by name. */
  readonly byLanguage: readonly (readonly [language: string, count: number])[];
  /** Files that could not be read or parsed cleanly. The scan continues past them. */
  readonly problems: readonly FileProblem[];
  readonly skipped: SkippedCounts;
}

/**
 * Walking skeleton of the scan pipeline: discover files, parse each one, summarize.
 * Source code is only ever read and parsed, never executed.
 */
export async function scan(path: string): Promise<ScanResult> {
  const discovery = await discoverFiles(path);
  const parser = await SyntaxParser.create();
  const counts = new Map<string, number>();
  const problems: FileProblem[] = [];

  try {
    for (const file of discovery.files) {
      counts.set(file.displayName, (counts.get(file.displayName) ?? 0) + 1);
      let source: string;
      try {
        source = await readFile(file.absolutePath, 'utf8');
      } catch {
        problems.push({ path: file.relativePath, reason: 'unreadable' });
        continue;
      }
      const outcome = await parser.parse(file.grammar, source);
      if (outcome !== 'ok') {
        problems.push({ path: file.relativePath, reason: outcome });
      }
    }
  } finally {
    parser.dispose();
  }

  return {
    root: discovery.root,
    filesScanned: discovery.files.length,
    byLanguage: [...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    problems,
    skipped: discovery.skipped,
  };
}
