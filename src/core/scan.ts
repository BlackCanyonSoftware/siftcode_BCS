import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG, type Config } from '../config/schema.js';
import { discoverFiles, type SourceFile } from '../discovery/discover.js';
import type { AnalyzedFile, CodeFile } from '../languages/model/types.js';
import { SyntaxParser } from '../languages/parser.js';
import { ALL_RULES } from '../rules/index.js';
import { resolveRules, type ConfiguredRule } from '../rules/resolve.js';
import type { RepoView } from '../rules/types.js';
import { acceptFindings } from './accept.js';
import type { Baseline } from './baseline.js';
import { compareStrings } from './compare.js';
import { compareFindings, createFinding, type Finding } from './finding.js';
import { createRepoView } from './repo-view.js';
import type { FileProblem, ScanResult } from './result.js';
import { parseDirectives, type ParsedDirectives, type Suppression } from './suppressions.js';

export interface ScanOptions {
  readonly config?: Config;
  /** Findings to accept, so that only new ones are reported (US-070). */
  readonly baseline?: Baseline;
}

const KNOWN_RULE_IDS: ReadonlySet<string> = new Set(ALL_RULES.map((rule) => rule.meta.id));

/**
 * Discovers files, parses each one, runs the enabled rules, and collects the findings. Source code
 * is only ever read and parsed, never executed.
 */
export async function scan(path: string, options: ScanOptions = {}): Promise<ScanResult> {
  const config = options.config ?? DEFAULT_CONFIG;
  const rules = resolveRules(config, ALL_RULES);
  const discovery = await discoverFiles(path, { ignore: config.ignore });

  const { languageCounts, findings, files, problems, suppressions, notes } = await analyzeAll(
    discovery.files,
    rules,
  );
  if (discovery.isDirectory) {
    const repo = createRepoView(discovery, {
      codeFiles: files,
      onNote: (message) => notes.add(message),
    });
    findings.push(...(await runRepoRules(repo, rules)));
  }
  const enabled = new Set(rules.map((rule) => rule.meta.id));
  const acceptance = acceptFindings(
    findings.sort(compareFindings),
    suppressions,
    options.baseline,
    enabled,
  );
  acceptance.notes.forEach((note) => notes.add(note));

  return {
    root: discovery.root,
    filesScanned: discovery.files.length,
    byLanguage: [...languageCounts].sort(([a], [b]) => compareStrings(a, b)),
    findings: acceptance.findings,
    accepted: acceptance.accepted,
    files,
    rules: rules.map((rule) => rule.meta).sort((a, b) => compareStrings(a.id, b.id)),
    problems,
    skipped: discovery.skipped,
    notes: [...notes].sort(compareStrings),
  };
}

/** What the per-file pass produced, before repository-level rules and acceptance. */
interface Analysis {
  readonly languageCounts: Map<string, number>;
  readonly findings: Finding[];
  readonly files: CodeFile[];
  readonly problems: FileProblem[];
  readonly suppressions: Suppression[];
  readonly notes: Set<string>;
}

/** Parses every file once and runs the file-level rules on it. */
async function analyzeAll(
  sourceFiles: readonly SourceFile[],
  rules: readonly ConfiguredRule[],
): Promise<Analysis> {
  const result: Analysis = {
    languageCounts: new Map(),
    findings: [],
    files: [],
    problems: [],
    suppressions: [],
    notes: new Set(),
  };
  const parser = await SyntaxParser.create();
  try {
    for (const file of sourceFiles) {
      const counts = result.languageCounts;
      counts.set(file.displayName, (counts.get(file.displayName) ?? 0) + 1);
      const analysis = await analyzeFile(file, parser, rules);
      result.findings.push(...analysis.findings);
      result.suppressions.push(...analysis.directives.suppressions);
      analysis.directives.notes.forEach((note) => result.notes.add(note));
      if (analysis.file) {
        result.files.push(analysis.file);
      }
      if (analysis.problem) {
        result.problems.push({ path: file.relativePath, reason: analysis.problem });
      }
    }
  } finally {
    parser.dispose();
  }
  return result;
}

const NO_DIRECTIVES: ParsedDirectives = { suppressions: [], notes: [] };

interface FileAnalysis {
  readonly findings: readonly Finding[];
  /** The `siftcode-ignore` comments of the file. */
  readonly directives: ParsedDirectives;
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
    return { findings: [], directives: NO_DIRECTIVES, problem: 'unreadable' };
  }

  const parsed = await parser.parse(file.grammar, source);
  if (parsed.outcome !== 'ok') {
    return { findings: [], directives: NO_DIRECTIVES, problem: parsed.outcome };
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
  const directives =
    parsed.facts.directives.length === 0
      ? NO_DIRECTIVES
      : parseDirectives(
          file.relativePath,
          parsed.facts.directives,
          source.split(/\r\n|\r|\n/),
          KNOWN_RULE_IDS,
        );
  return {
    findings: runRules({ ...codeFile, facts: parsed.facts }, rules),
    directives,
    file: codeFile,
  };
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
