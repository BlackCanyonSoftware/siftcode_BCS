import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import axe from 'axe-core';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBaseline } from '../../src/core/baseline.js';
import { scan } from '../../src/core/scan.js';
import { renderReport } from '../../src/reporters/index.js';
import { longJsFunction, onlyRule, useProjects } from '../helpers/project.js';

// Opens the real HTML report in a real browser (US-005, ADR 0012). `npm run test:browser` runs it;
// it is not part of `npm test` because it needs an installed Chrome or Edge. A missing browser is a
// failure, not a skip: a check that quietly does nothing is worse than none.

const WIDTHS = [375, 768, 1280] as const;
const THEMES = ['light', 'dark'] as const;
const RULES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const projects = useProjects();

async function launch(): Promise<Browser> {
  const path = process.env.SIFTCODE_BROWSER;
  if (path) {
    return chromium.launch({ executablePath: path });
  }
  const problems: string[] = [];
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel });
    } catch (error) {
      problems.push(
        `${channel}: ${error instanceof Error ? (error.message.split('\n')[0] ?? '') : ''}`,
      );
    }
  }
  throw new Error(
    `No browser to test the report in. Install Chrome or Edge, or set SIFTCODE_BROWSER to the path of a Chromium-based browser.\n${problems.join('\n')}`,
  );
}

const PYTHON = [
  'import subprocess',
  'def run(a, b, c, d, e, f, g):',
  '    if a:',
  '        if b:',
  '            if c:',
  '                subprocess.run(d, shell=True)',
  '    return eval(e)',
  '',
].join('\n');

