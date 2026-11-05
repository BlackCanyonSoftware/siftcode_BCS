import { z } from 'zod';
import type { AnalyzedFile } from '../../languages/model/types.js';
import type { Severity } from '../../core/severity.js';
import { defineRule } from '../define.js';
import { isTestFile } from '../shared.js';
import { cheatSheet, cwe, owaspTop10 } from './shared.js';

/** Strings in a recognizable credential format are reported wherever they appear. */
const TOKEN_FORMATS: readonly { label: string; pattern: RegExp }[] = [
  { label: 'an AWS access key ID', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  {
    label: 'a GitHub token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/,
  },
  { label: 'a Slack token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { label: 'a Stripe live key', pattern: /\b[sr]k_live_[A-Za-z0-9]{20,}\b/ },
  { label: 'a Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { label: 'a private key', pattern: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY(?: BLOCK)?-----/ },
];

/** `scheme://user:password@host`: the password part is captured. */
const URL_PASSWORD = /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:([^\s@/]{3,})@/i;

/** Words in a name that mean its value is a secret. */
const SECRET_WORDS = new Set(['password', 'passwd', 'pwd', 'passphrase', 'secret']);

/**
 * "token" is ambiguous (an authentication token, or a token of a language being parsed), so it
 * needs a value that looks randomly generated before it counts.
 */
const WEAK_WORDS = new Set(['token']);
const SECRET_COMPOUNDS = [
  'apikey',
  'secretkey',
  'privatekey',
  'accesskey',
  'authkey',
  'clientsecret',
];

/** A last word that says the value describes a credential rather than being one (`tokenUrl`). */
const NOT_A_VALUE = new Set([
  'name',
  'type',
  'field',
  'label',
  'id',
  'url',
  'uri',
  'path',
  'file',
  'length',
  'regex',
  'pattern',
  'hint',
  'placeholder',
  'prefix',
  'suffix',
  'header',
  'param',
  'params',
  'env',
  'var',
  'config',
  'policy',
  'format',
  'algorithm',
  'alg',
  'endpoint',
  'provider',
  'manager',
  'service',
]);

const PLACEHOLDER =
  /^(?:x+|\*+|\.+|-+|_+|<[^>]*>|\{\{.*\}\}|\$\{.*\}|%[^%]*%|\$[A-Za-z_]+|change[-_ ]?me|replace[-_ ]?me|your[-_ ].*|example.*|sample.*|dummy.*|placeholder.*|redacted|secret|pass|password|passwd|token|null|passwd|token|null|none|undefined|todo|fixme|test|testing|admin)$/i;

/** `apiKey` -> `api key`, `DB_PASSWORD` -> `db password`. */
function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word !== '')
    .map((word) => word.toLowerCase());
}

/** How strongly a name says its value is a secret: `strong`, `weak` (needs a random-looking value), or no. */
export function secretStrength(name: string): 'strong' | 'weak' | undefined {
  const parts = words(name);
  const last = parts.at(-1);
  if (last === undefined || NOT_A_VALUE.has(last)) {
    return undefined;
  }
  const joined = parts.join('');
  if (
    parts.some((part) => SECRET_WORDS.has(part)) ||
    SECRET_COMPOUNDS.some((c) => joined.includes(c))
  ) {
    return 'strong';
  }
  return parts.some((part) => WEAK_WORDS.has(part)) ? 'weak' : undefined;
}

export function isSecretName(name: string): boolean {
  return secretStrength(name) !== undefined;
}

/** Shannon entropy in bits per character: low for `aaaaaaaa`, higher for mixed text. */
export function entropy(text: string): number {
  const counts = new Map<string, number>();
  for (const char of text) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  let bits = 0;
  for (const count of counts.values()) {
    const share = count / text.length;
    bits -= share * Math.log2(share);
  }
  return bits;
}

/** Whether a string assigned to a secret-looking name could really be the secret. */
export function looksLikeSecret(value: string, minLength: number): boolean {
  return (
    value.length >= minLength &&
    !/\s/.test(value) &&
    !PLACEHOLDER.test(value) &&
    !/^[A-Z][A-Z0-9_]{3,}$/.test(value) && // the name of an environment variable
    !/^[a-z][a-z0-9+.-]*:\/\/[^\s@]*$/i.test(value) && // a URL without credentials
    entropy(value) >= 2.5
  );
}

/** A value that looks randomly generated: long, mixing letters and digits, and not repetitive. */
export function looksRandom(value: string): boolean {
  return (
    value.length >= 16 &&
    /[A-Za-z]/.test(value) &&
    /\d/.test(value) &&
    entropy(value) >= 3.5 &&
    looksLikeSecret(value, 16)
  );
}

export const hardcodedCredentials = defineRule({
  meta: {
    id: 'SC-SEC-001',
    title: 'Credential is written into the code',
    category: 'security',
    defaultSeverity: 'warning',
    confidence: 'medium',
    heuristic: true,
    standards: [
      cwe(798, 'Use of Hard-coded Credentials'),
      owaspTop10(
        'A07',
        'Identification and Authentication Failures',
        'A07_2021-Identification_and_Authentication_Failures',
      ),
      cheatSheet('Secrets Management', 'Secrets_Management_Cheat_Sheet'),
    ],
    rationale:
      'A credential in source code is copied into every clone, build, and log of the repository, cannot be rotated without a code change, and stays in version history after it is removed.',
    suggestion: {
      summary:
        'Remove the credential from the code and rotate it (it must be treated as exposed). Read it from the environment or a secrets manager at run time.',
      before: "const apiKey = 'sk_live_...';",
      after: [
        'const apiKey = process.env.PAYMENT_API_KEY;',
        "if (!apiKey) throw new Error('PAYMENT_API_KEY is not set');",
      ].join('\n'),
    },
  },
  options: z.strictObject({
    /** Shortest value that is judged to be a secret when it is assigned to a secret-looking name. */
    minLength: z.number().int().positive().default(8),
  }),
  check(file, { minLength }) {
    // Known credential formats are reported anywhere, including in test code: a real key is a real
    // key. A secret-looking name given a constant string is only a guess, and noisy in test code.
    return [...formatHits(file), ...(isTestFile(file.path) ? [] : nameHits(file, minLength))];
  },
});

/** Strings in a recognizable credential format, and URLs with a password in them. */
function formatHits(file: AnalyzedFile) {
  return file.facts.strings.flatMap((entry) => {
    const format = TOKEN_FORMATS.find((candidate) => candidate.pattern.test(entry.value));
    if (format) {
      const message = `A string that looks like ${format.label} is written into the code.`;
      return [hit(entry.line, message, format.label, 'error')];
    }
    const urlPassword = URL_PASSWORD.exec(entry.value)?.[1];
    if (urlPassword !== undefined && looksLikeSecret(urlPassword, 4)) {
      const message = 'A URL with a password in it is written into the code.';
      return [hit(entry.line, message, 'url-password', 'warning')];
    }
    return [];
  });
}

/** Constant strings given to a name that says it holds a secret. */
function nameHits(file: AnalyzedFile, minLength: number) {
  return file.facts.namedValues.flatMap((entry) => {
    const strength = entry.value.kind === 'string' ? secretStrength(entry.name) : undefined;
    const value = entry.value.text;
    const isSecret =
      strength === 'strong'
        ? looksLikeSecret(value, minLength)
        : strength === 'weak' && looksRandom(value);
    const message = `"${entry.name}" is given a fixed value that looks like a credential.`;
    return isSecret ? [hit(entry.line, message, `name:${entry.target}`, 'warning')] : [];
  });
}

/** A finding that never contains the credential itself, only where it is. */
function hit(line: number, message: string, key: string, severity: Severity) {
  return { startLine: line, endLine: line, message, key, severity };
}
