import { z } from 'zod';
import type { CalledName, CodeFile } from '../../languages/model/types.js';
import type { GrammarId } from '../../languages/registry.js';
import { projectCode } from '../code-text.js';
import { defineRepoRule } from '../define.js';
import { fuzzTesting, owaspFuzzing } from '../standards.js';
import { detectTesting } from './tooling.js';

/** Whether a call reads a fixed-size number out of raw bytes: the core of a binary decoder. */
type ByteRead = (call: CalledName) => boolean;

const JAVASCRIPT_READ =
  /^(?:readU?Int(?:8|16|32)(?:LE|BE)?|readBigU?Int64(?:LE|BE)|readFloat(?:LE|BE)|readDouble(?:LE|BE)|getU?int(?:8|16|32)|getFloat(?:32|64)|getBigU?int64)$/i;

/** A method such as `buf.readUInt32LE` is a read only when it is called on something. */
const javascriptRead: ByteRead = (call) => call.receiver !== '' && JAVASCRIPT_READ.test(call.name);

/** The byte-reading calls of each language, found in the syntax: a name in a comment or string is not a call. */
const BYTE_READS: Readonly<Partial<Record<GrammarId, ByteRead>>> = {
  python: (call) =>
    /^(?:struct\.(?:unpack|unpack_from|iter_unpack)|int\.from_bytes)$/.test(call.callee),
  javascript: javascriptRead,
  typescript: javascriptRead,
  tsx: javascriptRead,
  csharp: (call) =>
    /(?:^|\.)(?:BitConverter\.To\w+|BinaryPrimitives\.Read\w+)$/.test(call.callee) ||
    (call.receiver !== '' && /^Read(?:U?Int(?:16|32|64)|Byte|Single|Double)$/.test(call.name)),
};

interface Decoder {
  readonly path: string;
  readonly reads: number;
  readonly firstLine: number;
}

function decoderIn(file: CodeFile): Decoder | undefined {
  const isRead = BYTE_READS[file.grammar];
  const reads = isRead === undefined ? [] : file.usage.calls.filter(isRead);
  return reads.length === 0
    ? undefined
    : {
        path: file.path,
        reads: reads.reduce((total, call) => total + call.count, 0),
        firstLine: Math.min(...reads.map((call) => call.line)),
      };
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
    const decoders = projectCode(repo)
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
