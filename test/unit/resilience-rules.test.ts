import { describe, expect, it } from 'vitest';
import { scan } from '../../src/core/scan.js';
import { onlyRule, useProjects } from '../helpers/project.js';

const projects = useProjects();

async function findingsFor(
  id: string,
  files: Record<string, string>,
  options: object = {},
  git = true,
) {
  const folder = await projects.create({
    ...files,
    ...(git ? { '.git/HEAD': 'ref: refs/heads/main\n' } : {}),
  });
  return (await scan(folder, { config: onlyRule(id, options) })).findings;
}

const messages = (findings: readonly { message: string }[]) => findings.map((f) => f.message);

describe('SC-RES-001 remote call without a timeout (US-052)', () => {
  it.each([
    ['requests.get', 'a.py', 'import requests\nrequests.get(url)\n', 'requests.get'],
    [
      'requests.post with data',
      'a.py',
      'import requests\nrequests.post(url, data=d)\n',
      'requests.post',
    ],
    [
      'urlopen',
      'a.py',
      'import urllib.request\nurllib.request.urlopen(url)\n',
      'urllib.request.urlopen',
    ],
    [
      'requests with timeout=None, which waits forever',
      'a.py',
      'import requests\nrequests.get(url, timeout=None)\n',
      'requests.get',
    ],
    [
      'axios with timeout 0, which waits forever',
      'a.js',
      "import axios from 'axios';\naxios.get(url, { timeout: 0 });\n",
      'axios.get',
    ],
    ['fetch of an outside address', 'a.ts', "fetch('https://api.example.com/x');\n", 'fetch'],
    ['fetch with no options', 'a.ts', 'fetch(url);\n', 'fetch'],
    ['fetch with options and no signal', 'a.ts', "fetch(url, { method: 'POST' });\n", 'fetch'],
    ['axios.get', 'a.js', "import axios from 'axios';\naxios.get(url);\n", 'axios.get'],
    [
      'axios.post with a config that has no timeout',
      'a.js',
      "import axios from 'axios';\naxios.post(url, body, { headers: h });\n",
      'axios.post',
    ],
  ])('flags %s', async (_name, file, source, callee) => {
    const findings = await findingsFor('SC-RES-001', { [file]: source });

    expect(messages(findings)).toEqual([
      `${callee}() has no timeout: it waits as long as the other side takes, so one slow server can hang this code.`,
    ]);
    expect(findings[0]).toMatchObject({ severity: 'info', confidence: 'medium' });
  });

  it.each([
    ['requests with a timeout', 'a.py', 'import requests\nrequests.get(url, timeout=5)\n'],
    [
      'requests with a tuple timeout',
      'a.py',
      'import requests\nrequests.get(url, timeout=(3, 10))\n',
    ],
    [
      'requests with a timeout from configuration',
      'a.py',
      'import requests\nrequests.get(url, timeout=cfg.timeout)\n',
    ],
    [
      'requests with **kwargs, which may carry one',
      'a.py',
      'import requests\nrequests.get(url, **kwargs)\n',
    ],
    ['a file that does not import requests', 'a.py', 'requests.get(url)\n'],
    [
      'urlopen with a positional timeout',
      'a.py',
      'import urllib.request\nurllib.request.urlopen(url, None, 5)\n',
    ],
    [
      'urlopen with a keyword timeout',
      'a.py',
      'import urllib.request\nurllib.request.urlopen(url, timeout=5)\n',
    ],
    ['fetch with a signal', 'a.ts', 'fetch(url, { signal: AbortSignal.timeout(5000) });\n'],
    [
      'fetch with a signal from a controller',
      'a.ts',
      'fetch(url, { signal: controller.signal });\n',
    ],
    ['fetch with options held in a variable', 'a.ts', 'fetch(url, opts);\n'],
    ['fetch with a spread, which may carry a signal', 'a.ts', 'fetch(url, { ...opts });\n'],
    [
      'axios with a timeout',
      'a.js',
      "import axios from 'axios';\naxios.get(url, { timeout: 3000 });\n",
    ],
    [
      'axios with a timeout from a variable',
      'a.js',
      "import axios from 'axios';\naxios(url, { timeout: t });\n",
    ],
    [
      'axios in a file that sets a default timeout',
      'a.js',
      "import axios from 'axios';\naxios.defaults.timeout = 5000;\naxios.get(url);\n",
    ],
    [
      'axios in a file that creates a client with a timeout',
      'a.js',
      "import axios from 'axios';\nconst api = axios.create({ timeout: 1000 });\naxios.get(url);\n",
    ],
    [
      'a Python function that happens to be called fetch',
      'a.py',
      'def fetch(u):\n    return u\nfetch(url)\nfetch(top_n=3)\n',
    ],
    ['a Python call to fetch with no function defined', 'a.py', 'fetch()\nx = fetch(a)\n'],
    [
      'a JavaScript function the file defines called fetch',
      'a.js',
      'function fetch(u) { return u; }\nfetch(url);\n',
    ],
    [
      'a same-origin path',
      'a.ts',
      "fetch('/api/items');\nfetch('../catalogue.json');\nfetch('./x.json');\n",
    ],
    [
      'a request to localhost',
      'a.ts',
      "fetch('http://localhost:3000/x');\nfetch(`http://127.0.0.1:${port}/api`);\n",
    ],
    [
      'a request to localhost from Python',
      'a.py',
      'import requests\nrequests.get("http://127.0.0.1:8000/health")\n',
    ],
    ['a file inside a browser extension', 'a.js', 'fetch(chrome.runtime.getURL("style.css"));\n'],
    [
      'a data or object URL turned into a blob',
      'a.js',
      'const a = await (await fetch(dataUrl)).blob();\nconst b = await fetch(objectURL);\nconst c = await fetch(blob_url);\n',
    ],
    [
      'a service worker passing requests through',
      'sw.js',
      'self.onfetch = (e) => fetch(e.request);\n',
    ],
    ['a service worker with a longer name', 'static/service-worker.js', 'fetch(req);\n'],
    ['a method called get on something else', 'a.js', 'cache.get(key);\nstore.fetch(key);\n'],
  ])('does not flag %s', async (_name, file, source) => {
    expect(await findingsFor('SC-RES-001', { [file]: source })).toEqual([]);
  });

  it('leaves test code and vendored code alone', async () => {
    const findings = await findingsFor('SC-RES-001', {
      'tests/test_a.py': 'import requests\nrequests.get(url)\n',
      'frontend/e2e/stub.mjs': 'fetch(url);\n',
      'src/pkg/_vendor/b.py': 'import requests\nrequests.get(url)\n',
      'src/c.py': 'import requests\nrequests.get(url)\n',
    });

    expect(findings.map((f) => f.path)).toEqual(['src/c.py']);
  });
});

