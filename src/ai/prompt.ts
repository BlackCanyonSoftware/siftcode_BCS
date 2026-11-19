import type { Finding } from '../core/finding.js';
import type { RuleMeta } from '../rules/types.js';

/** What the model is told about its job: short, concrete, and never to repeat a secret. */
export const SYSTEM_PROMPT = [
  'You are a careful senior engineer reviewing one finding from a static analysis tool.',
  'Write a suggestion fitted to the code excerpt: what to change and why, in at most six sentences,',
  'then a short corrected code example if it helps. Use the names in the excerpt.',
  'The excerpt may hold the string "[redacted]" where a secret was removed: never guess or invent a secret.',
  'If the finding looks wrong for this code, say so and why. Plain text or Markdown only.',
].join(' ');

export interface PromptInput {
  readonly finding: Finding;
  readonly rule: RuleMeta | undefined;
  /** The excerpt, already numbered and redacted. */
  readonly excerpt: string;
  readonly language: string;
}

/** The user message for one finding: the rule's own explanation, the standards, and the code. */
export function buildPrompt({ finding, rule, excerpt, language }: PromptInput): string {
  const lines = [
    `Rule ${finding.ruleId}${rule ? `: ${rule.title}` : ''}`,
    `Finding: ${finding.message}`,
    `Location: ${finding.path}, line ${finding.startLine}${finding.endLine > finding.startLine ? ` to ${finding.endLine}` : ''}`,
  ];
  if (rule) {
    lines.push(
      `Why the rule exists: ${rule.rationale}`,
      `The rule's general advice: ${rule.suggestion.summary}`,
      `Standards: ${rule.standards.map((standard) => standard.id ?? standard.standard).join('; ')}`,
    );
  }
  lines.push('', `Code (${language}, with line numbers):`, '```', excerpt, '```');
  return lines.join('\n');
}
