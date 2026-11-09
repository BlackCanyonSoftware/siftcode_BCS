# SiftCode: Design

SiftCode has no app UI. Its user-facing surfaces are the **terminal output** and the **HTML report**. This file defines both. The brand is defined in the `Brand Logos` project (`brands/siftcode/brand.toml`) and is the single source for logo, color, and type. Never retype a brand color, size, or font name here or in code; load the brand tokens. Current brand facts (from the generated `BRAND.md`, brandkit 1.56.1, 2026-11-06): product brand "SiftCode", initials **SC**, a brass mark with a two-tone/display wordmark that arrives at teal across "Code", named in JetBrains Mono and read in Public Sans. The typeface has already changed once when the brand was rebuilt, so it is never written into code or CSS: the faces come from the brand's `template/fonts.css`.

**Design standard: IBM Carbon** (brandkit 1.56.0 onward; the brand is built to exactly this one standard and to no other, so no pattern is borrowed from Material, Ant, or Apple). Carbon owns the interface: corner radii, the type scale, control heights, spacing, elevation, motion, and how a control and the page shell look. The brand still owns colors, the mark, and the display face. What this means for the HTML report: square corners (only a tag, a toggle, and a circle are round); depth from background tone (page, then `layer-01`, `02`, `03`), not shadow, with a shadow only on what floats; regular-weight text in the productive type scale, no capitals, sentence-case labels; controls 32, 40, or 48 px high (40 by default); a selection is a tint with a stripe on its edge; a tag is a small pill; an inline notification has a stripe on its near edge. The report is built from the brand's `components.css` and `layout.css` classes, not from its own copies. A flat-looking screen is the standard, not a defect.

Brand files in this repo:
- `docs/brand/` holds the README set (`brandkit bundle siftcode docs/brand --set readme`): the light and dark README banners and `BUNDLE.json`. Verify with `brandkit check siftcode docs/brand --set readme`. Regenerate; never edit by hand.
- `assets/brand/` holds the application set (`brandkit bundle siftcode assets/brand`; verify with `brandkit check siftcode assets/brand`) that the HTML report is built from (Milestone 6, [ADR 0012](adr/0012-html-report.md)). The report takes its `@font-face` from `template/fonts.css` and embeds the `.woff` files as data URIs so it stays one self-contained file; no stylesheet or script names a font family or a color itself; the report's own additions are in `assets/report/report.css` and use brand tokens only. Re-run `brandkit bundle` and `brandkit check` whenever the brand is rebuilt, regenerate a sample report, and re-run the contrast check.
- The brand has no tagline or domain set yet; the README must not invent one.

## 1. Audience and tone

Developers and tech leads reading a report under time pressure. Tone: calm, specific, and constructive. Say what was found, why it matters, and what to try. Never shame, never exaggerate severity.

## 2. Terminal output

- Summary first (counts by severity, top hotspots), then findings grouped by file, most severe first.
- Each finding: `path:line  severity  rule-id  message` (the `path:line` first, so terminals and editors can open it), then an indented "Why" (one line), "Try" (one line), and one "Standard" line per reference. The full description with an example is `siftcode explain <rule-id>`.
- Color is decoration only: severity is always also written as a word. `NO_COLOR` and non-TTY output disable color and progress bars.
- No emoji needed to understand the output.
- Empty state: the "Scanned N files" summary with per-language counts, then "No findings.", plus any not-checked and skipped-file notes.
- Error state: what failed, the file or key involved, and how to fix it.

## 3. HTML report (self-contained, one file)

Built in Milestone 6 (`siftcode scan --format html`); the evidence and the decisions are in [ADR 0012](adr/0012-html-report.md). Where it departs from this section: there is no search in the header (the brand hides it below 1000 px, and the report needs it at every width), so search sits with the filters; filters are chips and selects; findings are native `<details>` rows; accepted findings (baseline or comment) are a table under the findings; two report-only color overrides exist because two brand pairs measured below 4.5:1.

### Layout
1. Header: the brand's header partial (mark on the `logo`-colored tile plus wordmark), project name, scan summary, light/dark toggle.
2. Summary strip: counts by severity, files scanned, languages, top hotspots.
3. Filters: severity, category, language, rule, search.
4. Findings list grouped by file; each row expands to rationale, suggestion, before/after, references.
5. Footer: tool version, config used, limits of syntax-only analysis.

