import type { ScanResult } from '../core/result.js';
import {
  describeAccepted,
  describeCounts,
  describeProblem,
  formatStandard,
  groupByFile,
  plural,
  withRules,
  type FindingDetail,
} from './shared.js';

/** Escapes characters that Markdown would otherwise interpret inside running text. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]<>()#+!|~]/g, '\\$&');
}

/** Wraps text in a code span, using a fence long enough that backticks inside cannot end it. */
function codeSpan(text: string): string {
  const fence = text.includes('`') ? '``' : '`';
  return `${fence}${text}${fence}`;
}

/** A report suited to pasting into a pull request, an issue, or a wiki. */
export function renderMarkdown(result: ScanResult): string {
  const languages = result.byLanguage.map(([name, count]) => `${name} ${count}`).join(', ');
  const lines = [
    '# SiftCode report',
    '',
    `- **Scanned:** ${plural(result.filesScanned, 'file')}${languages === '' ? '' : ` (${escapeMarkdown(languages)})`}`,
    `- **Findings:** ${result.findings.length} (${describeCounts(result.findings)})`,
    ...acceptedBullet(result),
    '',
    '## Findings',
    '',
  ];

  if (result.findings.length === 0) {
    lines.push('No findings.', '');
  }
  for (const [path, details] of groupByFile(withRules(result))) {
    lines.push(`### ${codeSpan(path)}`, '');
    for (const detail of details) {
      lines.push(...findingSection(detail));
    }
  }

  if (result.problems.length > 0) {
    lines.push('## Files not checked', '');
    for (const problem of result.problems) {
      lines.push(`- ${codeSpan(problem.path)} ${describeProblem(problem.reason)}`);
    }
    lines.push('');
  }
  if (result.notes.length > 0) {
    lines.push('## Notes', '', ...result.notes.map((note) => `- ${escapeMarkdown(note)}`), '');
  }
  const { unsupported, tooLarge, symlinks } = result.skipped;
  lines.push(
    `_Skipped: ${unsupported} unsupported, ${tooLarge} too large, ${symlinks} symbolic links._`,
  );
  return `${lines.join('\n')}\n`;
}

function acceptedBullet(result: ScanResult): string[] {
  const accepted = describeAccepted(result.accepted);
  return accepted === undefined ? [] : [`- **Accepted (not shown):** ${escapeMarkdown(accepted)}`];
}

function findingSection({ finding, rule }: FindingDetail): string[] {
  const lines = [
    `#### ${finding.severity} · ${finding.ruleId} · line ${finding.startLine}`,
    '',
    escapeMarkdown(finding.message),
    '',
    `**Why:** ${escapeMarkdown(rule.rationale)}`,
    '',
    `**Try:** ${escapeMarkdown(rule.suggestion.summary)}`,
    '',
  ];
  if (rule.suggestion.before !== undefined && rule.suggestion.after !== undefined) {
    lines.push('Before:', '', '```', rule.suggestion.before, '```', '', 'After:', '', '```');
    lines.push(rule.suggestion.after, '```', '');
  }
  if (rule.standards.length > 0) {
    lines.push(
      `**Standards:** ${rule.standards.map((s) => escapeMarkdown(formatStandard(s))).join('; ')}`,
      '',
    );
  }
  return lines;
}
