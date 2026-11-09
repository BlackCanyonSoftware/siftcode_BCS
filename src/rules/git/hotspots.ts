import { z } from 'zod';
import { defineRepoRule } from '../define.js';
import { isTestFile } from '../shared.js';
import type { RepoHit, StandardRef } from '../types.js';
import { churnByFile, MAX_COMMITS, monthsAgo } from './churn.js';

const tornhill: StandardRef = {
  standard: 'Your Code as a Crime Scene (Adam Tornhill, Pragmatic Programmers)',
  id: 'Hotspots: change frequency times complexity',
  url: 'https://pragprog.com/titles/atcrime2/your-code-as-a-crime-scene-second-edition/',
};
const nagappanBall: StandardRef = {
  standard:
    'Nagappan and Ball, Use of relative code churn measures to predict system defect density (ICSE 2005)',
  url: 'https://doi.org/10.1145/1062455.1062514',
};
const graves: StandardRef = {
  standard:
    'Graves, Karr, Marron, and Siy, Predicting fault incidence using software change history (IEEE TSE 2000)',
  url: 'https://doi.org/10.1109/32.859533',
};

export const hotspots = defineRepoRule({
  meta: {
    id: 'SC-HOT-001',
    title: 'Complex file that changes often (hotspot)',
    category: 'maintainability',
    defaultSeverity: 'info',
    confidence: 'medium',
    heuristic: true,
    standards: [tornhill, nagappanBall, graves],
    rationale:
      'Code that is both hard to understand and changed all the time is where defects and delays collect: every change there costs more and is more likely to break something. Complexity alone, or churn alone, is less telling than the two together, so this ranks the files that have both.',
    suggestion: {
      summary:
        'Spend refactoring time here first: split the file along the parts that change together, add tests around it before changing it, and look at who else has to touch it.',
    },
  },
  options: z.strictObject({
    /** How far back in the Git history to look, in months. */
    windowMonths: z.number().int().min(1).max(120).default(12),
    /** How many hotspots to report, most pressing first. */
    top: z.number().int().min(1).default(10),
    /** A file must have been changed in at least this many commits in the window. */
    minChanges: z.number().int().min(1).default(5),
    /** A file must have at least this total cyclomatic complexity. */
    minComplexity: z.number().int().min(1).default(30),
    /** A commit that changes more files than this is ignored (mass reformat, vendored import). */
    maxFilesPerCommit: z.number().int().min(1).default(100),
  }),
  async check(repo, options) {
    if (repo.codeFiles.length === 0) {
      return [];
    }
    const git = await repo.git();
    if (!git.available) {
      repo.note(`Hotspots (SC-HOT-001) were skipped: ${git.reason}.`);
      return [];
    }
    const log = await git.commitsSince(monthsAgo(options.windowMonths), MAX_COMMITS);
    if (log.truncated) {
      repo.note(`Hotspots (SC-HOT-001) looked at the newest ${MAX_COMMITS} commits only.`);
    }
    const churn = churnByFile(log.commits, options.maxFilesPerCommit);
    const ranked = repo.codeFiles
      .filter((file) => !isTestFile(file.path))
      .flatMap((file) => {
        const changes = churn.get(file.path)?.commits ?? 0;
        const complexity = file.metrics.cyclomatic;
        return changes >= options.minChanges && complexity >= options.minComplexity
          ? [{ file, changes, complexity, score: changes * complexity }]
          : [];
      })
      .sort((a, b) => b.score - a.score || (a.file.path < b.file.path ? -1 : 1))
      .slice(0, options.top);
    return ranked.map(({ file, changes, complexity }, index): RepoHit => ({
      path: file.path,
      startLine: 1,
      endLine: 1,
      message: `Hotspot #${index + 1}: changed in ${changes} commits in the last ${options.windowMonths} months, with a total cyclomatic complexity of ${complexity} (${file.lineCount} lines).`,
      key: 'hotspot',
    }));
  },
});
