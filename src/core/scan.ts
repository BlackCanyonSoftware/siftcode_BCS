import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG, type Config } from '../config/schema.js';
import { discoverFiles, type SourceFile } from '../discovery/discover.js';
import type { AnalyzedFile, CodeFile } from '../languages/model/types.js';
import { SyntaxParser } from '../languages/parser.js';
import { ALL_RULES } from '../rules/index.js';
import { resolveRules, type ConfiguredRule } from '../rules/resolve.js';
import type { RepoView } from '../rules/types.js';
import { compareStrings } from './compare.js';
import { compareFindings, createFinding, type Finding } from './finding.js';
import { createRepoView } from './repo-view.js';
import type { FileProblem, ScanResult } from './result.js';

export interface ScanOptions {
  readonly config?: Config;
}

/**
 * Discovers files, parses each one, runs the enabled rules, and collects the findings. Source code
 * is only ever read and parsed, never executed.
 */
export async function scan(path: string, options: ScanOptions = {}): Promise<ScanResult> {
  const config = options.config ?? DEFAULT_CONFIG;
  const rules = resolveRules(config, ALL_RULES);
  const discovery = await discoverFiles(path, { ignore: config.ignore });

  const parser = await SyntaxParser.create();
  const languageCounts = new Map<string, number>();
  const findings: Finding[] = [];
  const files: CodeFile[] = [];
  const problems: FileProblem[] = [];
  try {
    for (const file of discovery.files) {
      languageCounts.set(file.displayName, (languageCounts.get(file.displayName) ?? 0) + 1);
      const analysis = await analyzeFile(file, parser, rules);
      findings.push(...analysis.findings);
      if (analysis.file) {
        files.push(analysis.file);
      }
      if (analysis.problem) {
        problems.push({ path: file.relativePath, reason: analysis.problem });
      }
    }
  } finally {
    parser.dispose();
  }
  const notes = new Set<string>();
  if (discovery.isDirectory) {
    const repo = createRepoView(discovery, {
      codeFiles: files,
      onNote: (message) => notes.add(message),
    });
    findings.push(...(await runRepoRules(repo, rules)));
  }

  return {
    root: discovery.root,
    filesScanned: discovery.files.length,
    byLanguage: [...languageCounts].sort(([a], [b]) => compareStrings(a, b)),
    findings: findings.sort(compareFindings),
    files,
    rules: rules.map((rule) => rule.meta).sort((a, b) => compareStrings(a.id, b.id)),
    problems,
    skipped: discovery.skipped,
    notes: [...notes].sort(compareStrings),
  };
}

interface FileAnalysis {
  readonly findings: readonly Finding[];
  /** The measured file; absent when it could not be read or parsed cleanly. */
  readonly file?: CodeFile;
  readonly problem?: FileProblem['reason'];
}

async function analyzeFile(
  file: SourceFile,
  parser: SyntaxParser,
  rules: readonly ConfiguredRule[],
): Promise<FileAnalysis> {
  let source: string;
  try {
    source = await readFile(file.absolutePath, 'utf8');
  } catch {
    return { findings: [], problem: 'unreadable' };
  }

  const parsed = await parser.parse(file.grammar, source);
  if (parsed.outcome !== 'ok') {
    return { findings: [], problem: parsed.outcome };
  }
  const codeFile: CodeFile = {
    path: file.relativePath,
    language: file.displayName,
    grammar: file.grammar,
    lineCount: countLines(source),
    metrics: parsed.metrics,
    units: parsed.units,
    classes: parsed.classes,
  };
  // The facts are only needed while rules run, so the summary kept in the result leaves them out.
  return { findings: runRules({ ...codeFile, facts: parsed.facts }, rules), file: codeFile };
}

function runRules(file: AnalyzedFile, rules: readonly ConfiguredRule[]): Finding[] {
  const occurrences = new Map<string, number>();
  return rules.flatMap((rule) =>
    rule.check(file).map((hit) => {
      const identity = `${rule.meta.id}\n${hit.key}`;
      const occurrence = (occurrences.get(identity) ?? 0) + 1;
      occurrences.set(identity, occurrence);
      return createFinding(rule, file.path, hit, occurrence);
    }),
  );
}

/** Runs the repository-level rules (manifests, lockfiles, CI, documentation) once for the scan. */
async function runRepoRules(repo: RepoView, rules: readonly ConfiguredRule[]): Promise<Finding[]> {
  const occurrences = new Map<string, number>();
  const findings: Finding[] = [];
  for (const rule of rules) {
    for (const hit of (await rule.repoCheck?.(repo)) ?? []) {
      const identity = `${rule.meta.id}\n${hit.path}\n${hit.key}`;
      const occurrence = (occurrences.get(identity) ?? 0) + 1;
      occurrences.set(identity, occurrence);
      findings.push(createFinding(rule, hit.path, hit, occurrence));
    }
  }
  return findings;
}

/** Number of lines, not counting the empty "line" after a trailing newline. */
function countLines(source: string): number {
  if (source === '') {
    return 0;
  }
  const lines = source.split(/\r\n|\r|\n/);
  return lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
}
