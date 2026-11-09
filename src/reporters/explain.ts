import { compareStrings } from '../core/compare.js';
import type { RuleDefinition } from '../rules/types.js';
import { formatStandard } from './shared.js';

/** The long description of one rule, shown by `siftcode explain <rule-id>`. */
export function renderExplanation(definition: RuleDefinition): string {
  const rule = definition.meta;
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
  lines.push('', ...settingsLines(definition), '', ...acceptingLines(definition));
  return `${lines.join('\n')}\n`;
}

/** `{ "maxLines": 50, "top": 10 }` */
function inlineObject(values: Readonly<Record<string, unknown>>): string {
  const entries = Object.entries(values).map(
    ([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`,
  );
  return `{ ${entries.join(', ')} }`;
}

/** How to change the rule in `siftcode.config.json`, with its default options when it has any. */
function settingsLines({ meta, defaultOptions }: RuleDefinition): string[] {
  const defaults =
    Object.keys(defaultOptions).length > 0
      ? ['  Defaults:', `    "${meta.id}": { "options": ${inlineObject(defaultOptions)} }`]
      : ['  This rule has no options.'];
  return [
    'Settings (in siftcode.config.json, under "rules")',
    ...defaults,
    '  Change how serious it is, or switch it off:',
    `    "${meta.id}": { "severity": "warning" }`,
    `    "${meta.id}": { "enabled": false }`,
  ];
}

/** The ways to accept a finding, as they apply to this rule. */
function acceptingLines(definition: RuleDefinition): string[] {
  const { meta } = definition;
  const baseline = '  For everything the rule reports today: siftcode baseline <path>';
  if (definition.configureRepo !== undefined) {
    return [
      'Accepting a finding',
      '  This rule looks at the project as a whole, so a finding has no line to put a comment on.',
      baseline,
    ];
  }
  return [
    'Accepting a finding',
    '  For one finding, with the reason, on its line or the line above it:',
    `    // siftcode-ignore ${meta.id}: <your reason>`,
    `    # siftcode-ignore ${meta.id}: <your reason>`,
    baseline,
  ];
}

function indent(code: string): string[] {
  return code.split('\n').map((line) => `    ${line}`);
}

/** Every rule, by category, for `siftcode explain` with no rule id. */
export function renderRuleList(rules: readonly RuleDefinition[]): string {
  const byCategory = new Map<string, RuleDefinition[]>();
  for (const rule of rules) {
    byCategory.set(rule.meta.category, [...(byCategory.get(rule.meta.category) ?? []), rule]);
  }
  const width = Math.max(...rules.map((rule) => rule.meta.defaultSeverity.length));
  const lines = [
    `Rules (${rules.length}). Run "siftcode explain <rule-id>" for the reasons, standards, and settings of one.`,
  ];
  for (const [category, group] of [...byCategory].sort(([a], [b]) => compareStrings(a, b))) {
    lines.push('', category);
    for (const { meta } of [...group].sort((a, b) => compareStrings(a.meta.id, b.meta.id))) {
      lines.push(`  ${meta.id}  ${meta.defaultSeverity.padEnd(width)}  ${meta.title}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
