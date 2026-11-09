import type { RuleMeta, StandardRef } from '../../rules/types.js';
import { filesMostSevereFirst, withRules, type FindingDetail } from '../shared.js';
import type { ScanResult } from '../../core/result.js';
import {
  CONFIDENCE_TEXT,
  codeBlock,
  displayPath,
  icon,
  infoButton,
  infoPanel,
  severityBadge,
} from './components.js';
import { esc, safeUrl } from './escape.js';

/** Findings that belong to the project as a whole (a missing license) have no file language. */
export const PROJECT_WIDE = 'Project-wide';

/** The language of each parsed file, by path. */
export function languageByPath(result: ScanResult): Map<string, string> {
  return new Map(result.files.map((file) => [file.path, file.language]));
}

/** The findings, grouped by file with the most severe file first. */
export function renderFindings(result: ScanResult): string {
  const languages = languageByPath(result);
  const groups = filesMostSevereFirst(withRules(result)).map(([path, details]) => {
    const rows = details
      .map((detail) => renderFinding(detail, languages.get(path) ?? PROJECT_WIDE))
      .join('\n');
    return `<section class="file-group" aria-label="Findings in ${esc(displayPath(path))}"><h3 class="path">${esc(displayPath(path))}</h3>${rows}</section>`;
  });
  return `<div id="findings">${groups.join('\n')}</div>`;
}

function renderFinding({ finding, rule }: FindingDetail, language: string): string {
  const id = `f-${finding.fingerprint}`;
  const search = `${finding.path} ${finding.ruleId} ${rule.title} ${finding.message}`.toLowerCase();
  const attributes = [
    `id="${id}"`,
    `class="acc finding sev-${finding.severity}"`,
    `data-severity="${finding.severity}"`,
    `data-category="${esc(rule.category)}"`,
    `data-language="${esc(language)}"`,
    `data-rule="${esc(finding.ruleId)}"`,
    `data-search="${esc(search)}"`,
  ].join(' ');
  const lines =
    finding.endLine > finding.startLine
      ? `Lines ${finding.startLine} to ${finding.endLine}`
      : `Line ${finding.startLine}`;
  return `<details ${attributes}>
<summary>${severityBadge(finding.severity)}<span class="rule">${esc(finding.ruleId)}</span><span class="msg">${esc(finding.message)}</span><span class="loc">${lines}</span>${icon('expand')}</summary>
<div class="acc-b finding-body">${renderBody(id, rule)}</div>
</details>`;
}

function renderBody(id: string, rule: RuleMeta): string {
  const { suggestion } = rule;
  const examples =
    suggestion.before !== undefined && suggestion.after !== undefined
      ? codeBlock('Before', suggestion.before) + codeBlock('After', suggestion.after)
      : '';
  return [
    `<p><strong>${esc(rule.title)}.</strong> ${esc(rule.rationale)}</p>`,
    `<p><strong>What to try.</strong> ${esc(suggestion.summary)}</p>`,
    examples,
    renderMeta(id, rule),
    renderStandards(rule.standards),
  ].join('');
}

/** Category and confidence, with an (i) button that explains the confidence level. */
function renderMeta(id: string, rule: RuleMeta): string {
  const panel = `${id}-confidence`;
  const heuristic = rule.heuristic ? ' This rule is a heuristic: a judgment call, not a fact.' : '';
  return `<p class="meta small"><span>Category: ${esc(rule.category)}</span><span>Confidence: ${rule.confidence}${infoButton(panel, 'confidence')}</span></p>${infoPanel(panel, esc(CONFIDENCE_TEXT[rule.confidence] + heuristic))}`;
}

function renderStandards(standards: readonly StandardRef[]): string {
  if (standards.length === 0) {
    return '';
  }
  return `<h4 class="small">Standards</h4><ul class="standards">${standards.map(standardItem).join('')}</ul>`;
}

function standardItem(ref: StandardRef): string {
  const name = ref.id === undefined ? ref.standard : `${ref.standard}: ${ref.id}`;
  const url = ref.url === undefined ? undefined : safeUrl(ref.url);
  return url === undefined
    ? `<li>${esc(name)}</li>`
    : `<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(name)}<span class="sr-only"> (opens in a new tab)</span></a></li>`;
}
