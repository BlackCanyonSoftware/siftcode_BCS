import type { Severity } from '../../core/severity.js';
import type { Confidence } from '../../rules/types.js';
import { esc } from './escape.js';

/** Findings about the project as a whole (a missing license) are anchored at `.`; say what that means. */
export function displayPath(path: string): string {
  return path === '.' ? 'Whole project' : path;
}

/** An icon from the brand's sprite. Decorative: the words beside it carry the meaning. */
export function icon(name: string, size: 'sm' | 'lg' | '' = ''): string {
  const className = size === '' ? 'icon' : `icon ${size}`;
  return `<svg class="${className}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
}

/** The (i) button that opens the panel with the same `id`. */
export function infoButton(id: string, about: string): string {
  return `<button class="icon-btn plain info-btn" type="button" aria-expanded="false" aria-controls="${id}" aria-label="About ${esc(about)}">${icon('info', 'sm')}</button>`;
}

/** The text an (i) button reveals; hidden until the button is pressed. */
export function infoPanel(id: string, html: string): string {
  return `<div class="alert info-panel" id="${id}" hidden>${icon('info')}<div class="small">${html}</div></div>`;
}

interface SeverityStyle {
  readonly label: string;
  /** Brand badge variant. */
  readonly tone: string;
  /** Icon name; `note` has none, as the design says. */
  readonly icon: string;
}

export const SEVERITY_STYLE: Readonly<Record<Severity, SeverityStyle>> = {
  error: { label: 'Error', tone: ' bad', icon: 'error' },
  warning: { label: 'Warning', tone: ' warn', icon: 'alert' },
  info: { label: 'Info', tone: ' brand', icon: 'info' },
  note: { label: 'Note', tone: '', icon: '' },
};

/** Severity as a word and an icon, never as color alone. */
export function severityBadge(severity: Severity): string {
  const style = SEVERITY_STYLE[severity];
  const glyph = style.icon === '' ? '' : icon(style.icon, 'sm');
  return `<span class="badge${style.tone}">${glyph}${style.label}</span>`;
}

/** A code example with a button that copies it. */
export function codeBlock(label: string, code: string): string {
  return `<figure class="code"><figcaption>${esc(label)}</figcaption><pre><code>${esc(code)}</code></pre><button class="btn ghost sm copy" type="button" aria-label="Copy the ${esc(label.toLowerCase())} example">${icon('file', 'sm')}<span>Copy</span></button></figure>`;
}

export const CONFIDENCE_TEXT: Readonly<Record<Confidence, string>> = {
  high: 'High confidence: the rule checks something exact, so a finding is very likely real.',
  medium:
    'Medium confidence: the rule looks for a pattern that is usually, but not always, a real problem.',
  low: 'Low confidence: a judgment call from a heuristic. Treat it as a prompt to take a look, not a verdict.',
};

export const INFO_TEXT = {
  severity:
    'Severity ranks findings by how much attention they deserve, from most to least: error, warning, info, note. <code>--fail-on</code> uses the same order. A rule that works from a heuristic reports a lower severity and says how sure it is.',
  accepted:
    'Findings the team has decided to live with are listed here and never fail a scan. They are accepted either by a <code>siftcode-ignore</code> comment in the code, which carries a reason, or by the baseline file.',
  hotspots:
    'A hotspot is a file that is both complex and changed often. Its score is the number of commits that changed it in the scan window (12 months by default) times its total cyclomatic complexity. Code like this is where defects and delays collect. It needs a Git repository, and merge and bulk-reformat commits are left out.',
  notes:
    'Notes say what the scan could not check and why, for example that Git history was not available. They are not findings and never fail a scan.',
} as const;
