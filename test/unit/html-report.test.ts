import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createBaseline } from '../../src/core/baseline.js';
import { scan } from '../../src/core/scan.js';
import { renderReport } from '../../src/reporters/index.js';
import { esc, safeUrl } from '../../src/reporters/html/escape.js';
import { longJsFunction, onlyRule, useProjects } from '../helpers/project.js';

const projects = useProjects();
const context = { version: '1.2.3' };
const config = onlyRule('SC-MET-001', { maxLines: 3 });

async function html(files: Record<string, string>, baselineFrom?: Record<string, string>) {
  const folder = await projects.create(files);
  const baseline = baselineFrom
    ? createBaseline((await scan(await projects.create(baselineFrom), { config })).findings)
    : undefined;
  const result = await scan(folder, { config, ...(baseline ? { baseline } : {}) });
  return renderReport('html', result, context);
}

/** The text of every inline `<script>` and the hashes the content policy allows. */
function scriptsAndPolicy(page: string) {
  const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? '');
  const policy = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(page)?.[1] ?? '';
  return { scripts, policy };
}

describe('HTML report (US-005)', () => {
  it('is one self-contained document with a landmark layout and a single h1', async () => {
    const page = await html({ 'a.js': longJsFunction('work', 6) });

    expect(page.startsWith('<!doctype html>\n<html lang="en">')).toBe(true);
    expect(page.match(/<h1[ >]/g)).toHaveLength(1);
    for (const tag of ['<header class="bk-header">', '<main ', '<footer class="bk-footer">']) {
      expect(page).toContain(tag);
    }
    expect(page).toContain('<title>SiftCode report:');
    expect(page).toContain('SiftCode 1.2.3');
  });

  it('embeds the brand stylesheets and fonts, and fetches nothing', async () => {
    const page = await html({ 'a.js': longJsFunction('work', 6) });

    expect(page).toContain('@font-face');
    expect(page).toContain('url("data:font/woff;base64,');
    expect(page).not.toMatch(/url\("\.\.\/font/);
    // every src and stylesheet link is a data URI; the only http links are plain anchors
    const sources = [...page.matchAll(/\s(?:src|srcset)="([^"]*)"/g)].map((m) => m[1] ?? '');
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((s) => s.startsWith('data:'))).toBe(true);
    expect(page).not.toMatch(/<link[^>]+rel="stylesheet"/);
    expect(page).not.toMatch(/<script[^>]+src=/);
  });

  it('allows exactly its own two scripts, by hash, and has no inline event handlers', async () => {
    const page = await html({ 'a.js': longJsFunction('work', 6) });

    const { scripts, policy } = scriptsAndPolicy(page);

    expect(scripts).toHaveLength(2);
    for (const script of scripts) {
      const hash = `'sha256-${createHash('sha256').update(script).digest('base64')}'`;
      expect(policy).toContain(hash);
    }
    expect(policy).toContain("default-src 'none'");
    expect(policy).not.toContain("script-src 'unsafe-inline'");
    expect(page).not.toMatch(/\son[a-z]+="/i);
  });

  it('shows each finding with severity as a word, its location, why, what to try, and standards', async () => {
    const page = await html({ 'a.js': longJsFunction('work', 6) });

    expect(page).toContain('class="acc finding sev-info"');
    expect(page).toContain('>Info</span>');
    expect(page).toContain('SC-MET-001');
    expect(page).toContain('Function &quot;work&quot; is 6 lines long (limit 3).');
    expect(page).toContain('Lines 1 to 6');
    expect(page).toContain('What to try.');
    expect(page).toContain('Refactoring (Fowler): Extract Function');
    expect(page).toContain('href="https://refactoring.com/catalog/extractFunction.html"');
    expect(page).toContain('rel="noopener noreferrer"');
  });

  it('puts the filters, the info buttons, and the theme toggle in the page', async () => {
    const page = await html({ 'a.js': longJsFunction('work', 6) });

    for (const id of ['q', 'f-category', 'f-language', 'f-rule', 'clear-filters', 'no-match']) {
      expect(page).toContain(`id="${id}"`);
    }
    expect(page).toContain('id="bk-theme"');
    expect(page).toContain('class="icon-btn plain info-btn"');
    // every aria-controls names an element that exists
    const controlled = [...page.matchAll(/aria-controls="([^"]+)"/g)].map((m) => m[1] ?? '');
    expect(controlled.length).toBeGreaterThan(0);
    for (const id of controlled) {
      expect(page).toContain(`id="${id}"`);
    }
  });

  it('shows a clean state, with no filters, when there are no findings', async () => {
    const page = await html({ 'a.js': 'export const a = 1;\n' });

    expect(page).toContain('<strong>Clean</strong>');
    expect(page).not.toContain('id="q"');
    expect(page).not.toContain('id="findings"');
  });

  it('lists accepted findings with how each was accepted, and the reason for a comment', async () => {
    const page = await html(
      {
        'a.js': `// siftcode-ignore SC-MET-001: legacy parser, see #42\n${longJsFunction('one', 6)}${longJsFunction('two', 6)}`,
      },
      { 'a.js': `${longJsFunction('one', 6)}${longJsFunction('two', 6)}` },
    );

    expect(page).toContain('id="accepted"');
    expect(page).toContain('2 accepted findings, not counted');
    expect(page).toContain('Comment on line 1');
    expect(page).toContain('legacy parser, see #42');
    expect(page).toContain('Listed in the baseline file');
  });

  it('says so when files were not checked and shows the scan notes', async () => {
    const page = await html({
      'good.js': `// siftcode-ignore SC-MET-999: not a rule\n${longJsFunction('work', 6)}`,
      'broken.py': 'def broken(:\n',
    });

    expect(page).toContain('1 file not checked');
    expect(page).toContain('broken.py');
    expect(page).toContain('has syntax errors, so it was not checked');
    expect(page).toContain('id="info-notes"');
    expect(page).toContain(
      'good.js:1: siftcode-ignore names SC-MET-999, which is not a SiftCode rule.',
    );
  });

  it('escapes everything that comes from the scanned code', async () => {
    const reason = '<img src=x onerror=alert(1)>';
    const page = await html({
      'a&b.js': `// siftcode-ignore SC-MET-001: ${reason}\n${longJsFunction('one', 6)}${longJsFunction('two', 6)}`,
    });

    expect(page).not.toContain(reason);
    expect(page).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(page).toContain('a&amp;b.js');
    expect(page).not.toContain('a&b.js');
  });

  it('keeps the absolute path of the scanned folder out of the file', async () => {
    const folder = await projects.create({ 'a.js': longJsFunction('work', 6) });
    const result = await scan(folder, { config });

    const page = renderReport('html', result, context);

    expect(page).not.toContain(folder);
    expect(page).not.toContain(folder.replaceAll('\\', '/'));
  });
});

describe('escaping helpers', () => {
  it('escapes the five characters that matter in HTML text and quoted attributes', () => {
    expect(esc(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });

  it.each([
    ['https://example.com/a?b=1', 'https://example.com/a?b=1'],
    ['http://example.com', 'http://example.com'],
    ['javascript:alert(1)', undefined],
    ['data:text/html,<b>x</b>', undefined],
    ['https://example.com/"onmouseover="x', undefined],
    ['//example.com', undefined],
  ])('safeUrl(%s)', (input, expected) => {
    expect(safeUrl(input)).toBe(expected);
  });
});
