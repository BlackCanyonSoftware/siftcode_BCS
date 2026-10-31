import type { RuleMeta } from '../rules/types.js';
import { formatStandard } from './shared.js';

/** The long description of one rule, shown by `siftcode explain <rule-id>`. */
export function renderExplanation(rule: RuleMeta): string {
  const lines = [
    `${rule.id}  ${rule.title}`,
    '',
    `Category:         ${rule.category}`,
    `Default severity: ${rule.defaultSeverity}`,
    `Confidence:       ${rule.confidence}${rule.heuristic ? ' (heuristic: a judgment call, not a fact)' : ''}`,
    '',
    'Why it matters',
    `  ${rule.rationale}`,
    '',
    'What to do',
    `  ${rule.suggestion.summary}`,
  ];
  if (rule.suggestion.before !== undefined && rule.suggestion.after !== undefined) {
    lines.push(
      '',
      'Before',
      ...indent(rule.suggestion.before),
      '',
      'After',
      ...indent(rule.suggestion.after),
    );
  }
  if (rule.standards.length > 0) {
    lines.push('', 'Standards', ...rule.standards.map((s) => `  ${formatStandard(s)}`));
  }
  return `${lines.join('\n')}\n`;
}

function indent(code: string): string[] {
  return code.split('\n').map((line) => `    ${line}`);
}
