import { compareStrings } from '../core/compare.js';
import type { ScanResult } from '../core/result.js';
import { compareSeverity, type Severity } from '../core/severity.js';
import {
  describeCounts,
  describeProblem,
  formatStandard,
  groupByFile,
  plural,
  withRules,
  type FindingDetail,
} from './shared.js';

/** Terminal output. Color is never used, so severity is always spelled out as a word. */
export function renderText(result: ScanResult): string {
  const lines = [
    `SiftCode scan: ${result.root}`,
    `Scanned ${plural(result.filesScanned, 'file')}`,
    ...languageLines(result),
    '',
    ...findingLines(result),
  ];
  if (result.problems.length > 0) {
    lines.push('', `Files not checked: ${result.problems.length}`);
    for (const problem of result.problems) {
      lines.push(`  ${problem.path} ${describeProblem(problem.reason)}`);
    }
  }
  const { unsupported, tooLarge, symlinks } = result.skipped;
  lines.push(
    '',
    `Skipped: ${unsupported} unsupported, ${tooLarge} too large, ${symlinks} symbolic links`,
  );
  return `${lines.join('\n')}\n`;
}

function languageLines(result: ScanResult): string[] {
  const width = Math.max(0, ...result.byLanguage.map(([language]) => language.length));
  return result.byLanguage.map(([language, count]) => `  ${language.padEnd(width)}  ${count}`);
}

function findingLines(result: ScanResult): string[] {
  if (result.findings.length === 0) {
    return ['No findings.'];
  }
  const lines = [`Findings: ${result.findings.length} (${describeCounts(result.findings)})`];
  for (const [path, details] of filesMostSevereFirst(withRules(result))) {
    lines.push('', path);
    for (const { finding, rule } of details) {
      lines.push(
        `  ${path}:${finding.startLine}  ${finding.severity}  ${finding.ruleId}  ${finding.message}`,
        `      Why: ${rule.rationale}`,
        `      Try: ${rule.suggestion.summary}`,
        ...rule.standards.map((standard) => `      Standard: ${formatStandard(standard)}`),
      );
    }
  }
  return lines;
}

/** Files with the most severe finding first, then by path; findings keep their line order. */
function filesMostSevereFirst(details: readonly FindingDetail[]): [string, FindingDetail[]][] {
  const worst = (group: readonly FindingDetail[]): Severity =>
    group.reduce<Severity>(
      (current, { finding }) =>
        compareSeverity(finding.severity, current) > 0 ? finding.severity : current,
      'note',
    );
  return groupByFile(details).sort(
    ([pathA, a], [pathB, b]) => compareSeverity(worst(b), worst(a)) || compareStrings(pathA, pathB),
  );
}
