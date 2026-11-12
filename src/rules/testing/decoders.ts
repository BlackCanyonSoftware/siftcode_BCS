import { z } from 'zod';
import { lineAt, readProjectCode, type CodeText } from '../code-text.js';
import { defineRepoRule } from '../define.js';
import { fuzzTesting, owaspFuzzing } from '../standards.js';
import { detectTesting } from './tooling.js';

/** Calls that read numbers out of raw bytes: the core of a binary decoder, by language. */
const BYTE_READS: readonly (readonly [extension: RegExp, reads: RegExp])[] = [
  [/\.pyi?$/i, /\bstruct\.(?:unpack|unpack_from|iter_unpack)\s*\(|\bint\.from_bytes\s*\(/g],
  [
    /\.(?:[cm]?js|jsx|tsx?)$/i,
    /\.(?:readU?Int(?:8|16|32)(?:LE|BE)?|readBigU?Int64(?:LE|BE)|readFloat(?:LE|BE)|readDouble(?:LE|BE)|getU?int(?:8|16|32)|getFloat(?:32|64)|getBigU?int64)\s*\(/gi,
  ],
  [
    /\.cs$/i,
    /\bBitConverter\.To\w+\s*\(|\bBinaryPrimitives\.Read\w+\s*\(|\.Read(?:U?Int(?:16|32|64)|Byte|Single|Double)\s*\(/g,
  ],
];

interface Decoder {
  readonly path: string;
  readonly reads: number;
  readonly firstLine: number;
}

function decoderIn(file: CodeText): Decoder | undefined {
  const pattern = BYTE_READS.find(([extension]) => extension.test(file.path))?.[1];
  const matches = pattern === undefined ? [] : [...file.text.matchAll(pattern)];
  const [first] = matches;
  return first === undefined
    ? undefined
    : { path: file.path, reads: matches.length, firstLine: lineAt(file.text, first.index) };
}

export const decoderWithoutFuzzTarget = defineRepoRule({
  meta: {
    id: 'SC-TST-003',
    title: 'Binary decoder in a project with no fuzz target',
    category: 'testing',
    defaultSeverity: 'info',
    confidence: 'low',
    heuristic: true,
    standards: [fuzzTesting, owaspFuzzing],
    rationale:
      'Code that reads numbers and lengths out of raw bytes is where truncated, oversized, and malformed input does damage: out-of-range reads, huge allocations, endless loops. Fuzzing feeds such code generated and mutated input and watches for crashes and hangs, which example tests rarely reach. The check looks for calls that read fixed-size values from bytes (struct.unpack, Buffer.readUInt32LE, BitConverter.ToInt32), so it will miss other decoders and will include some code that does not take outside input.',
    suggestion: {
      summary:
        "Add a fuzz target for the function that decodes the bytes: Atheris (Python), Jazzer.js (JavaScript), SharpFuzz (C#). One target that calls the decoder on the fuzzer's input is enough to start.",
      before: 'def decode(data: bytes): ...      # tested with two hand-written packets',
      after:
        'def test_one_input(data: bytes):\n    try:\n        decode(data)\n    except DecodeError:\n        pass                       # a clean rejection is fine; a crash or a hang is the finding',
    },
  },
  options: z.strictObject({
    /** A file must read at least this many values out of bytes to be reported. */
    minReads: z.number().int().min(1).default(3),
    /** At most this many files are reported, the ones with the most reads first. */
    maxFiles: z.number().int().min(1).default(5),
  }),
  async check(repo, options) {
    if (!repo.isRepositoryRoot || repo.sourceFileCount === 0) {
      return [];
    }
    if ((await detectTesting(repo)).fuzz) {
      return [];
    }
    const decoders = (await readProjectCode(repo))
      .flatMap((file) => decoderIn(file) ?? [])
      .filter((decoder) => decoder.reads >= options.minReads)
      .sort((a, b) => b.reads - a.reads || a.path.localeCompare(b.path))
      .slice(0, options.maxFiles);
    return decoders.map((decoder) => ({
      path: decoder.path,
      startLine: decoder.firstLine,
      endLine: decoder.firstLine,
      message: `${decoder.path} reads binary data in ${decoder.reads} places, from line ${decoder.firstLine}, and the project has no fuzz target: malformed input is what fuzzing exercises.`,
      key: 'binary-decoder',
    }));
  },
});
