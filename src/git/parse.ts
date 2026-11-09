import type { Commit, FileChange } from './types.js';

/** Separates commits in the log output (the ASCII "record separator", which no path contains). */
export const RECORD_SEPARATOR = '\u001e';

/** One `--numstat` line: lines added, lines deleted (`-` for a binary file), then the path. */
const NUMSTAT_LINE = /^(\d+|-)\t(\d+|-)\t(.+)$/;

function parseFileChange(line: string): FileChange | undefined {
  const match = NUMSTAT_LINE.exec(line);
  if (!match?.[3]) {
    return undefined;
  }
  return {
    path: match[3],
    added: match[1] === '-' ? 0 : Number(match[1]),
    deleted: match[2] === '-' ? 0 : Number(match[2]),
  };
}

/**
 * Reads the output of `git log --numstat --format=%x1e%ct`: a record separator and the commit time
 * on one line, then one tab-separated line per changed file.
 */
export function parseLog(output: string): Commit[] {
  const commits: Commit[] = [];
  for (const record of output.split(RECORD_SEPARATOR)) {
    const [header, ...rest] = record.split('\n');
    const time = Number(header?.trim());
    if (header === undefined || header.trim() === '' || !Number.isFinite(time)) {
      continue;
    }
    const files = rest.flatMap((line) => {
      const change = parseFileChange(line.replace(/\r$/, ''));
      return change ? [change] : [];
    });
    commits.push({ time, files });
  }
  return commits;
}