describe('SC-RES-002 timeout written into the call (US-052)', () => {
  it.each([
    [
      'a number in requests',
      'a.py',
      'import requests\nrequests.get(url, timeout=5)\n',
      'requests.get',
      '5',
    ],
    [
      'a tuple in requests',
      'a.py',
      'import requests\nrequests.post(url, timeout=(3, 10))\n',
      'requests.post',
      '(3, 10)',
    ],
    [
      'a number in urlopen',
      'a.py',
      'import urllib.request\nurllib.request.urlopen(url, timeout=30)\n',
      'urllib.request.urlopen',
      '30',
    ],
    [
      'AbortSignal.timeout in fetch',
      'a.ts',
      'fetch(url, { signal: AbortSignal.timeout(5000) });\n',
      'fetch',
      '5000',
    ],
    [
      'a number in axios',
      'a.js',
      "import axios from 'axios';\naxios.get(url, { timeout: 3000 });\n",
      'axios.get',
      '3000',
    ],
  ])('flags %s', async (_name, file, source, callee, value) => {
    const findings = await findingsFor('SC-RES-002', { [file]: source });

    expect(messages(findings)).toEqual([
      `The timeout of ${value} is written into ${callee}(): read it from configuration so it can be tuned without a release.`,
    ]);
    expect(findings[0]).toMatchObject({ severity: 'note', confidence: 'low' });
  });

  it('reports a file once, listing the values, when several calls write theirs in', async () => {
    const findings = await findingsFor('SC-RES-002', {
      'a.py':
        'import requests\nrequests.get(u, timeout=10)\nrequests.get(v, timeout=10)\nrequests.post(w, timeout=30)\n',
    });

    expect(messages(findings)).toEqual([
      '3 remote calls in this file have a timeout written into the call (10, 30): read them from configuration so they can be tuned without a release.',
    ]);
    expect(findings[0]?.startLine).toBe(2);
  });

  it.each([
    [
      'a timeout from configuration',
      'a.py',
      'import requests\nrequests.get(url, timeout=cfg.timeout)\n',
    ],
    [
      'a timeout from a constant',
      'a.py',
      'import requests\nrequests.get(url, timeout=REQUEST_TIMEOUT)\n',
    ],
    ['a signal from a controller', 'a.ts', 'fetch(url, { signal: controller.signal });\n'],
    ['no timeout at all (that is SC-RES-001)', 'a.py', 'import requests\nrequests.get(url)\n'],
    [
      'a client created with a timeout',
      'a.js',
      "import axios from 'axios';\nconst api = axios.create({ timeout: 1000 });\n",
    ],
  ])('does not flag %s', async (_name, file, source) => {
    expect(await findingsFor('SC-RES-002', { [file]: source })).toEqual([]);
  });
});

