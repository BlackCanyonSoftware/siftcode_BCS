import { readFileSync } from 'node:fs';

/** `assets/` at the package root; `src/reporters/html` and `dist/reporters/html` are equally deep. */
const ASSETS = new URL('../../../assets/', import.meta.url);

/** Text with LF line endings, so a hash of it is the same wherever the package was installed. */
function text(path: string): string {
  return readFileSync(new URL(path, ASSETS), 'utf8').replace(/\r\n/g, '\n');
}

function dataUri(path: string, mime: string): string {
  return `data:${mime};base64,${readFileSync(new URL(path, ASSETS)).toString('base64')}`;
}

const withoutComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '').trim();

/** The brand's `@font-face` rules, with each font file embedded so the report is one file. */
function fontsCss(): string {
  return text('brand/template/fonts.css').replace(
    /url\("\.\.\/font\/([\w.-]+)"\)/g,
    (_match, file: string) => `url("${dataUri(`brand/font/${file}`, 'font/woff')}")`,
  );
}

/**
 * Sets the saved theme before the page is painted, so a reader who chose dark does not see a light
 * flash. The key is the one the brand's own theme switch uses.
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}}catch(e){}`;

/** The brand's footer carries the legal line; take it from there so it follows the brand. */
function legalLine(): string {
  return /<span>([\s\S]*?)<\/span>/.exec(text('brand/template/footer.html'))?.[1]?.trim() ?? '';
}

export interface ReportAssets {
  /** Theme, fonts, tokens, base, components, layout, and the report's own rules, in the brand's order. */
  readonly css: string;
  readonly script: string;
  readonly themeScript: string;
  /** The brand's icon sprite (`<svg>` with a `<symbol>` per icon). */
  readonly sprite: string;
  readonly mark: string;
  readonly wordmarkLight: string;
  readonly wordmarkDark: string;
  readonly favicon: string;
  /** HTML of the brand's copyright line. */
  readonly legal: string;
}

let cached: ReportAssets | undefined;

/**
 * Reads the brand set (`assets/brand`, from `brandkit bundle`) and the report's own stylesheet and
 * script once. Stylesheets load in the order the brand's guide gives: theme, fonts, tokens, base,
 * components, layout. No stylesheet or script here names a color or a font.
 */
export function loadReportAssets(): ReportAssets {
  cached ??= {
    css: [
      withoutComments(text('brand/theme/theme.css')),
      withoutComments(fontsCss()),
      ...['tokens', 'base', 'components', 'layout'].map((name) =>
        withoutComments(text(`brand/template/${name}.css`)),
      ),
      withoutComments(text('report/report.css')),
    ].join('\n'),
    script: text('report/report.js'),
    themeScript: THEME_SCRIPT,
    sprite: text('brand/ui/icons.svg').trim(),
    mark: dataUri('brand/mark/mark.svg', 'image/svg+xml'),
    wordmarkLight: dataUri('brand/wordmark/wordmark-light.svg', 'image/svg+xml'),
    wordmarkDark: dataUri('brand/wordmark/wordmark-dark.svg', 'image/svg+xml'),
    favicon: dataUri('brand/web/icon.svg', 'image/svg+xml'),
    legal: legalLine(),
  };
  return cached;
}
