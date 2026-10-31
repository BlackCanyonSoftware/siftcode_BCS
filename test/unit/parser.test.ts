import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SyntaxParser } from '../../src/languages/parser.js';
import type { GrammarId } from '../../src/languages/registry.js';

let parser: SyntaxParser;

beforeAll(async () => {
  parser = await SyntaxParser.create();
});

afterAll(() => {
  parser.dispose();
});

describe('SyntaxParser (US-060, US-061, US-062)', () => {
  it.each<[GrammarId, string]>([
    ['javascript', 'const add = (a, b) => a + b;\nexport default add;\n'],
    ['typescript', 'export function add(a: number, b: number): number { return a + b; }\n'],
    ['tsx', 'export const Title = ({ text }: { text: string }) => <h1>{text}</h1>;\n'],
    ['python', 'def add(a, b):\n    return a + b\n'],
    ['csharp', 'class Calculator { public int Add(int a, int b) => a + b; }\n'],
  ])('parses valid %s code without errors', async (grammar, source) => {
    expect(await parser.parse(grammar, source)).toBe('ok');
  });

  it.each<[GrammarId, string]>([
    ['javascript', 'function (: {\n'],
    ['typescript', 'let x: = ;\n'],
    ['python', 'def broken(:\n    return (1 +\n'],
    ['csharp', 'class { int ; }\n'],
  ])('reports a syntax error for broken %s code', async (grammar, source) => {
    expect(await parser.parse(grammar, source)).toBe('syntax-error');
  });

  it('keeps working after parsing broken code (US-071)', async () => {
    await parser.parse('python', 'def broken(:\n');

    expect(await parser.parse('python', 'x = 1\n')).toBe('ok');
  });
});
