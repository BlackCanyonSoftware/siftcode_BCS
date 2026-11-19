# ADR 0016: Accessibility rules for JSX

- Status: accepted
- Date: 2026-11-18

## Context

The roadmap's "Frontend" track named WCAG checks in JSX and HTML. SiftCode reads syntax only, so it can find the failures that are certain from markup alone, and nothing that needs the rendered page. The HTML report already passes an axe run in a browser (ADR 0012); this is the same concern for the projects SiftCode scans, at the level a static tool reaches.

## Decisions

### What is read, and what is not

A new syntax fact, `ElementFact`, lists every JSX element of a JavaScript, TypeScript, or TSX file: the tag, each attribute and how it is given (none, a string, a number, an expression), whether `{...props}` is spread in, whether the element has text, expressions, or child elements, and the tags it sits inside. It reaches no report. HTML files, Vue, and Svelte are not read: HTML would be a new language and a new grammar, which changes the stack and was not asked for.

An element that spreads props is skipped, because the attribute that is "missing" may be in the spread. Components (`<Button>`, `<TextField>`) are skipped, because their markup is somewhere else; only the DOM elements are judged. Test files, Storybook stories, and vendored code are left alone.

### The six rules

All are `warning` and carry the WCAG 2.2 success criterion they fail. They stay with failures that markup shows for certain, and leave the rest to a browser check.

| Rule | Reports | WCAG | Confidence |
|---|---|---|---|
| `SC-WEB-001` | `<img>`, `<input type="image">`, and `next/image`'s `Image` with no `alt` (an empty `alt=""` is correct for decoration) | 1.1.1 | high |
| `SC-WEB-002` | `onClick` on a `div`, `span`, `li`, and similar, with no role, or with an operable role but no `tabIndex` or no key handler | 2.1.1, 4.1.2 | medium |
| `SC-WEB-003` | `tabIndex` above 0 | 2.4.3 | high |
| `SC-WEB-004` | `<input>`, `<select>`, `<textarea>` with no `aria-label`, `aria-labelledby`, `title`, wrapping `<label>`, or `<label htmlFor>` naming its id | 3.3.2, 1.3.1, 4.1.2 | medium |
| `SC-WEB-005` | `<button>` or `<a href>` with nothing inside and no `aria-label`, `aria-labelledby`, or `title` | 4.1.2, 2.4.4 | high |
| `SC-WEB-006` | `<html>` with no `lang` | 3.1.1 | high |

`SC-WEB-002` and `SC-WEB-004` are the two that depend on judgment: the first cannot tell a control from a convenience, the second cannot see a label in another file, so they are `medium`.

## Evidence

Scanned and every finding read against its source: vercel/commerce (a Next.js storefront), Excalidraw (a large React application), and Mastodon's front end (`app/javascript`, 890 files; the project uses `jsx-a11y` and marks its known exceptions with `eslint-disable` comments).

| Project | Findings | What they are |
|---|---|---|
| Vercel Commerce | 4 | Two search inputs with a placeholder and no label; two `div`s with `onClick` that make a custom dropdown. All real. |
| Excalidraw | 22 | Text fields with only a placeholder (`QuickSearch`, `Hyperlink`), `li` menu items and `div` buttons with `onClick` and no role, one empty `<button tabIndex={-1}>`. Real, with a few wrappers where a mouse shortcut is meant (a header click). |
| Mastodon | 16 | `div role="button"` with `tabIndex` but no key handler, a search box with only a placeholder, a `<select>` with no label, `div`s with `onClick`; a few are the modal-backdrop and whole-row-click kind, and three carry an `eslint-disable` comment for `jsx-a11y`. |

The first pass gave 46 findings. Reading them found four false-positive classes, each now left out and covered by a test:

- **An empty element with `onClick`** (Excalidraw's `<div className="Modal__background" onClick={close} />`): an overlay that closes a dialog when clicked, with nothing in it to operate. 1 removed.
- **A wrapper whose click only calls `.focus()`** on the field inside it (Excalidraw's `TextField`): the field has its own keyboard support. 1 removed.
- **A `hidden` file input** opened from a button (Mastodon's upload and compose footer). 2 removed.
- **The wording**: "has an onClick handler, but it has role="button" but no tabIndex" read badly; the messages now say which of the role, `tabIndex`, and key handler is missing.

Left as findings, and named here so they are not mistaken for defects of the rule: a header or a whole row that takes a click as a mouse shortcut (Mastodon's `column_header`, `notification_request`) and a modal wrapper that closes on a click on its background. The rule reports them as it would any other element, because syntax cannot tell a shortcut from the only way to do something. `jsx-a11y` reports the same kind of site, and three of these in Mastodon carry an `eslint-disable` comment for it.

Zero results for `SC-WEB-001`, `003`, and `006` across the three projects are correct: all of their images have `alt` (multi-line `<img>` tags were checked), no `tabIndex` is above 0, and the one `<html>` has `lang`.

Test and story files that did not parse (Excalidraw's `*.test.tsx`, `setupTests.ts`, one Mastodon story) are reported as not checked, as always (TD-9).

## Consequences

- Six rules, 54 in all, and a new category (`accessibility`) in `explain`, the reports, and the config. No flag or setting: a project without JSX sees nothing.
- The rules complement a browser check (axe, as in `test/browser`); they find some failures earlier and cannot see contrast, layout, focus order beyond `tabIndex`, headings, or landmarks (TD-31).
- `FileFacts.elements` is new; `FileUsage` and every report are unchanged.
