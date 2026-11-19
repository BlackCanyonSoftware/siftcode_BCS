import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import type { AiSettings } from '../config/ai.js';
import type { Finding } from '../core/finding.js';
import type { ScanResult } from '../core/result.js';
import { compareStrings } from '../shared/compare.js';
import { compareSeverity, isAtLeast } from '../shared/severity.js';
import { AiRequestError, askModel, type Fetch } from './client.js';
import { resolveEndpoint, type Endpoint } from './endpoint.js';
import { buildPrompt } from './prompt.js';
import { redactSecrets } from './redact.js';

/** What the enrichment needs from outside, so a test can supply a fake service and a fake environment. */
export interface AiDeps {
  readonly fetch: Fetch;
  readonly env: NodeJS.ProcessEnv;
  /** Tells the user what is about to be sent and where, before anything is. */
  announce(message: string): void;
}

/** Findings about credentials are never sent: the code they point at is the secret. */
const NEVER_SENT = new Set(['SC-SEC-001']);
/** After this many answers in a row that fail, the service is not going to work: stop asking. */
const MAX_FAILURES_IN_A_ROW = 3;
/** An excerpt is cut at this many characters, whatever `contextLines` says. */
const MAX_EXCERPT_CHARS = 4000;

interface Item {
  readonly finding: Finding;
  readonly excerpt: string;
  readonly lines: number;
}

/** The findings to send: at least `minSeverity`, about code in a file, not a skipped rule, most severe first. */
function chooseFindings(result: ScanResult, settings: AiSettings): Finding[] {
  const skipped = new Set([...NEVER_SENT, ...settings.skipRules]);
  return result.findings
    .filter(
      (finding) =>
        finding.path !== '.' &&
        !skipped.has(finding.ruleId) &&
        isAtLeast(finding.severity, settings.minSeverity),
    )
    .sort((a, b) => compareSeverity(a.severity, b.severity))
    .slice(0, settings.maxFindings);
}

/** `path` under `root`, or undefined if it would lead outside it. */
function inside(root: string, path: string): string | undefined {
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  return rel.startsWith('..') || isAbsolute(rel) ? undefined : absolute;
}

/** The lines around a finding, numbered and with secrets removed, or undefined if the file cannot be read. */
async function excerptOf(
  root: string,
  finding: Finding,
  context: number,
): Promise<Item | undefined> {
  const file = inside(root, finding.path);
  if (file === undefined) {
    return undefined;
  }
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return undefined;
  }
  const all = text.split(/\r?\n/);
  const first = Math.max(1, finding.startLine - context);
  const last = Math.min(all.length, finding.endLine + context);
  const numbered = all
    .slice(first - 1, last)
    .map((line, index) => `${first + index}: ${redactSecrets(line)}`)
    .join('\n');
  const excerpt =
    numbered.length > MAX_EXCERPT_CHARS ? `${numbered.slice(0, MAX_EXCERPT_CHARS)}\n...` : numbered;
  return { finding, excerpt, lines: last - first + 1 };
}

function describeUpload(items: readonly Item[], settings: AiSettings, endpoint: Endpoint): string {
  const lines = items.reduce((total, item) => total + item.lines, 0);
  const files = new Set(items.map((item) => item.finding.path)).size;
  const where = endpoint.local
    ? `the service on this machine (${endpoint.host})`
    : `${endpoint.host}, outside this machine`;
  return `AI suggestions: sending ${items.length} code excerpts (${lines} lines from ${files} files) to ${where}, model ${settings.model}. Credentials are removed first and findings about credentials are not sent.`;
}

/**
 * Asks an AI service for a suggestion fitted to each of the most severe findings, and returns the
 * result with `aiSuggestion` set on those that got one. This is the only place SiftCode reads code
 * out of a scan to send it anywhere, it runs only when the user asked for it, and it never changes
 * what a scan finds or whether it fails: a service that is down leaves the findings as they were
 * and says so in the notes.
 */
export async function addAiSuggestions(
  result: ScanResult,
  settings: AiSettings,
  deps: AiDeps,
): Promise<ScanResult> {
  const endpoint = resolveEndpoint(settings, deps.env);
  const items = (
    await Promise.all(
      chooseFindings(result, settings).map((finding) =>
        excerptOf(result.root, finding, settings.contextLines),
      ),
    )
  ).filter((item): item is Item => item !== undefined);
  if (items.length === 0) {
    deps.announce(
      'AI suggestions: no finding qualified (see "ai.minSeverity" and "ai.maxFindings").',
    );
    return result;
  }
  deps.announce(describeUpload(items, settings, endpoint));

  const written = new Map<string, string>();
  const failures: string[] = [];
  let inARow = 0;
  for (const { finding, excerpt } of items) {
    const rule = result.rules.find((meta) => meta.id === finding.ruleId);
    const language = result.files.find((file) => file.path === finding.path)?.language ?? 'code';
    try {
      const prompt = buildPrompt({ finding, rule, excerpt, language });
      written.set(finding.fingerprint, await askModel({ settings, endpoint, prompt }, deps.fetch));
      inARow = 0;
    } catch (cause) {
      const error = cause instanceof AiRequestError ? cause : undefined;
      failures.push(error?.message ?? 'an unexpected error');
      inARow += 1;
      if (error?.fatal === true || inARow >= MAX_FAILURES_IN_A_ROW) {
        break;
      }
    }
  }
  return withSuggestions(result, written, settings, endpoint, failures);
}

function withSuggestions(
  result: ScanResult,
  written: ReadonlyMap<string, string>,
  settings: AiSettings,
  endpoint: Endpoint,
  failures: readonly string[],
): ScanResult {
  const findings = result.findings.map((finding) => {
    const text = written.get(finding.fingerprint);
    return text === undefined
      ? finding
      : { ...finding, aiSuggestion: { text, model: settings.model } };
  });
  const note =
    `AI suggestions from ${endpoint.host}, model ${settings.model}: ${written.size} written` +
    (failures.length > 0 ? `, stopped after a failure (${failures.at(-1) ?? ''})` : '') +
    '. Written by a model; SiftCode has not checked them.';
  return { ...result, findings, notes: [...result.notes, note].sort(compareStrings) };
}
