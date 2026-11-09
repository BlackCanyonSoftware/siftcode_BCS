import type { ScanResult } from '../core/result.js';
import {
  describeAccepted,
  describeCounts,
  describeProblem,
  filesMostSevereFirst,
  formatStandard,
  plural,
  withRules,
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
  const accepted = describeAccepted(result.accepted);
  if (accepted !== undefined) {
    lines.push('', `Accepted findings (not shown): ${accepted}`);
  }
  if (result.problems.length > 0) {
    lines.push('', `Files not checked: ${result.problems.length}`);
    for (const problem of result.problems) {
      lines.push(`  ${problem.path} ${describeProblem(problem.reason)}`);
    }
  }
  if (result.notes.length > 0) {
    lines.push('', 'Notes:', ...result.notes.map((note) => `  ${note}`));
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
