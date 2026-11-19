import type { AiSettings } from '../config/ai.js';
import type { Endpoint } from './endpoint.js';
import { SYSTEM_PROMPT } from './prompt.js';

/** The longest suggestion kept: an answer that rambles is cut, not trusted to be short. */
const MAX_ANSWER_CHARS = 3000;
const MAX_OUTPUT_TOKENS = 700;

/** A request the service refused or could not answer. `fatal` ones (a bad key) are not worth repeating. */
export class AiRequestError extends Error {
  constructor(
    message: string,
    readonly fatal: boolean,
  ) {
    super(message);
    this.name = 'AiRequestError';
  }
}

export type Fetch = typeof fetch;

interface Request {
  readonly settings: AiSettings;
  readonly endpoint: Endpoint;
  readonly prompt: string;
}

/**
 * OpenAI's own service names the limit `max_completion_tokens` and, for some models, accepts only
 * its default temperature; services that copy its API (Ollama, vLLM, LM Studio, OpenRouter) take
 * `max_tokens` and a temperature. The shapes follow the providers' documentation; they were not
 * run against the live services (ADR 0018).
 */
function openaiLimits(host: string): Record<string, number> {
  return /(?:^|\.)openai\.(?:com|azure\.com)$/.test(host)
    ? { max_completion_tokens: MAX_OUTPUT_TOKENS }
    : { max_tokens: MAX_OUTPUT_TOKENS, temperature: 0.2 };
}

function body({ settings, endpoint, prompt }: Request): string {
  if (settings.provider === 'anthropic') {
    return JSON.stringify({
      model: settings.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });
  }
  return JSON.stringify({
    model: settings.model,
    ...openaiLimits(endpoint.host),
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
  });
}

/** The text of the answer in either provider's response, or undefined if it has none. */
function answerOf(provider: AiSettings['provider'], json: unknown): string | undefined {
  const root = json as Record<string, unknown> | null;
  if (provider === 'anthropic') {
    const content = root?.content;
    const first: unknown = Array.isArray(content) ? content[0] : undefined;
    const text = (first as Record<string, unknown> | undefined)?.text;
    return typeof text === 'string' ? text : undefined;
  }
  const choices = root?.choices;
  const first: unknown = Array.isArray(choices) ? choices[0] : undefined;
  const message = (first as Record<string, unknown> | undefined)?.message;
  const text = (message as Record<string, unknown> | undefined)?.content;
  return typeof text === 'string' ? text : undefined;
}

/** Control characters out, length capped: the answer is untrusted text and is shown as text. */
function clean(text: string): string {
  // eslint-disable-next-line no-control-regex -- removing control characters is the point
  const printable = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return printable.length > MAX_ANSWER_CHARS
    ? `${printable.slice(0, MAX_ANSWER_CHARS)}...`
    : printable;
}

/** What went wrong, without the key even if the service echoed it back. */
function safe(message: string, endpoint: Endpoint): string {
  let text = message;
  for (const value of Object.values(endpoint.headers)) {
    const secret = value.replace(/^Bearer /, '');
    if (secret.length > 8) {
      text = text.split(secret).join('[key]');
    }
  }
  return text.slice(0, 300);
}

/**
 * Asks the service for one suggestion. Rejects with an `AiRequestError` for a refusal (marked fatal
 * for 401 and 403, where the next request would fail the same way), a timeout, an answer that is
 * not JSON, or one with no text.
 */
export async function askModel(request: Request, fetcher: Fetch): Promise<string> {
  const { settings, endpoint } = request;
  let response: Response;
  try {
    response = await fetcher(endpoint.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...endpoint.headers },
      body: body(request),
      signal: AbortSignal.timeout(settings.timeoutSeconds * 1000),
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new AiRequestError(
      `the request to ${endpoint.host} failed: ${safe(reason, endpoint)}`,
      false,
    );
  }
  if (!response.ok) {
    const fatal = response.status === 401 || response.status === 403;
    throw new AiRequestError(`${endpoint.host} answered HTTP ${response.status}`, fatal);
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new AiRequestError(`${endpoint.host} did not answer with JSON`, false);
  }
  const text = answerOf(settings.provider, json);
  const cleaned = text === undefined ? '' : clean(text);
  if (cleaned === '') {
    throw new AiRequestError(`${endpoint.host} answered with no text`, false);
  }
  return cleaned;
}
