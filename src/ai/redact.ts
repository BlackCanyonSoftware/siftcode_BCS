import { TOKEN_FORMATS, URL_PASSWORD } from '../rules/security/secret-formats.js';

const REDACTED = '[redacted]';

/** A name that says its value is a secret, followed by `=` or `:` and a quoted value. */
const SECRET_ASSIGNMENT =
  /(\b[\w.-]*(?:password|passwd|pwd|passphrase|secret|api[_-]?key|private[_-]?key|access[_-]?key|auth[_-]?key|token)[\w.-]*["']?\s*[:=]\s*)(["'`])([^"'`\n]{4,})\2/gi;

/** A quoted run of 24 or more letters, digits, and `+/_=-` that mixes letters and digits: a generated key. */
const RANDOM_LITERAL = /(["'`])([A-Za-z0-9+/_=-]{24,})\1/g;

const globally = (pattern: RegExp): RegExp => new RegExp(pattern.source, `${pattern.flags}g`);

/**
 * The text with anything that looks like a credential replaced by `[redacted]`: strings in a known
 * key format, a password in a URL, a quoted value given to a name like `password` or `apiKey`, and a
 * long generated-looking literal. Applied to every excerpt before it leaves the machine, as a second
 * guard after the credential rule's findings are never sent at all. It errs toward removing too
 * much: a suggestion fitted to code with a placeholder in it is still useful.
 */
export function redactSecrets(text: string): string {
  let result = text;
  for (const { pattern } of TOKEN_FORMATS) {
    result = result.replace(globally(pattern), REDACTED);
  }
  result = result.replace(globally(URL_PASSWORD), (match, password: string) =>
    match.replace(password, REDACTED),
  );
  result = result.replace(SECRET_ASSIGNMENT, (_match, head: string, quote: string) => {
    return `${head}${quote}${REDACTED}${quote}`;
  });
  return result.replace(RANDOM_LITERAL, (match, quote: string, value: string) =>
    /[A-Za-z]/.test(value) && /\d/.test(value) ? `${quote}${REDACTED}${quote}` : match,
  );
}