describe('HTML report in a browser (US-005)', () => {
  let browser: Browser;
  let folder: string;
  let withFindings: string;
  let clean: string;

  beforeAll(async () => {
    browser = await launch();
    folder = await mkdtemp(join(tmpdir(), 'siftcode-browser-'));
    const config = onlyRule('SC-MET-001', { maxLines: 3 });
    const project = await projects.create({
      'a.js': longJsFunction('work', 6),
      'b.js': `// siftcode-ignore SC-MET-001: kept for the report test\n${longJsFunction('kept', 6)}`,
      'c/d.js': longJsFunction('other', 8),
      'tool.py': PYTHON,
    });
    const earlier = await scan(await projects.create({ 'a.js': longJsFunction('work', 6) }), {
      config,
    });
    const result = await scan(project, { config, baseline: createBaseline(earlier.findings) });
    withFindings = join(folder, 'findings.html');
    await writeFile(withFindings, renderReport('html', result, { version: '0.0.0' }));

    const quiet = await scan(await projects.create({ 'a.js': 'export const a = 1;\n' }), {
      config,
    });
    clean = join(folder, 'clean.html');
    await writeFile(clean, renderReport('html', quiet, { version: '0.0.0' }));
  });

  afterAll(async () => {
    await browser.close();
    await rm(folder, { recursive: true, force: true });
  });

  /** A page at `width` that ignores the content policy (so the audit can be injected) and holds still. */
  async function open(file: string, width: number, colorScheme: 'light' | 'dark'): Promise<Page> {
    const context: BrowserContext = await browser.newContext({
      viewport: { width, height: 900 },
      colorScheme,
      bypassCSP: true,
    });
    const page = await context.newPage();
    await page.goto(pathToFileURL(file).href);
    // Contrast measured halfway through a color transition is wrong, so nothing is allowed to move.
    await page.addStyleTag({
      content: '*,*::before,*::after{transition:none!important;animation:none!important}',
    });
    return page;
  }

  async function audit(page: Page): Promise<string[]> {
    await page.evaluate(axe.source);
    const results = await page.evaluate(
      (tags) => (globalThis as unknown as { axe: typeof axe }).axe.run(document, { runOnly: tags }),
      RULES,
    );
    return results.violations.map(
      (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(' | ')})`,
    );
  }

  /** Opens every finding and every explanation, so the audit sees what a reader can reach. */
  async function openEverything(page: Page): Promise<void> {
    await page.click('#expand-all');
    for (const button of await page.locator('.info-btn').all()) {
      await button.click();
    }
  }

  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      it(`has no accessibility violations at ${width}px in the ${theme} theme, all details open`, async () => {
        const page = await open(withFindings, width, theme);
        await openEverything(page);

        expect(await audit(page)).toEqual([]);
        await page.context().close();
      });
    }
  }

  it('has no accessibility violations when nothing was found, at the narrowest width', async () => {
    const page = await open(clean, 375, 'light');

    expect(await audit(page)).toEqual([]);
    await page.context().close();
  });

  it('stays within the window at 375px with everything open', async () => {
    const page = await open(withFindings, 375, 'light');
    await openEverything(page);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow).toBeLessThanOrEqual(0);
    await page.context().close();
  });

  it('can be used from the keyboard, with a visible focus mark on every stop', async () => {
    const page = await open(withFindings, 1280, 'light');
    const stops: string[] = [];
    const unmarked: string[] = [];
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press('Tab');
      const stop = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) {
          return null;
        }
        const style = getComputedStyle(el);
        const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
        const shadow = style.boxShadow !== 'none';
        return {
          name: `${el.tagName.toLowerCase()}#${el.id}.${el.className}`,
          marked: outline || shadow,
        };
      });
      if (!stop || stops.includes(stop.name)) {
        break;
      }
      stops.push(stop.name);
      if (!stop.marked) {
        unmarked.push(stop.name);
      }
    }

    expect(stops.length).toBeGreaterThan(8);
    expect(unmarked).toEqual([]);
    await page.context().close();
  });

  it('opens and closes a finding with the keyboard, and Escape closes an explanation', async () => {
    const page = await open(withFindings, 1280, 'light');
    const first = page.locator('details.finding').first();

    await first.locator('summary').focus();
    await page.keyboard.press('Enter');
    expect(await first.evaluate((el: HTMLDetailsElement) => el.open)).toBe(true);
    await page.keyboard.press('Enter');
    expect(await first.evaluate((el: HTMLDetailsElement) => el.open)).toBe(false);

    await first.locator('summary').click();
    const info = first.locator('.info-btn').first();
    await info.focus();
    await page.keyboard.press('Enter');
    expect(await info.getAttribute('aria-expanded')).toBe('true');
    await page.keyboard.press('Escape');
    expect(await info.getAttribute('aria-expanded')).toBe('false');
    expect(await info.evaluate((el) => el === document.activeElement)).toBe(true);
    await page.context().close();
  });

  it('focuses the search box on "/" and filters the findings as you type', async () => {
    const page = await open(withFindings, 1280, 'light');
    const total = await page.locator('details.finding').count();

    await page.keyboard.press('/');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('q');
    await page.keyboard.type('c/d.js');

    const shown = await page.locator('details.finding:not([hidden])').count();
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(total);
    expect(await page.locator('#result-count').textContent()).toContain(`of ${total}`);
    await page.context().close();
  });

  it('switches theme with the button and tells assistive technology which one is on', async () => {
    const page = await open(withFindings, 1280, 'light');
    const button = page.locator('#bk-theme');

    expect(await button.getAttribute('aria-pressed')).toBe('false');
    await button.click();

    expect(await button.getAttribute('aria-pressed')).toBe('true');
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
    expect(await audit(page)).toEqual([]);
    await page.context().close();
  });

  it('loads under its own content policy with no console errors, policy violations, or requests', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const problems: string[] = [];
    const requests: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') {
        problems.push(m.text());
      }
    });
    page.on('pageerror', (e) => problems.push(e.message));
    page.on('request', (r) => {
      if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) {
        requests.push(r.url());
      }
    });

    await page.goto(pathToFileURL(withFindings).href);
    await page.click('#expand-all');
    await page.click('#bk-theme');

    expect(problems).toEqual([]);
    expect(requests).toEqual([]);
    await context.close();
  });
});
