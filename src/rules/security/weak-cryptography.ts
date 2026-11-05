import { z } from 'zod';
import type { AnalyzedFile, CallFact } from '../../languages/model/types.js';
import { defineRule } from '../define.js';
import { isTestFile } from '../shared.js';
import { cheatSheet, cwe, firstArgument, keywordArgument, owaspTop10, plain } from './shared.js';

interface Weakness {
  /** "MD5", "DES in ECB mode". */
  readonly what: string;
  readonly kind: 'hash' | 'cipher';
}

const WEAK_HASHES = new Set(['md2', 'md4', 'md5', 'sha1']);

/** Hash algorithm names in a string argument: `md5`, `SHA-1`, `sha1`. */
function weakHash(name: string): Weakness | undefined {
  const normalized = plain(name);
  return WEAK_HASHES.has(normalized) ? { what: name.toUpperCase(), kind: 'hash' } : undefined;
}

/** Cipher names in a string argument: `des-cbc`, `aes-128-ecb`, `rc4`. */
function weakCipher(name: string): Weakness | undefined {
  const lower = name.toLowerCase();
  if (/^(?:des|3des|rc4|rc2|bf|blowfish|cast5)(?:-|$)/.test(lower)) {
    return { what: name.toUpperCase(), kind: 'cipher' };
  }
  return /(?:^|-)ecb$/.test(lower)
    ? { what: `${name.toUpperCase()} (ECB mode)`, kind: 'cipher' }
    : undefined;
}

function javascriptWeakness(call: CallFact): Weakness | undefined {
  const algorithm = firstArgument(call);
  if (algorithm?.kind !== 'string') {
    return undefined;
  }
  switch (plain(call.name)) {
    case 'createhash':
    case 'createhmac':
      return weakHash(algorithm.text);
    case 'createcipher':
    case 'createcipheriv':
    case 'createdecipher':
    case 'createdecipheriv':
      return weakCipher(algorithm.text);
    default:
      return undefined;
  }
}

const PYTHON_HASHES = new Set(['hashlib.md5', 'hashlib.sha1', 'md5.new', 'sha.new']);
const PYTHON_CIPHERS = ['DES', 'DES3', 'ARC4', 'ARC2', 'Blowfish', 'CAST'].map(
  (name) => `${name}.new`,
);

function pythonHash(call: CallFact): Weakness | undefined {
  if (PYTHON_HASHES.has(call.callee)) {
    return { what: call.name.toUpperCase(), kind: 'hash' };
  }
  const algorithm = firstArgument(call);
  return call.callee === 'hashlib.new' && algorithm?.kind === 'string'
    ? weakHash(algorithm.text)
    : undefined;
}

function pythonCipher(call: CallFact): Weakness | undefined {
  if (PYTHON_CIPHERS.includes(call.callee)) {
    return { what: call.callee.split('.')[0] ?? call.name, kind: 'cipher' };
  }
  const mode = call.args[1]?.value;
  return call.callee === 'AES.new' && mode?.kind === 'name' && mode.text.endsWith('MODE_ECB')
    ? { what: 'AES in ECB mode', kind: 'cipher' }
    : undefined;
}

function pythonWeakness(call: CallFact): Weakness | undefined {
  // Python 3.9 lets a hash be marked as not used for security (a checksum): that is fine.
  const notForSecurity = keywordArgument(call, 'usedforsecurity');
  if (notForSecurity?.kind === 'boolean' && /^false$/i.test(notForSecurity.text)) {
    return undefined;
  }
  return pythonHash(call) ?? pythonCipher(call);
}

