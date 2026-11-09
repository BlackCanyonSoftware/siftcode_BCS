import type { ScanResult } from '../../core/result.js';
import { SEVERITIES } from '../../core/severity.js';
import { compareStrings } from '../../core/compare.js';
import { countBySeverity, describeProblem, plural } from '../shared.js';
import { INFO_TEXT, SEVERITY_STYLE, icon, infoButton, infoPanel } from './components.js';
import { esc } from './escape.js';

/** The name of the scanned folder; the full path stays out of a file that gets shared. */
export function projectName(result: ScanResult): string {
  return (
    result.root
      .split(/[\\/]/)
      .filter((part) => part !== '')
      .pop() ?? 'project'
  );
}

export function renderHeading(result: ScanResult, version: string): string {
  const languages = result.byLanguage.map(([name, count]) => `${name} ${count}`).join(', ');
  const scanned = `${plural(result.filesScanned, 'file')}${languages === '' ? '' : ` (${languages})`}`;
  return `<div class="page-h"><div><h1>SiftCode report</h1><p>${esc(projectName(result))} · ${esc(scanned)} · SiftCode ${esc(version)}</p></div></div>`;
}

/** Banners for what could not be checked and what the scan skipped, above the findings. */
export function renderBanners(result: ScanResult): string {
  const banners: string[] = [];
  if (result.problems.length > 0) {
    const items = result.problems
      .map(
        (problem) =>
          `<li><span class="path-text">${esc(problem.path)}</span> ${esc(describeProblem(problem.reason))}</li>`,
      )
      .join('');
    banners.push(
      `<div class="alert warn">${icon('alert')}<div><strong>${plural(result.problems.length, 'file')} not checked</strong><span class="small">The scan went on without them, and no rule was run on them.</span><ul class="plain-list small">${items}</ul></div></div>`,
    );
  }
  if (result.notes.length > 0) {
    const items = result.notes.map((note) => `<li>${esc(note)}</li>`).join('');
    banners.push(
      `<div class="alert">${icon('info')}<div><strong>Notes</strong>${infoButton('info-notes', 'notes')}<ul class="plain-list small">${items}</ul></div></div>${infoPanel('info-notes', INFO_TEXT.notes)}`,
    );
  }
  return banners.join('\n');
}

export function renderSummary(result: ScanResult): string {
  const counts = countBySeverity(result.findings);
  const cards = SEVERITIES.map((severity) => {
    const style = SEVERITY_STYLE[severity];
    const glyph = style.icon === '' ? '' : icon(style.icon, 'sm');
    const zero = counts[severity] === 0 ? ' zero' : '';
    return `<div class="card card-b stat"><div class="eyebrow">${glyph}${style.label}</div><div class="n${zero}">${counts[severity]}</div></div>`;
  }).join('');
  const clean =
    result.findings.length === 0
      ? `<div class="alert ok" role="status">${icon('ok')}<div><strong>Clean</strong><span class="small">No findings in ${esc(plural(result.filesScanned, 'file'))}.</span></div></div>`
      : '';
  return `<section class="section" aria-labelledby="h-summary"><header><h2 id="h-summary">Summary</h2></header>
${clean}
<div class="row by-severity"><span class="label">By severity</span>${infoButton('info-severity', 'severity')}</div>
${infoPanel('info-severity', INFO_TEXT.severity)}
<div class="auto-grid">${cards}</div>
${renderHotspots(result)}
</section>`;
}

/** The top of the hotspot ranking, from `SC-HOT-001` findings whose message starts "Hotspot #N". */
function renderHotspots(result: ScanResult): string {
  const ranked = result.findings
    .filter((finding) => finding.ruleId === 'SC-HOT-001')
    .map((finding) => ({
      finding,
      rank: Number(/^Hotspot #(\d+)/.exec(finding.message)?.[1] ?? Number.MAX_SAFE_INTEGER),
    }))
    .sort((a, b) => a.rank - b.rank || compareStrings(a.finding.path, b.finding.path))
    .slice(0, 3);
  if (ranked.length === 0) {
    return '';
  }
  const items = ranked
    .map(
      ({ finding }) =>
        `<li><a class="path-text" href="#f-${finding.fingerprint}">${esc(finding.path)}</a><span class="small muted">${esc(finding.message)}</span></li>`,
    )
    .join('');
  return `<div class="card card-b hotspots"><div class="row"><span class="eyebrow">Top hotspots</span>${infoButton('info-hotspots', 'hotspots')}</div>${infoPanel('info-hotspots', INFO_TEXT.hotspots)}<ol class="plain-list">${items}</ol></div>`;
}
