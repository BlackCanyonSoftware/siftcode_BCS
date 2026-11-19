import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { summarizeUsage } from '../../src/languages/facts/usage.js';
import { SyntaxParser } from '../../src/languages/parser.js';
import type { GrammarId } from '../../src/languages/registry.js';
import { parseOk } from '../helpers/parse.js';

let parser: SyntaxParser;

beforeAll(async () => {
  parser = await SyntaxParser.create();
});

afterAll(() => {
  parser.dispose();
});

async function usageOf(grammar: GrammarId, source: string) {
  return summarizeUsage((await parseOk(parser, grammar, source)).facts);
}

describe('file usage summary (US-051, US-052)', () => {
  it('counts each callee once, with the line of its first call, sorted by callee', async () => {
    const usage = await usageOf(
      'python',
      [
        'import struct',
        'b = 1',
        'struct.unpack("<I", d)',
        'a()',
        'struct.unpack("<I", e)',
        '',
      ].join('\n'),
    );

    expect(usage.calls.map(({ callee, line, count }) => ({ callee, line, count }))).toEqual([
      { callee: 'a', line: 4, count: 1 },
      { callee: 'struct.unpack', line: 3, count: 2 },
    ]);
  });

  it('lists every import with its line, in file order, including imports inside functions', async () => {
    const usage = await usageOf(
      'python',
      'import os\nimport json\nimport os\n\ndef f():\n    import urllib.request\n',
    );

    expect(usage.imports.map(({ module, line }) => [module, line])).toEqual([
      ['os', 1],
      ['json', 2],
      ['os', 3],
      ['urllib.request', 6],
    ]);
  });

  it('lists the namespaces a C# file declares, once each, sorted, and none for other languages', async () => {
    const block = await usageOf(
      'csharp',
      'namespace B.Two { class X { } }\nnamespace A.One { }\nnamespace A.One { }\n',
    );
    const scoped = await usageOf('csharp', 'namespace Shop.Orders;\nclass Y { }\n');
    const other = await usageOf('typescript', 'export const a = 1;\n');

    expect(block.namespaces).toEqual(['A.One', 'B.Two']);
    expect(scoped.namespaces).toEqual(['Shop.Orders']);
    expect(other.namespaces).toEqual([]);
  });

  it('keeps the receiver, the name, and whether the call creates an object', async () => {
    const usage = await usageOf(
      'csharp',
      'class A { void M() { var c = new HttpClient(); c.Get(); } }\n',
    );

    expect(usage.calls).toMatchObject([
      { callee: 'HttpClient', name: 'HttpClient', receiver: '', isNew: true },
      { callee: 'c.Get', name: 'Get', receiver: 'c', isNew: false },
    ]);
  });

  it('leaves out names that appear only in comments and strings', async () => {
    const usage = await usageOf('typescript', "// fetch('/x')\nconst s = \"fetch('/y')\";\n");

    expect(usage.calls).toEqual([]);
  });
});
