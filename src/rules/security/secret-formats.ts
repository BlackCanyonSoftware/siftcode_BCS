/** Strings in a recognizable credential format are reported wherever they appear. */
export const TOKEN_FORMATS: readonly { label: string; pattern: RegExp }[] = [
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
export const URL_PASSWORD = /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:([^\s@/]{3,})@/i;
