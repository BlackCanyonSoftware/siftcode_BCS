import { createHash } from 'node:crypto';
import type { AcceptedFinding } from '../../core/finding.js';
import type { ScanResult } from '../../core/result.js';
import type { ReportContext } from '../shared.js';
import { plural } from '../shared.js';
import { loadReportAssets, type ReportAssets } from './assets.js';
import { renderControls } from './controls.js';
import { INFO_TEXT, displayPath, icon, infoButton, infoPanel } from './components.js';
import { esc } from './escape.js';
import { renderFindings } from './findings.js';
import { projectName, renderBanners, renderHeading, renderSummary } from './summary.js';

const sha256 = (text: string): string =>
  `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

/**
 * A strict content policy: nothing is fetched, only the two scripts below run (matched by hash, so
 * markup injected through a file name or a message cannot add a third), and images and fonts are
 * only the data URIs that are in the file.
 */
function contentPolicy(assets: ReportAssets): string {
  return [
    "default-src 'none'",
    `script-src ${sha256(assets.themeScript)} ${sha256(assets.script)}`,
    "style-src 'unsafe-inline'",
    'img-src data:',
    'font-src data:',
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/**
 * A self-contained HTML report: one file with its styles, fonts, icons, and script inside, built on
 * the brand's IBM Carbon stylesheets. Like the JSON report it holds no timestamps and no absolute
 * paths, so the same scan always gives the same file.
 */
export function renderHtml(result: ScanResult, context: ReportContext): string {
  const assets = loadReportAssets();
  const title = `SiftCode report: ${projectName(result)}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${contentPolicy(assets)}">
<meta name="color-scheme" content="light dark">
<title>${esc(title)}</title>
<link rel="icon" href="${assets.favicon}" type="image/svg+xml">
<script>${assets.themeScript}</script>
<style>${assets.css}</style>
</head>
<body id="top">
<a class="skip btn primary" href="#main">Skip to the report</a>
${assets.sprite}
${renderHeader(assets)}
<main class="content" id="main">
${renderHeading(result, context.version)}
${renderBanners(result)}
${renderSummary(result)}
${renderFindingsSection(result)}
${renderAccepted(result)}
${renderAbout(result, context)}
</main>
${renderFooter(assets, context)}
<div class="sr-only" id="announce" role="status" aria-live="polite"></div>
<script>${assets.script}</script>
</body>
</html>
`;
}

function renderHeader(assets: ReportAssets): string {
  return `<header class="bk-header">
<a class="bk-brand" href="#top">
<img src="${assets.mark}" alt="" width="34" height="34" class="bk-mark">
<img src="${assets.wordmarkLight}" alt="SiftCode" width="180" height="34" class="bk-only-light">
<img src="${assets.wordmarkDark}" alt="SiftCode" width="180" height="34" class="bk-only-dark">
</a>
<div class="bk-actions">
<button class="icon-btn" id="bk-theme" type="button" aria-pressed="false" aria-label="Switch to a dark background"><svg class="icon lg" aria-hidden="true" focusable="false"><use class="bk-only-light" href="#i-moon"></use><use class="bk-only-dark" href="#i-sun"></use></svg></button>
</div>
</header>`;
}

function renderFindingsSection(result: ScanResult): string {
  if (result.findings.length === 0) {
    return '';
  }
  return `<section class="section" aria-labelledby="h-findings"><header><h2 id="h-findings">Findings</h2><p>Grouped by file, the most severe first. Open a finding for why it matters and what to try.</p></header>
${renderControls(result)}
${renderFindings(result)}
</section>`;
}

function acceptedRow({ finding, via }: AcceptedFinding): string {
  const how =
    via.kind === 'baseline'
      ? ['Baseline', 'Listed in the baseline file']
      : [`Comment on line ${via.line}`, via.reason];
  const location =
    finding.path === '.' ? displayPath(finding.path) : `${finding.path}:${finding.startLine}`;
  return `<tr><td><span class="rule">${esc(finding.ruleId)}</span></td><td><span class="path-text">${esc(location)}</span></td><td>${esc(how[0] ?? '')}</td><td>${esc(how[1] ?? '')}</td></tr>`;
}

function renderAccepted(result: ScanResult): string {
  if (result.accepted.length === 0) {
    return '';
  }
  const rows = result.accepted.map(acceptedRow).join('');
  return `<section class="section" id="accepted" aria-labelledby="h-accepted"><header><div class="row"><h2 id="h-accepted">Accepted findings</h2>${infoButton('info-accepted', 'accepted findings')}</div>${infoPanel('info-accepted', INFO_TEXT.accepted)}</header>
<details class="acc"><summary>${esc(plural(result.accepted.length, 'accepted finding'))}, not counted${icon('expand')}</summary><div class="acc-b"><div class="table-wrap"><table><caption class="sr-only">Accepted findings and how each was accepted</caption><thead><tr><th scope="col">Rule</th><th scope="col">Location</th><th scope="col">Accepted by</th><th scope="col">Reason</th></tr></thead><tbody>${rows}</tbody></table></div></div></details>
</section>`;
}

function renderAbout(result: ScanResult, context: ReportContext): string {
  const { unsupported, tooLarge, symlinks } = result.skipped;
  const rules = result.rules
    .map((rule) => `<li><span class="rule">${esc(rule.id)}</span> ${esc(rule.title)}</li>`)
    .join('');
  return `<section class="section" aria-labelledby="h-about"><header><h2 id="h-about">About this report</h2></header>
<p class="small">SiftCode ${esc(context.version)} read the syntax of the code and never ran it. It has no type information, so some findings are judgment calls; each one shows how sure its rule is. Skipped: ${unsupported} unsupported, ${tooLarge} too large, ${symlinks} symbolic links.</p>
<details class="acc"><summary>${esc(plural(result.rules.length, 'rule'))} ran${icon('expand')}</summary><div class="acc-b"><ul class="plain-list small">${rules}</ul></div></details>
</section>`;
}

function renderFooter(assets: ReportAssets, context: ReportContext): string {
  return `<footer class="bk-footer"><p class="bk-small"><span>${assets.legal}</span><span>SiftCode ${esc(context.version)}</span></p><img src="${assets.mark}" alt="" width="28" height="28" class="bk-footmark"></footer>`;
}
