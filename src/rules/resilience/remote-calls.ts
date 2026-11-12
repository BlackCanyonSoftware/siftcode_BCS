import { z } from 'zod';
import type { AnalyzedFile, CallFact, ValueFact } from '../../languages/model/types.js';
import { defineRule } from '../define.js';
import { importsModule, keywordArgument, plain } from '../security/shared.js';
import { isTestFile, isVendored } from '../shared.js';
import { cwe, nygardReleaseIt } from '../standards.js';

/**
 * What a call to a remote service says about its timeout: `undefined` when none is given, `unknown`
 * when it may be given in a way the syntax does not show (`**kwargs`, a spread, options in a
 * variable, a client configured elsewhere in the file), or the value that was written.
 */
type Timeout = ValueFact | 'unknown' | undefined;

interface RemoteCall {
  readonly callee: string;
  readonly line: number;
  readonly timeout: Timeout;
}

const REQUESTS = /^requests\.(?:get|post|put|patch|delete|head|options|request)$/;
const AXIOS = /^axios(?:\.(?:get|post|put|patch|delete|head|options|request))?$/;
const FETCH = new Set(['fetch', 'window.fetch', 'globalThis.fetch']);
const URLOPEN = new Set(['urllib.request.urlopen', 'urlopen']);

const hasSplat = (call: CallFact): boolean =>
  call.args.some((arg) => arg.name === undefined && arg.value.text.trimStart().startsWith('**'));

/** The `timeout` entry of an options object, `unknown` if it is not a literal object or has a spread. */
function optionsTimeout(options: ValueFact | undefined, key: string): Timeout {
  if (options === undefined) {
    return undefined;
  }
  if (options.kind !== 'object' || options.text.includes('...')) {
    return 'unknown';
  }
  return options.props?.find((prop) => plain(prop.key) === key)?.value;
}

function pythonTimeout(call: CallFact, positional?: number): Timeout {
  const written =
    keywordArgument(call, 'timeout') ??
    (positional === undefined || call.args[positional]?.name !== undefined
      ? undefined
      : call.args[positional]?.value);
  return written ?? (hasSplat(call) ? 'unknown' : undefined);
}

/** The options of an axios call: the third argument of post, put, and patch, the second of the rest. */
function axiosConfig(call: CallFact, method: string | undefined): ValueFact | undefined {
  if (method === undefined || method === 'request') {
    return call.args.find((arg) => arg.value.kind === 'object')?.value ?? call.args[1]?.value;
  }
  return call.args[['post', 'put', 'patch'].includes(method) ? 2 : 1]?.value;
}

/** True when the file gives axios a default timeout: `axios.defaults.timeout = n` or `axios.create({ timeout })`. */
function axiosHasDefault(file: AnalyzedFile): boolean {
  return (
    file.facts.namedValues.some((entry) => entry.target.endsWith('defaults.timeout')) ||
    file.facts.calls.some(
      (call) =>
        call.callee.endsWith('.create') &&
        optionsTimeout(call.args[0]?.value, 'timeout') !== undefined,
    )
  );
}

/** A request to this machine or to the same origin: not a call to another service that can hang. */
const LOCAL_ADDRESS = /^(?:https?:)?\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(?:[:/]|$)/i;
const SAME_ORIGIN = /^(?:\/(?!\/)|\.{1,2}\/)/;

/** `dataUrl`, `objectURL`, `blob_url`: `fetch(dataUrl).blob()` turns a data URL into a blob, it is not a request. */
const IN_MEMORY_URL = /(?:data|blob|object)[_-]?(?:url|uri)$/i;
/** A service worker passes the requests of its page through by design. */
const SERVICE_WORKER = /(?:^|\/)(?:sw|service-?worker)\.[cm]?[jt]s$/i;