### Required behaviors
- **Light/dark toggle** with a sun/moon icon. Defaults to the system preference (`prefers-color-scheme`), choice remembered in `localStorage`, with a safe fallback if storage is unavailable.
- **Info buttons (i):** long explanations (what a metric means, why a rule exists, how a threshold was chosen) are hidden behind an (i) button next to the label, so the main view stays uncluttered. Buttons are real `<button>` elements with an accessible name, toggle `aria-expanded`, open by keyboard (Enter/Space), and close with Escape.
- **States:** loading is not applicable (static file). Designed states: empty (no findings), filtered-to-nothing, very long paths and snippets (wrap or scroll inside the row), partial data (some files unparseable, shown in a banner).
- **Responsive:** checked at about 375, 768, and 1280 px or wider.
- **Accessibility (WCAG 2.2 AA):** semantic headings and landmarks, visible focus ring, contrast of at least 4.5:1 for text and 3:1 for UI components, no meaning by color alone, touch targets of at least 24 px (aim for 44), `prefers-reduced-motion` respected, no remote assets.
- **Security:** all code-derived text is escaped; no inline event handlers from data; no remote scripts.

## 4. Design tokens

Tokens come from the brand's `template/tokens.css` and `theme/theme.css` (light and dark, contrast-measured by `brandkit doctor`). The report uses them by name and adds only the few report-specific tokens below.

| Group | Source | Tokens |
|---|---|---|
| Color roles | brand | `--ink`, `--accent`, `--mute`, `--logo`, `--brand`, `--page`, `--card`, `--line`, `--control`, `--on-brand` |
| Status colors | brand | `--bad`/`--bad-bg`, `--warn`/`--warn-bg`, `--ok`/`--ok-bg`, `--on-bad` |
| Type | brand | the brand's face via `--font`, `--font-display`, `--mono` (loaded from `template/fonts.css`, never a hand-written `font-family`); sizes `--fs-xs` to `--fs-3xl` |
| Spacing | brand (Carbon scale) | `--s-1` to `--s-8` |
| Radius | brand (Carbon: square) | `--r-sm`, `--r-md`, `--r-lg` (none), `--r-pill` (tags and toggles only) |
| Control height | brand (Carbon) | `--control-h-sm`, `--control-h`, `--control-h-lg` |
| Elevation | brand (Carbon) | `--shadow-1` to `--shadow-3`, used only for what floats (a menu, a toast); layers are background tones |
| Motion, breakpoints | brand (Carbon) | `--t-fast` for a state change, `--t-med` for movement, `--ease` (and `--ease-entrance`, `--ease-exit`); breakpoints from the brand's `layout.css`; none under reduced motion |

**Severity mapping (report-specific, built from brand roles):**

| Severity | Color role | Distinguished by |
|---|---|---|
| error | `--bad` | word "Error", error icon, heavier edge |
| warning | `--warn` | word "Warning", alert icon, lighter edge. The brand deliberately gives warning and error the same red, so the icon, the word, and the edge weight carry the difference. |
| info | `--accent` | word "Info", info icon |
| note | `--mute` | word "Note", no icon fill |
| no findings / pass | `--ok` | word "Clean", check icon |

Icons come from the brand's UI set (`icon-error`, `icon-alert`, `icon-info`, `icon-ok`, `icon-sun`, `icon-moon`, `icon-help`, `icon-search`, `icon-filter`, `icon-expand`, `icon-collapse`), inlined into the single-file report.

## 5. Components (HTML report)

| Component | States |
|---|---|
| Theme toggle | light, dark; focus; pressed |
| Info button + popover | closed, open, focus |
| Severity badge | error, warning, info, note |
| Summary card | normal, zero |
| Filter bar | default, active filters, no results |
| Finding row | collapsed, expanded, focus, suppressed/baselined |
| Code block (before/after) | normal, long line (scrolls), copy button (success/failure) |
| Banner | parse failures, hotspot skipped (not a Git repo) |

## 6. Key flows

1. Developer runs a scan, reads the terminal summary, runs `explain` on an unfamiliar rule.
2. Reviewer opens the HTML report, filters to errors, expands a finding, reads the suggestion, copies the "after" snippet.
3. CI uploads SARIF; findings appear as annotations in the pull request.

## 7. Writing guidelines

- A finding message states the fact ("Function `parse` has cyclomatic complexity 17 (limit 10)"). The suggestion states one action ("Extract the branches that validate input into separate functions").
- One term per concept, matching the PRD glossary (finding, rule, suggestion, hotspot).
- Reference standards by name and number; link out instead of quoting.
- Dates, numbers, and sizes formatted with `Intl`.
- Heuristic rules say so ("likely", "may") and show their confidence.