describe('SC-RES-003 remote calls with no retry or circuit breaker (US-052)', () => {
  const callers = (count: number, ext = 'py'): Record<string, string> =>
    Object.fromEntries(
      Array.from({ length: count }, (_, i) => [
        `src/client${i}.${ext}`,
        ext === 'py'
          ? 'import requests\nrequests.get(url, timeout=5)\n'
          : "export const r = () => fetch('/x');\n",
      ]),
    );

  it('flags a project that calls remote services in several files and has no retry or breaker', async () => {
    const findings = await findingsFor('SC-RES-003', { ...callers(4), 'README.md': '# Demo\n' });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ path: 'README.md', severity: 'note', confidence: 'low' });
    expect(findings[0]?.message).toBe(
      '4 files call remote services (src/client0.py, src/client1.py, src/client2.py and 1 more), and the project uses no retry or circuit-breaker library and none of those files mentions retries.',
    );
  });

  it.each([
    ['tenacity', { 'requirements.txt': 'requests\ntenacity==8.0.0\n' }],
    ['backoff', { 'requirements.txt': 'backoff==2.0.0\n' }],
    ['p-retry', { 'package.json': JSON.stringify({ dependencies: { 'p-retry': '6.0.0' } }) }],
    [
      'axios-retry',
      { 'package.json': JSON.stringify({ dependencies: { 'axios-retry': '4.0.0' } }) },
    ],
    ['cockatiel', { 'package.json': JSON.stringify({ devDependencies: { cockatiel: '3.0.0' } }) }],
    [
      'Polly',
      {
        'App.csproj':
          '<Project><ItemGroup><PackageReference Include="Polly" Version="8.0.0" /></ItemGroup></Project>',
      },
    ],
  ])('is quiet when %s is a dependency', async (_name, extra) => {
    expect(await findingsFor('SC-RES-003', { ...callers(4), ...extra })).toEqual([]);
  });

  it('is quiet when one of the calling files handles retries by hand', async () => {
    const findings = await findingsFor('SC-RES-003', {
      ...callers(4),
      'src/client0.py':
        'import requests\nfor attempt in range(max_retries):\n    requests.get(url, timeout=5)\n',
    });

    expect(findings).toEqual([]);
  });

  it('is quiet when few files call out, and minFiles changes that', async () => {
    expect(await findingsFor('SC-RES-003', callers(2))).toEqual([]);
    expect(await findingsFor('SC-RES-003', callers(2), { minFiles: 2 })).toHaveLength(1);
  });

  it('finds fetch callers in TypeScript, ignores tests, and runs only at the top of a repository', async () => {
    const files = { ...callers(3, 'ts'), 'tests/a.test.ts': "fetch('/y'); fetch('/z');\n" };

    expect(await findingsFor('SC-RES-003', files)).toHaveLength(1);
    expect(await findingsFor('SC-RES-003', files, {}, false)).toEqual([]);
  });
});
