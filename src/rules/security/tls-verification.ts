import { z } from 'zod';
import type { AnalyzedFile, NamedValueFact } from '../../languages/model/types.js';
import { defineRule } from '../define.js';
import { isTestFile } from '../shared.js';
import { cheatSheet, cwe, owaspTop10, plain } from './shared.js';

/** Says what an entry does to certificate checking, or nothing if it does nothing of the kind. */
type Check = (entry: NamedValueFact, file: AnalyzedFile) => string | undefined;

const isFalse = (entry: NamedValueFact): boolean =>
  entry.value.kind === 'boolean' && /^false$/i.test(entry.value.text);

const whenFalse: Check = (entry) => (isFalse(entry) ? `${entry.name} is set to false` : undefined);

const acceptsEveryCertificate: Check = (entry) => {
  const text = entry.value.text;
  const accepts =
    /(=>\s*true\b|return\s+true\b)/.test(text) ||
    text.endsWith('DangerousAcceptAnyServerCertificateValidator');
  return accepts ? `${entry.name} accepts every certificate` : undefined;
};

/** Settings that switch certificate checking off, by the name of the setting (see `plain`). */
const CHECKS = new Map<string, Check>([
  ['rejectunauthorized', whenFalse],
  ['strictssl', whenFalse],
  [
    'nodetlsrejectunauthorized',
    (entry) =>
      entry.value.kind === 'string' && entry.value.text === '0'
        ? 'NODE_TLS_REJECT_UNAUTHORIZED is set to 0'
        : undefined,
  ],
  ['checkhostname', (entry) => (isFalse(entry) ? 'check_hostname is set to False' : undefined)],
  [
    'verifymode',
    (entry) =>
      entry.value.kind === 'name' && entry.value.text.endsWith('CERT_NONE')
        ? 'verify_mode is set to CERT_NONE'
        : undefined,
  ],
  [
    // Only Python's `verify=False` (requests, httpx); other languages use `verify` for other things.
    'verify',
    (entry, file) =>
      file.grammar === 'python' && isFalse(entry) ? 'verify is set to False' : undefined,
  ],
  ['servercertificatevalidationcallback', acceptsEveryCertificate],
  ['servercertificatecustomvalidationcallback', acceptsEveryCertificate],
]);

/** `ssl._create_default_https_context = ssl._create_unverified_context` */
const aliasesUnverifiedContext: Check = (entry) =>
  entry.value.text.endsWith('_create_unverified_context')
    ? 'an unverified SSL context is used'
    : undefined;

function certificateCheckSwitchedOff(
  file: AnalyzedFile,
  entry: NamedValueFact,
): string | undefined {
  const check = CHECKS.get(plain(entry.name)) ?? aliasesUnverifiedContext;
  return check(entry, file);
}

export const tlsVerification = defineRule({
  meta: {
    id: 'SC-SEC-007',
    title: 'Certificate verification is switched off',
    category: 'security',
    defaultSeverity: 'warning',
    confidence: 'medium',
    heuristic: true,
    standards: [
      cwe(295, 'Improper Certificate Validation'),
      owaspTop10(
        'A07',
        'Identification and Authentication Failures',
        'A07_2021-Identification_and_Authentication_Failures',
      ),
      cheatSheet('Transport Layer Security', 'Transport_Layer_Security_Cheat_Sheet'),
    ],
    rationale:
      'Without certificate checks an encrypted connection can still be to the wrong party: anyone on the network path can impersonate the server and read or change everything that is sent.',
    suggestion: {
      summary:
        'Leave certificate verification on. If a server uses a private certificate authority, add that authority to the trusted set instead of disabling the check.',
      before: 'requests.get(url, verify=False)',
      after: "requests.get(url, verify='/path/to/company-ca.pem')",
    },
  },
  options: z.strictObject({}),
  check(file) {
    if (isTestFile(file.path)) {
      return [];
    }
    const hits = file.facts.namedValues.flatMap((entry) => {
      const reason = certificateCheckSwitchedOff(file, entry);
      return reason === undefined
        ? []
        : [
            {
              startLine: entry.line,
              endLine: entry.line,
              message: `Certificate verification is switched off: ${reason}.`,
              key: entry.target,
            },
          ];
    });
    // `ssl._create_unverified_context()` called directly.
    for (const call of file.facts.calls) {
      if (call.name.endsWith('_create_unverified_context')) {
        hits.push({
          startLine: call.line,
          endLine: call.line,
          message: 'Certificate verification is switched off: an unverified SSL context is used.',
          key: call.callee,
        });
      }
    }
    return hits;
  },
});