function isLocalTarget(call: CallFact): boolean {
  const target = call.args[0]?.value;
  if (target === undefined) {
    return false;
  }
  const text = target.text.trim();
  if (target.kind === 'string' || target.kind === 'dynamic-string') {
    return SAME_ORIGIN.test(text) || LOCAL_ADDRESS.test(text);
  }
  if (target.kind === 'name' && IN_MEMORY_URL.test(text)) {
    return true;
  }
  // `chrome.runtime.getURL(f)`, `new URL('../x.json', import.meta.url)`: files of the app itself
  return /\bgetURL\(|\bimport\.meta\.url\b|^new URL\(\s*['"`](?:\/|\.{1,2}\/)/.test(text);
}

/** A timeout of `None` or 0 is the absence of one: both mean wait forever. */
const isUnbounded = (value: ValueFact): boolean =>
  value.kind === 'null' || (value.kind === 'number' && Number(value.text) === 0);

/** The global `fetch` of a JavaScript file that has not defined a `fetch` of its own. */
const usesGlobalFetch = (file: AnalyzedFile): boolean =>
  ['javascript', 'typescript', 'tsx'].includes(file.grammar) &&
  !file.units.some((unit) => unit.name === 'fetch');

function timeoutOf(file: AnalyzedFile, call: CallFact, axiosDefault: boolean): Timeout | 'skip' {
  const { callee } = call;
  if (REQUESTS.test(callee) && importsModule(file, 'requests')) {
    return pythonTimeout(call);
  }
  if (URLOPEN.has(callee) && importsModule(file, 'urllib.request', 'urllib')) {
    return pythonTimeout(call, 2);
  }
  if (FETCH.has(callee) && usesGlobalFetch(file)) {
    return optionsTimeout(call.args[1]?.value, 'signal');
  }
  if (AXIOS.test(callee) && importsModule(file, 'axios')) {
    return axiosDefault
      ? 'unknown'
      : optionsTimeout(axiosConfig(call, callee.split('.')[1]), 'timeout');
  }
  return 'skip';
}

function classify(
  file: AnalyzedFile,
  call: CallFact,
  axiosDefault: boolean,
): RemoteCall | undefined {
  const timeout = timeoutOf(file, call, axiosDefault);
  if (timeout === 'skip' || isLocalTarget(call)) {
    return undefined;
  }
  const bounded = timeout !== 'unknown' && timeout !== undefined && isUnbounded(timeout);
  return { callee: call.callee, line: call.line, timeout: bounded ? undefined : timeout };
}

/** Every call in the file to an HTTP client whose timeout can be judged. */
function remoteCalls(file: AnalyzedFile): RemoteCall[] {
  if (isTestFile(file.path) || isVendored(file.path) || SERVICE_WORKER.test(file.path)) {
    return [];
  }
  const axiosDefault = axiosHasDefault(file);
  return file.facts.calls.flatMap((call) => {
    const remote = classify(file, call, axiosDefault);
    return remote === undefined ? [] : [remote];
  });
}

/**
 * The number a timeout was written as, for a literal: `5`, `(3, 10)`, or the `5000` of
 * `AbortSignal.timeout(5000)`. `undefined` for anything that is not a constant.
 */
function writtenTimeout(timeout: Timeout): string | undefined {
  if (timeout === undefined || timeout === 'unknown') {
    return undefined;
  }
  if (timeout.kind === 'number') {
    return timeout.text;
  }
  const signal = /^AbortSignal\.timeout\(\s*(\d+(?:\.\d+)?)\s*\)$/.exec(timeout.text.trim());
  if (signal?.[1] !== undefined) {
    return signal[1];
  }
  return /^\(\s*\d[\d.,\s]*\)$/.test(timeout.text.trim()) ? timeout.text.trim() : undefined;
}

export const remoteCallWithoutTimeout = defineRule({
  meta: {
    id: 'SC-RES-001',
    title: 'Remote call has no timeout',
    category: 'reliability',
    defaultSeverity: 'info',
    confidence: 'medium',
    heuristic: true,
    standards: [nygardReleaseIt, cwe(400, 'Uncontrolled Resource Consumption')],
    rationale:
      'requests, urllib, fetch, and axios wait as long as the other side takes unless they are told otherwise. One slow or silent server then holds a thread, a connection, and the caller for as long as it likes, and the slowness spreads to everything waiting behind. A client configured elsewhere (a session, a shared agent) is not seen, so check before acting.',
    suggestion: {
      summary:
        'Give every remote call a timeout, short enough to fail before the caller gives up, and decide what happens when it fires (retry, fall back, or report the error).',
      before: 'response = requests.get(url)',
      after: 'response = requests.get(url, timeout=settings.http_timeout_seconds)',
    },
  },
  options: z.strictObject({}),
  check(file) {
    return remoteCalls(file)
      .filter((call) => call.timeout === undefined)
      .map((call) => ({
        startLine: call.line,
        endLine: call.line,
        message: `${call.callee}() has no timeout: it waits as long as the other side takes, so one slow server can hang this code.`,
        key: call.callee,
      }));
  },
});

export const timeoutWrittenIntoCall = defineRule({
  meta: {
    id: 'SC-RES-002',
    title: 'Timeout is a constant written into the call',
    category: 'reliability',
    defaultSeverity: 'note',
    confidence: 'low',
    heuristic: true,
    standards: [nygardReleaseIt],
    rationale:
      'A timeout is better than none, but a number written into the call cannot be tuned when a dependency gets slower, or differ between environments, without a release. This is a suggestion about where the number lives, and many projects reasonably keep it in the call.',
    suggestion: {
      summary:
        'Read the timeout from configuration (an environment variable, a settings object) and pass it in, so it can be changed where the code runs.',
      before: 'requests.get(url, timeout=5)',
      after: 'requests.get(url, timeout=settings.http_timeout_seconds)',
    },
  },
  options: z.strictObject({}),
  check(file) {
    // One note per file: a file whose calls all set a timeout is doing the right thing, and a note
    // for each call would only repeat itself.
    const written = remoteCalls(file).flatMap((call) => {
      const value = writtenTimeout(call.timeout);
      return value === undefined ? [] : [{ call, value }];
    });
    const [first] = written;
    if (first === undefined) {
      return [];
    }
    const message =
      written.length === 1
        ? `The timeout of ${first.value} is written into ${first.call.callee}(): read it from configuration so it can be tuned without a release.`
        : `${written.length} remote calls in this file have a timeout written into the call (${[...new Set(written.map((w) => w.value))].join(', ')}): read them from configuration so they can be tuned without a release.`;
    return [{ startLine: first.call.line, endLine: first.call.line, message, key: 'timeouts' }];
  },
});