const CSHARP_HASH_TYPES = new Set(
  ['MD5CryptoServiceProvider', 'MD5Cng', 'SHA1Managed', 'SHA1CryptoServiceProvider', 'SHA1Cng'].map(
    plain,
  ),
);
const CSHARP_CIPHER_TYPES = new Set(
  ['DESCryptoServiceProvider', 'TripleDESCryptoServiceProvider', 'RC2CryptoServiceProvider'].map(
    plain,
  ),
);
const CSHARP_FACTORIES = new Map<string, Weakness>([
  ['MD5.Create', { what: 'MD5', kind: 'hash' }],
  ['SHA1.Create', { what: 'SHA1', kind: 'hash' }],
  ['DES.Create', { what: 'DES', kind: 'cipher' }],
  ['TripleDES.Create', { what: '3DES', kind: 'cipher' }],
  ['RC2.Create', { what: 'RC2', kind: 'cipher' }],
]);

function csharpWeakness(call: CallFact): Weakness | undefined {
  const type = plain(call.name);
  if (call.isNew && CSHARP_HASH_TYPES.has(type)) {
    return {
      what: call.name.replace(/CryptoServiceProvider|Managed|Cng/, '').toUpperCase(),
      kind: 'hash',
    };
  }
  if (call.isNew && CSHARP_CIPHER_TYPES.has(type)) {
    return { what: call.name.replace('CryptoServiceProvider', '').toUpperCase(), kind: 'cipher' };
  }
  const algorithm = firstArgument(call);
  if (call.callee === 'HashAlgorithm.Create' && algorithm?.kind === 'string') {
    return weakHash(algorithm.text);
  }
  return CSHARP_FACTORIES.get(call.callee);
}

function weaknessOf(file: AnalyzedFile, call: CallFact): Weakness | undefined {
  if (file.grammar === 'python') {
    return pythonWeakness(call);
  }
  return file.grammar === 'csharp' ? csharpWeakness(call) : javascriptWeakness(call);
}

export const weakCryptography = defineRule({
  meta: {
    id: 'SC-SEC-005',
    title: 'Weak hash or cipher is used',
    category: 'security',
    defaultSeverity: 'warning',
    confidence: 'medium',
    heuristic: true,
    standards: [
      cwe(327, 'Use of a Broken or Risky Cryptographic Algorithm'),
      cwe(328, 'Use of Weak Hash'),
      owaspTop10('A02', 'Cryptographic Failures', 'A02_2021-Cryptographic_Failures'),
      cheatSheet('Cryptographic Storage', 'Cryptographic_Storage_Cheat_Sheet'),
    ],
    rationale:
      'MD5 and SHA-1 can be forged (two inputs with the same hash), and DES, RC4, and ECB mode leak information about what they encrypt. Using them for passwords, signatures, or confidentiality gives a false sense of safety.',
    suggestion: {
      summary:
        'Use SHA-256 or stronger for hashing, a password hash (Argon2id, bcrypt, scrypt) for passwords, and an authenticated cipher such as AES-GCM. A checksum that is not a security measure can stay, marked as such.',
      before: "const digest = crypto.createHash('md5').update(data).digest('hex');",
      after: "const digest = crypto.createHash('sha256').update(data).digest('hex');",
    },
  },
  options: z.strictObject({}),
  check(file) {
    if (isTestFile(file.path)) {
      return [];
    }
    const hits = [];
    for (const call of file.facts.calls) {
      const weakness = weaknessOf(file, call);
      if (weakness) {
        hits.push({
          startLine: call.line,
          endLine: call.line,
          message: `${weakness.what} is a weak ${weakness.kind}: use ${weakness.kind === 'hash' ? 'SHA-256 or stronger' : 'AES-GCM'} instead.`,
          key: call.callee,
        });
      }
    }
    // C#: `aes.Mode = CipherMode.ECB;`
    for (const entry of file.facts.namedValues) {
      if (
        entry.name === 'Mode' &&
        entry.value.kind === 'name' &&
        entry.value.text.endsWith('CipherMode.ECB')
      ) {
        hits.push({
          startLine: entry.line,
          endLine: entry.line,
          message: 'ECB mode is a weak cipher mode: use AES-GCM instead.',
          key: 'CipherMode.ECB',
        });
      }
    }
    return hits;
  },
});
