import type { AiSettings } from '../config/ai.js';
import { UsageError } from '../shared/errors.js';

/** Where a request goes and how it is authenticated. */
export interface Endpoint {
  /** The full URL of the request. */
  readonly url: string;
  /** The host, for the notice that tells the user where code is sent. */
  readonly host: string;
  /** True when the service runs on this machine, so no code leaves it. */
  readonly local: boolean;
  /** Headers that carry the API key; empty when there is none. They are never printed. */
  readonly headers: Readonly<Record<string, string>>;
}

const DEFAULT_BASE = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
} as const;

const DEFAULT_KEY_VARIABLE = { openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' } as const;

/** Names for this machine: the only place a request may go without TLS. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function parseBase(settings: AiSettings): URL {
  const base = settings.endpoint ?? DEFAULT_BASE[settings.provider];
  try {
    return new URL(base);
  } catch {
    throw new UsageError(`The "ai.endpoint" setting is not a URL: ${base}`);
  }
}

/**
 * Works out the request URL and headers from the settings and the environment, and refuses what
 * would put a key or code at risk: a service that is not on this machine must use https, a key must
 * come from an environment variable, and one is required unless the service is local.
 */
export function resolveEndpoint(settings: AiSettings, env: NodeJS.ProcessEnv): Endpoint {
  const base = parseBase(settings);
  const local = LOCAL_HOSTS.has(base.hostname.toLowerCase());
  requireTransportThatProtects(base, local);
  const key = keyFor(settings, env, local);
  return {
    url: requestUrl(settings.provider, base),
    host: base.host,
    local,
    headers: authHeaders(settings.provider, key),
  };
}

/** Plain http is for this machine only: anywhere else the key and the code would cross in the clear. */
function requireTransportThatProtects(base: URL, local: boolean): void {
  if (base.protocol !== 'https:' && !(local && base.protocol === 'http:')) {
    throw new UsageError(
      `The AI endpoint ${base.origin} is not on this machine, so it must use https: code and the key would cross the network unprotected.`,
    );
  }
}

/** The key from the environment variable, which a service on another machine must have. */
function keyFor(settings: AiSettings, env: NodeJS.ProcessEnv, local: boolean): string | undefined {
  const variable = settings.apiKeyEnv ?? DEFAULT_KEY_VARIABLE[settings.provider];
  const key = env[variable];
  if ((key === undefined || key === '') && !local) {
    throw new UsageError(
      `No API key: set the environment variable ${variable} (the key is never read from the config file).`,
    );
  }
  return key;
}

/** The base URL with the provider's path added, unless the base already ends in `/v1`. */
function requestUrl(provider: AiSettings['provider'], base: URL): string {
  const trimmed = base.href.replace(/\/+$/, '');
  if (provider === 'openai') {
    return `${trimmed}/chat/completions`;
  }
  return trimmed.endsWith('/v1') ? `${trimmed}/messages` : `${trimmed}/v1/messages`;
}

function authHeaders(
  provider: AiSettings['provider'],
  key: string | undefined,
): Record<string, string> {
  const hasKey = key !== undefined && key !== '';
  if (provider === 'openai') {
    return hasKey ? { authorization: `Bearer ${key}` } : {};
  }
  return { 'anthropic-version': '2023-06-01', ...(hasKey ? { 'x-api-key': key } : {}) };
}
