import { z } from 'zod';
import { anchorPath } from '../anchor.js';
import { readProjectCode } from '../code-text.js';
import { defineRepoRule } from '../define.js';
import { circuitBreakerPattern, nygardReleaseIt, retryPattern } from '../standards.js';
import { readManifests } from '../supply-chain/manifests.js';

/** The ways a file in each language reaches another service: an HTTP client imported or called. */
const REMOTE_CALL =
  /^[ \t]*(?:import|from)[ \t]+(?:requests|httpx|aiohttp|urllib3|urllib\.request)\b|(?:from[ \t]+|require\(\s*)['"](?:axios|node-fetch|cross-fetch|got|undici|ky|superagent)['"]|\bfetch\(|\bHttpClient\b/m;

/** Retries and circuit breakers written by hand: the files that do are not asking for a library. */
const HANDLED_BY_HAND = /\b(?:retry|retries|backoff|circuit[-_ ]?breaker|max_retries)\b/i;

/** Libraries that retry, back off, or break a circuit, or that do so by default. Lowercase. */
const RESILIENCE_LIBRARIES = new Set([
  'p-retry',
  'async-retry',
  'retry',
  'axios-retry',
  'retry-axios',
  'fetch-retry',
  'cockatiel',
  'opossum',
  'got',
  'ky',
  'tenacity',
  'backoff',
  'retrying',
  'stamina',
  'pybreaker',
  'circuitbreaker',
  'polly',
  'polly.core',
  'polly.extensions.http',
  'microsoft.extensions.http.polly',
  'microsoft.extensions.http.resilience',
  'microsoft.extensions.resilience',
]);

export const remoteCallsWithoutRetry = defineRepoRule({
  meta: {
    id: 'SC-RES-003',
    title: 'Remote calls with no retry or circuit-breaker library',
    category: 'reliability',
    defaultSeverity: 'note',
    confidence: 'low',
    heuristic: true,
    standards: [retryPattern, circuitBreakerPattern, nygardReleaseIt],
    rationale:
      'A call to another service fails now and then for reasons that pass on their own, and sometimes keeps failing for a long while. Retrying with a limit and a pause handles the first; a circuit breaker that stops calling a service that is down handles the second, so a failing dependency does not use up the caller as well. A project that makes several remote calls and uses neither has decided to fail on the first error, which may be deliberate.',
    suggestion: {
      summary:
        'Add a retry with exponential backoff and a limit for calls that are safe to repeat, and a circuit breaker around a dependency the project cannot work without: Polly (.NET), cockatiel or p-retry (JavaScript), tenacity or backoff (Python).',
      before: 'response = requests.get(url, timeout=5)',
      after:
        '@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))\ndef fetch():\n    return requests.get(url, timeout=5)',
    },
  },
  options: z.strictObject({
    /** The project must call remote services in at least this many files to be told. */
    minFiles: z.number().int().min(1).default(3),
  }),
  async check(repo, options) {
    if (!repo.isRepositoryRoot || repo.sourceFileCount < options.minFiles) {
      return [];
    }
    const manifests = await readManifests(repo);
    const dependencies = manifests.flatMap((manifest) =>
      manifest.dependencies.map((dependency) => dependency.name.toLowerCase().replace(/_/g, '-')),
    );
    if (dependencies.some((name) => RESILIENCE_LIBRARIES.has(name))) {
      return [];
    }
    const callers = (await readProjectCode(repo)).filter((file) => REMOTE_CALL.test(file.text));
    if (
      callers.length < options.minFiles ||
      callers.some((file) => HANDLED_BY_HAND.test(file.text))
    ) {
      return [];
    }
    const shown = callers.slice(0, 3).map((file) => file.path);
    const more = callers.length > shown.length ? ` and ${callers.length - shown.length} more` : '';
    return [
      {
        path: anchorPath(repo),
        startLine: 1,
        endLine: 1,
        message: `${callers.length} files call remote services (${shown.join(', ')}${more}), and the project uses no retry or circuit-breaker library and none of those files mentions retries.`,
        key: 'no-resilience',
      },
    ];
  },
});
