import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

const outcomeOf = async (grammar: GrammarId, source: string) =>
  (await parser.parse(grammar, source)).outcome;

describe('SyntaxParser (US-060, US-061, US-062)', () => {
  it.each<[GrammarId, string]>([
    ['javascript', 'const add = (a, b) => a + b;\nexport default add;\n'],
    ['typescript', 'export function add(a: number, b: number): number { return a + b; }\n'],
    ['tsx', 'export const Title = ({ text }: { text: string }) => <h1>{text}</h1>;\n'],
    ['python', 'def add(a, b):\n    return a + b\n'],
    ['csharp', 'class Calculator { public int Add(int a, int b) => a + b; }\n'],
  ])('parses valid %s code without errors', async (grammar, source) => {
    expect(await outcomeOf(grammar, source)).toBe('ok');
  });

  it.each<[GrammarId, string]>([
    ['javascript', 'function (: {\n'],
    ['typescript', 'let x: = ;\n'],
    ['python', 'def broken(:\n    return (1 +\n'],
    ['csharp', 'class { int ; }\n'],
  ])('reports a syntax error for broken %s code', async (grammar, source) => {
    expect(await outcomeOf(grammar, source)).toBe('syntax-error');
  });

  it('keeps working after parsing broken code (US-071)', async () => {
    await parser.parse('python', 'def broken(:\n');

    expect(await outcomeOf('python', 'x = 1\n')).toBe('ok');
  });
});

describe('function and method extraction', () => {
  const unitsOf = async (grammar: GrammarId, source: string) =>
    (await parseOk(parser, grammar, source)).units.map(({ kind, name }) => `${kind}:${name}`);

  it('names declared functions, assigned arrows, and object and class members in JavaScript', async () => {
    const source = [
      'function declared() {}',
      'const assigned = () => {};',
      'const expression = function () {};',
      'const object = { shorthand() {}, keyed: function () {}, arrow: () => 1 };',
      'class Box { method() {} static create() {} field = () => 1; }',
      'a.b = function () {};',
      'function* generator() {}',
    ].join('\n');

    expect(await unitsOf('javascript', source)).toEqual([
      'function:declared',
      'function:assigned',
      'function:expression',
      'method:shorthand',
      'function:keyed',
      'function:arrow',
      'method:method',
      'method:create',
      'function:field',
      'function:a.b',
      'function:generator',
    ]);
  });

  it('skips anonymous callbacks, lambdas, and bodiless signatures', async () => {
    expect(await unitsOf('javascript', '[1].map((x) => x);\nrun(function () {});')).toEqual([]);
    expect(await unitsOf('python', 'square = lambda x: x * x\n')).toEqual([]);
    expect(
      await unitsOf('typescript', 'function f(x: string): void;\nfunction f(x: number): void;\n'),
    ).toEqual([]);
  });

  it('treats a function in a Python class body as a method', async () => {
    const source = 'def free():\n    pass\n\nclass K:\n    def member(self):\n        pass\n';

    expect(await unitsOf('python', source)).toEqual(['function:free', 'method:member']);
  });

  it('finds C# methods, constructors, local functions, and operators, but not property accessors', async () => {
    const source = [
      'class V {',
      '  public V() {}',
      '  public int M() { int Local() => 1; return Local(); }',
      '  public int P { get { return 1; } set { } }',
      '  public static V operator +(V a, V b) => a;',
      '}',
    ].join('\n');

    expect(await unitsOf('csharp', source)).toEqual([
      'method:V',
      'method:M',
      'function:Local',
      'method:operator +',
    ]);
  });

  it('records 1-based inclusive line numbers', async () => {
    const { units } = await parseOk(parser, 'python', '\n\ndef spaced():\n    return 1\n');

    expect(
      units.map(({ kind, name, startLine, endLine }) => ({ kind, name, startLine, endLine })),
    ).toEqual([{ kind: 'function', name: 'spaced', startLine: 3, endLine: 4 }]);
  });
});
