import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { AiRequestError, askModel, type Fetch } from '../../src/ai/client.js';
import { addAiSuggestions } from '../../src/ai/enrich.js';
import { resolveEndpoint } from '../../src/ai/endpoint.js';
import { redactSecrets } from '../../src/ai/redact.js';
import { EXIT_FINDINGS, EXIT_OK, EXIT_USAGE, run } from '../../src/cli/run.js';
import { aiSchema, type AiSettings } from '../../src/config/ai.js';
import { scan } from '../../src/core/scan.js';
import { longJsFunction, onlyRule, useProjects } from '../helpers/project.js';

const projects = useProjects();

/** Credential-shaped strings are built at run time: a literal one would be blocked by push protection. */
const githubToken = (): string => ['gh', 'p_', 'a1B2c3D4e5'.repeat(4)].join('');

const settings = (overrides: object = {}): AiSettings =>
  aiSchema.parse({ provider: 'openai', model: 'test-model', ...overrides });

interface Call {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: Record<string, unknown>;
}

/** A fake service: records what it was sent and answers with `answer`, or fails as told. */
function fakeFetch(answer: (call: Call, count: number) => Response | Promise<Response>): {
  fetch: Fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetcher: Fetch = async (input, init) => {
    const call: Call = {
      url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
      body: JSON.parse(init?.body as string) as Record<string, unknown>,
    };
    calls.push(call);
    return answer(call, calls.length);
  };
  return { fetch: fetcher, calls };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const completion = (text: string): Response => json({ choices: [{ message: { content: text } }] });

describe('removing credentials before anything is sent (US-080)', () => {
  it('replaces known key formats, URL passwords, secret assignments, and generated literals', () => {
    const text = [
      `const a = "${githubToken()}";`,
      'const url = "postgres://admin:hunter2hunter2@db.example.com/app";',
      'const password = "correct horse battery";',
      "api_key: 'abcd1234'",
      'const blob = "Zx81Kp92Lm03Qr47Vt58Wy69Ab12Cd34";',
    ].join('\n');

    const result = redactSecrets(text);

    expect(result).not.toContain(githubToken());
    expect(result).not.toContain('hunter2hunter2');
    expect(result).not.toContain('correct horse');
    expect(result).not.toContain('abcd1234');
    expect(result).not.toContain('Zx81Kp92');
    expect(result.match(/\[redacted\]/g)).toHaveLength(5);
  });

  it('leaves ordinary code, names, and short or plain strings alone', () => {
    const code = [
      'const tokenizer = new Tokenizer("utf-8");',
      'function login(user) { return user.name; }',
      'const label = "Enter your password";',
      'const id = "abcdefghijklmnopqrstuvwxyz";',
    ].join('\n');

    expect(redactSecrets(code)).toBe(code);
  });
});

describe('where the request goes (US-080)', () => {
  it.each([
    ['openai', undefined, 'https://api.openai.com/v1/chat/completions'],
    ['openai', 'https://example.org/v1/', 'https://example.org/v1/chat/completions'],
    ['anthropic', undefined, 'https://api.anthropic.com/v1/messages'],
    ['anthropic', 'https://proxy.example/v1', 'https://proxy.example/v1/messages'],
  ])('builds the URL for %s with endpoint %s', (provider, endpoint, expected) => {
    const found = resolveEndpoint(settings({ provider, ...(endpoint ? { endpoint } : {}) }), {
      OPENAI_API_KEY: 'k1',
      ANTHROPIC_API_KEY: 'k2',
    });

    expect(found.url).toBe(expected);
    expect(found.local).toBe(false);
  });

  it('sends the key in the header each provider expects, from the variable that was named', () => {
    const openai = resolveEndpoint(settings({ apiKeyEnv: 'MY_KEY' }), { MY_KEY: 'secret-1' });
    const anthropic = resolveEndpoint(settings({ provider: 'anthropic' }), {
      ANTHROPIC_API_KEY: 'secret-2',
    });

    expect(openai.headers).toEqual({ authorization: 'Bearer secret-1' });
    expect(anthropic.headers).toEqual({
      'x-api-key': 'secret-2',
      'anthropic-version': '2023-06-01',
    });
  });

  it('refuses a service that is not on this machine and does not use https', () => {
    expect(() =>
      resolveEndpoint(settings({ endpoint: 'http://ai.example.com/v1' }), { OPENAI_API_KEY: 'k' }),
    ).toThrow('must use https');
  });

  it('accepts plain http for localhost, with no key', () => {
    const found = resolveEndpoint(settings({ endpoint: 'http://localhost:11434/v1' }), {});

    expect(found).toMatchObject({
      local: true,
      headers: {},
      url: 'http://localhost:11434/v1/chat/completions',
    });
  });

  it('requires a key from the environment for a remote service, and never reads one from the config', () => {
    expect(() => resolveEndpoint(settings(), {})).toThrow(
      'set the environment variable OPENAI_API_KEY',
    );
    expect(() => aiSchema.parse({ provider: 'openai', model: 'm', apiKey: 'x' })).toThrow();
  });

  it('rejects an endpoint that is not a URL', () => {
    expect(() =>
      resolveEndpoint(settings({ endpoint: 'not a url' }), { OPENAI_API_KEY: 'k' }),
    ).toThrow('not a URL');
  });
});

describe('asking the service (US-080)', () => {
  const endpoint = resolveEndpoint(settings(), { OPENAI_API_KEY: 'sk-test-key-12345' });
  const ask = (fetcher: Fetch, overrides: object = {}) =>
    askModel({ settings: settings(overrides), endpoint, prompt: 'Why?' }, fetcher);

  it('sends an OpenAI-style request and returns the text of the answer', async () => {
    const { fetch, calls } = fakeFetch(() => completion('  Use a parameter.  '));

    expect(await ask(fetch)).toBe('Use a parameter.');
    expect(calls[0]?.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(calls[0]?.headers.authorization).toBe('Bearer sk-test-key-12345');
    expect(calls[0]?.body).toMatchObject({
      model: 'test-model',
      messages: [
        { role: 'system', content: expect.stringContaining('senior engineer') as string },
        { role: 'user', content: 'Why?' },
      ],
    });
  });

  it("asks OpenAI's own service for max_completion_tokens and no temperature, and others for max_tokens", async () => {
    const hosted = fakeFetch(() => completion('a'));
    const local = fakeFetch(() => completion('a'));
    const here = resolveEndpoint(settings({ endpoint: 'http://localhost:11434/v1' }), {});

    await ask(hosted.fetch);
    await askModel({ settings: settings(), endpoint: here, prompt: 'Why?' }, local.fetch);

    expect(hosted.calls[0]?.body).toHaveProperty('max_completion_tokens', 700);
    expect(hosted.calls[0]?.body).not.toHaveProperty('max_tokens');
    expect(hosted.calls[0]?.body).not.toHaveProperty('temperature');
    expect(local.calls[0]?.body).toHaveProperty('max_tokens', 700);
    expect(local.calls[0]?.body).toHaveProperty('temperature', 0.2);
  });

  it('sends an Anthropic-style request and reads its answer', async () => {
    const anthropic = resolveEndpoint(settings({ provider: 'anthropic' }), {
      ANTHROPIC_API_KEY: 'k',
    });
    const { fetch, calls } = fakeFetch(() =>
      json({ content: [{ type: 'text', text: 'Do this.' }] }),
    );

    const text = await askModel(
      { settings: settings({ provider: 'anthropic' }), endpoint: anthropic, prompt: 'Why?' },
      fetch,
    );

    expect(text).toBe('Do this.');
    expect(calls[0]?.body).toMatchObject({
      model: 'test-model',
      system: expect.any(String) as string,
      messages: [{ role: 'user', content: 'Why?' }],
    });
  });

  it('marks a refused key as fatal and other failures as worth another try', async () => {
    const denied = await ask(fakeFetch(() => json({}, 401)).fetch).catch((e: unknown) => e);
    const down = await ask(fakeFetch(() => json({}, 503)).fetch).catch((e: unknown) => e);

    expect(denied).toBeInstanceOf(AiRequestError);
    expect(denied).toMatchObject({ fatal: true, message: 'api.openai.com answered HTTP 401' });
    expect(down).toMatchObject({ fatal: false, message: 'api.openai.com answered HTTP 503' });
  });

  it('rejects an answer that is not JSON or has no text', async () => {
    await expect(ask(fakeFetch(() => new Response('<html>')).fetch)).rejects.toThrow(
      'did not answer with JSON',
    );
    await expect(ask(fakeFetch(() => json({ choices: [] })).fetch)).rejects.toThrow('no text');
  });

  it('never shows the key, even if the failure text carries it', async () => {
    const leaking: Fetch = () =>
      Promise.reject(new Error('bad header Bearer sk-test-key-12345 here'));

    const error = await ask(leaking).catch((e: unknown) => e);

    expect((error as Error).message).not.toContain('sk-test-key-12345');
    expect((error as Error).message).toContain('[key]');
  });

  it('removes control characters and cuts a very long answer', async () => {
    const answer = `ok\u0000\u0007 ${'x'.repeat(5000)}`;

    const text = await ask(fakeFetch(() => completion(answer)).fetch);

    expect(text.startsWith('ok x')).toBe(true);
    expect(text.length).toBeLessThan(3100);
    expect(text.endsWith('...')).toBe(true);
  });
});

/** A project whose `work` function breaks the line limit, and whose other file holds a credential. */
async function project() {
  const folder = await projects.create({
    'a.js': `const before = 1;\n${longJsFunction('work', 8)}const after = 2;\n`,
    'b.js': `const token = "${githubToken()}";\nconst config = { password: "correct horse battery" };\n`,
  });
  const result = await scan(folder, {
    config: onlyRuleAnd(['SC-MET-001', 'SC-SEC-001'], { 'SC-MET-001': { maxLines: 3 } }),
  });
  return { folder, result };
}

function onlyRuleAnd(ids: string[], options: Record<string, Record<string, unknown>>) {
  // `onlyRule` enables one rule; enable the others by merging their config over it.
  const base = onlyRule(ids[0] ?? '', options[ids[0] ?? ''] ?? {});
  const rules = { ...base.rules };
  for (const id of ids.slice(1)) {
    rules[id] = { enabled: true, options: options[id] ?? {} };
  }
  return { ...base, rules };
}

describe('adding suggestions to a scan (US-080)', () => {
  it("sends the lines around a finding with line numbers, and the rule's own explanation", async () => {
    const { result } = await project();
    const { fetch, calls } = fakeFetch(() => completion('Split it up.'));
    const announced: string[] = [];

    await addAiSuggestions(result, settings({ minSeverity: 'info' }), {
      fetch,
      env: { OPENAI_API_KEY: 'k' },
      announce: (m) => announced.push(m),
    });

    const sent = JSON.stringify(calls[0]?.body);
    expect(calls).toHaveLength(1);
    expect(sent).toContain('SC-MET-001');
    expect(sent).toContain('1: const before = 1;');
    expect(sent).toContain('Why the rule exists');
    expect(announced).toHaveLength(1);
    expect(announced[0]).toMatch(
      /sending 1 code excerpts \(\d+ lines from 1 files\) to api\.openai\.com, outside this machine, model test-model/,
    );
  });

  it('never sends a finding about a credential, and never the credential itself', async () => {
    const { result } = await project();
    expect(result.findings.some((f) => f.ruleId === 'SC-SEC-001')).toBe(true);
    const { fetch, calls } = fakeFetch(() => completion('ok'));

    await addAiSuggestions(result, settings({ minSeverity: 'note' }), {
      fetch,
      env: { OPENAI_API_KEY: 'k' },
      announce: () => undefined,
    });

    const everything = JSON.stringify(calls.map((c) => c.body));
    expect(everything).not.toContain(githubToken());
    expect(everything).not.toContain('correct horse');
    expect(everything).not.toContain('SC-SEC-001');
    expect(everything).not.toContain('b.js');
  });

  it('redacts a credential that sits inside the lines around another finding', async () => {
    const folder = await projects.create({
      'a.js': `const key = "${githubToken()}";\n${longJsFunction('work', 8)}`,
    });
    const result = await scan(folder, { config: onlyRule('SC-MET-001', { maxLines: 3 }) });
    const { fetch, calls } = fakeFetch(() => completion('ok'));

    await addAiSuggestions(result, settings({ minSeverity: 'note' }), {
      fetch,
      env: { OPENAI_API_KEY: 'k' },
      announce: () => undefined,
    });

    const sent = JSON.stringify(calls[0]?.body);
    expect(sent).not.toContain(githubToken());
    expect(sent).toContain('[redacted]');
  });

  it('puts the suggestion on the finding without changing its identity, and adds a note', async () => {
    const { result } = await project();
    const target = result.findings.find((f) => f.ruleId === 'SC-MET-001');

    const enriched = await addAiSuggestions(result, settings({ minSeverity: 'note' }), {
      fetch: fakeFetch(() => completion('Split it up.')).fetch,
      env: { OPENAI_API_KEY: 'k' },
      announce: () => undefined,
    });

    const after = enriched.findings.find((f) => f.fingerprint === target?.fingerprint);
    expect(after?.aiSuggestion).toEqual({ text: 'Split it up.', model: 'test-model' });
    expect(enriched.findings.map((f) => f.fingerprint)).toEqual(
      result.findings.map((f) => f.fingerprint),
    );
    expect(enriched.findings.filter((f) => f.aiSuggestion)).toHaveLength(1);
    expect(
      enriched.notes.some((n) =>
        n.startsWith('AI suggestions from api.openai.com, model test-model: 1 written'),
      ),
    ).toBe(true);
  });

  it('stops at once when the key is refused, and after three failures in a row otherwise', async () => {
    const folder = await projects.create(
      Object.fromEntries(
        Array.from({ length: 6 }, (_, i) => [`f${i}.js`, longJsFunction(`work${i}`, 8)]),
      ),
    );
    const result = await scan(folder, { config: onlyRule('SC-MET-001', { maxLines: 3 }) });
    const options = (fetcher: Fetch) => ({
      fetch: fetcher,
      env: { OPENAI_API_KEY: 'k' },
      announce: () => undefined,
    });

    const refused = fakeFetch(() => json({}, 401));
    const down = fakeFetch(() => json({}, 500));
    const first = await addAiSuggestions(
      result,
      settings({ minSeverity: 'note' }),
      options(refused.fetch),
    );
    await addAiSuggestions(result, settings({ minSeverity: 'note' }), options(down.fetch));

    expect(refused.calls).toHaveLength(1);
    expect(down.calls).toHaveLength(3);
    expect(first.findings.some((f) => f.aiSuggestion)).toBe(false);
    expect(
      first.notes.some((n) =>
        n.includes('0 written, stopped after a failure (api.openai.com answered HTTP 401)'),
      ),
    ).toBe(true);
  });

  it('sends the most severe findings first and no more than maxFindings', async () => {
    const folder = await projects.create(
      Object.fromEntries(
        Array.from({ length: 5 }, (_, i) => [`f${i}.js`, longJsFunction(`work${i}`, 8)]),
      ),
    );
    const result = await scan(folder, { config: onlyRule('SC-MET-001', { maxLines: 3 }) });
    const { fetch, calls } = fakeFetch(() => completion('ok'));

    await addAiSuggestions(result, settings({ minSeverity: 'note', maxFindings: 2 }), {
      fetch,
      env: { OPENAI_API_KEY: 'k' },
      announce: () => undefined,
    });

    expect(calls).toHaveLength(2);
  });

  it('says so and sends nothing when no finding is severe enough', async () => {
    const folder = await projects.create({ 'a.js': longJsFunction('work', 8) });
    const result = await scan(folder, { config: onlyRule('SC-MET-001', { maxLines: 3 }) });
    const { fetch, calls } = fakeFetch(() => completion('ok'));
    const announced: string[] = [];

    const same = await addAiSuggestions(result, settings({ minSeverity: 'error' }), {
      fetch,
      env: { OPENAI_API_KEY: 'k' },
      announce: (m) => announced.push(m),
    });

    expect(calls).toHaveLength(0);
    expect(same).toBe(result);
    expect(announced[0]).toContain('no finding qualified');
  });

  it('refuses before reading or sending anything when the endpoint or key is unsafe', async () => {
    const { result } = await project();
    const { fetch, calls } = fakeFetch(() => completion('ok'));

    await expect(
      addAiSuggestions(result, settings(), { fetch, env: {}, announce: () => undefined }),
    ).rejects.toThrow('OPENAI_API_KEY');
    expect(calls).toHaveLength(0);
  });

  it('skips the rules named in skipRules', async () => {
    const { result } = await project();
    const { fetch, calls } = fakeFetch(() => completion('ok'));

    await addAiSuggestions(result, settings({ minSeverity: 'note', skipRules: ['SC-MET-001'] }), {
      fetch,
      env: { OPENAI_API_KEY: 'k' },
      announce: () => undefined,
    });

    expect(calls).toHaveLength(0);
  });
});

describe('siftcode scan --ai against a service on this machine (US-080)', () => {
  let server: Server | undefined;

  afterEach(() => {
    server?.close();
    server = undefined;
  });

  async function listen(answer: string): Promise<{ endpoint: string; requests: string[] }> {
    const requests: string[] = [];
    server = createServer((request: IncomingMessage, response) => {
      let body = '';
      request.on('data', (chunk: Buffer) => (body += chunk.toString()));
      request.on('end', () => {
        requests.push(`${request.method} ${request.url} ${body}`);
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ choices: [{ message: { content: answer } }] }));
      });
    });
    const listening = server;
    await new Promise<void>((resolve) => listening.listen(0, '127.0.0.1', resolve));
    const { port } = listening.address() as AddressInfo;
    return { endpoint: `http://127.0.0.1:${port}/v1`, requests };
  }

  async function runCli(...argv: string[]) {
    let stdout = '';
    let stderr = '';
    const code = await run(argv, {
      stdout: (text) => (stdout += text),
      stderr: (text) => (stderr += text),
    });
    return { code, stdout, stderr };
  }

  const config = (ai?: object) => ({
    rules: { 'SC-MET-001': { options: { maxLines: 3 } } },
    ...(ai ? { ai } : {}),
  });

  it('prints the suggestion under the finding in every format, marked as written by a model', async () => {
    const { endpoint, requests } = await listen('Extract the loop body <b>now</b>.');
    const folder = await projects.create({
      'a.js': longJsFunction('work', 8),
      'siftcode.config.json': JSON.stringify(
        config({ provider: 'openai', model: 'local-model', endpoint, minSeverity: 'note' }),
      ),
    });

    const text = await runCli('scan', folder, '--ai');
    const markdown = await runCli('scan', folder, '--ai', '--format', 'markdown');
    const html = await runCli('scan', folder, '--ai', '--format', 'html');
    const jsonOut = await runCli('scan', folder, '--ai', '--format', 'json');
    const sarif = await runCli('scan', folder, '--ai', '--format', 'sarif');

    expect(text.code).toBe(EXIT_OK);
    expect(text.stdout).toContain('AI suggestion (local-model, not reviewed):');
    expect(text.stdout).toContain('Extract the loop body <b>now</b>.');
    expect(text.stderr).toContain('to the service on this machine (127.0.0.1:');
    expect(markdown.stdout).toContain('**AI suggestion** (local-model, not reviewed by SiftCode):');
    expect(markdown.stdout).toContain('> Extract the loop body \\<b\\>now\\</b\\>.');
    expect(html.stdout).toContain('AI suggestion (local-model, not reviewed)');
    expect(html.stdout).toContain('Extract the loop body &lt;b&gt;now&lt;/b&gt;.');
    expect(html.stdout).not.toContain('<b>now</b>');
    const report = JSON.parse(jsonOut.stdout) as { findings: { aiSuggestion: unknown }[] };
    const log = JSON.parse(sarif.stdout) as {
      runs: { results: { properties: { aiSuggestion: { model: string } } }[] }[];
    };
    expect(report.findings[0]?.aiSuggestion).toEqual({
      text: 'Extract the loop body <b>now</b>.',
      model: 'local-model',
    });
    expect(log.runs[0]?.results[0]?.properties.aiSuggestion.model).toBe('local-model');
    expect(requests.every((r) => r.startsWith('POST /v1/chat/completions '))).toBe(true);
  });

  it('keeps the exit code of the scan, whatever the service says', async () => {
    const { endpoint } = await listen('fine');
    const folder = await projects.create({
      'a.js': longJsFunction('work', 8),
      'siftcode.config.json': JSON.stringify(
        config({ provider: 'openai', model: 'm', endpoint, minSeverity: 'note' }),
      ),
    });

    const { code } = await runCli('scan', folder, '--ai', '--fail-on', 'info');

    expect(code).toBe(EXIT_FINDINGS);
  });

  it('does nothing with the network unless --ai is given, even when the config names a service', async () => {
    const { endpoint, requests } = await listen('never asked');
    const folder = await projects.create({
      'a.js': longJsFunction('work', 8),
      'siftcode.config.json': JSON.stringify(
        config({ provider: 'openai', model: 'm', endpoint, minSeverity: 'note' }),
      ),
    });

    const { stdout, stderr } = await runCli('scan', folder);

    expect(requests).toEqual([]);
    expect(stdout).not.toContain('AI suggestion');
    expect(stderr).toBe('');
  });

  it('fails with a usage error when --ai has no ai section, or an unsafe one', async () => {
    const none = await projects.create({ 'a.js': longJsFunction('work', 8) });
    const unsafe = await projects.create({
      'a.js': longJsFunction('work', 8),
      'siftcode.config.json': JSON.stringify(
        config({ provider: 'openai', model: 'm', endpoint: 'http://ai.example.com/v1' }),
      ),
    });

    const missing = await runCli('scan', none, '--ai');
    const plain = await runCli('scan', unsafe, '--ai');

    expect(missing.code).toBe(EXIT_USAGE);
    expect(missing.stderr).toContain('--ai needs an "ai" section');
    expect(plain.code).toBe(EXIT_USAGE);
    expect(plain.stderr).toContain('must use https');
  });
});
