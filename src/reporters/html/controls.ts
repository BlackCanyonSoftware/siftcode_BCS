import { compareStrings } from '../../core/compare.js';
import type { ScanResult } from '../../core/result.js';
import { SEVERITIES } from '../../core/severity.js';
import { countBySeverity, plural, withRules } from '../shared.js';
import { SEVERITY_STYLE, icon } from './components.js';
import { esc } from './escape.js';
import { PROJECT_WIDE, languageByPath } from './findings.js';

const unique = (values: readonly string[]): string[] =>
  [...new Set(values)].sort((a, b) => compareStrings(a, b));

function select(id: string, label: string, all: string, values: readonly string[]): string {
  const options = values.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`);
  return `<div class="field"><label class="label" for="${id}">${label}</label><select class="select" id="${id}"><option value="">${all}</option>${options.join('')}</select></div>`;
}

/** Search, filters, and the expand and collapse buttons. Nothing is shown when there are no findings. */
export function renderControls(result: ScanResult): string {
  if (result.findings.length === 0) {
    return '';
  }
  const details = withRules(result);
  const languages = languageByPath(result);
  const counts = countBySeverity(result.findings);
  const chips = SEVERITIES.filter((severity) => counts[severity] > 0)
    .map((severity) => {
      const style = SEVERITY_STYLE[severity];
      const glyph = style.icon === '' ? '' : icon(style.icon, 'sm');
      return `<button class="chip" type="button" aria-pressed="true" data-severity="${severity}">${glyph}${style.label}<span class="count">${counts[severity]}</span></button>`;
    })
    .join('');
  return `<div class="filters" role="search" aria-label="Filter the findings">
<div class="filter-row">
<div class="field"><label class="label" for="q">Search</label><div class="input-wrap">${icon('search')}<input class="input" id="q" type="search" placeholder="Path, rule, or message  ( / )" autocomplete="off"></div></div>
${select('f-category', 'Category', 'All categories', unique(details.map(({ rule }) => rule.category)))}
${select('f-language', 'Language', 'All languages', unique(details.map(({ finding }) => languages.get(finding.path) ?? PROJECT_WIDE)))}
${select('f-rule', 'Rule', 'All rules', unique(details.map(({ finding }) => finding.ruleId)))}
</div>
<div class="row" role="group" aria-label="Severity">${chips}<span class="grow"></span>
<button class="btn ghost sm" type="button" id="expand-all">Expand all</button>
<button class="btn ghost sm" type="button" id="collapse-all">Collapse all</button>
<button class="btn ghost sm" type="button" id="clear-filters">Clear filters</button>
</div>
<p class="small muted" id="result-count" role="status" data-total="${result.findings.length}">Showing ${esc(plural(result.findings.length, 'finding'))}</p>
</div>
<div class="empty" id="no-match" hidden>${icon('filter', 'lg')}<h3>No findings match these filters</h3><p>Try a different search, or clear the filters to see all ${result.findings.length} findings.</p></div>`;
}
