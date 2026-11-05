import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scan } from '../../src/core/scan.js';
import { SyntaxParser } from '../../src/languages/parser.js';
import type { GrammarId } from '../../src/languages/registry.js';
import { fixture } from '../helpers/project.js';
import { parseOk } from '../helpers/parse.js';

let parser: SyntaxParser;

beforeAll(async () => {
  parser = await SyntaxParser.create();
});

afterAll(() => {
  parser.dispose();
});

/** Metrics of the first function or method in `source`. */
async function firstUnit(grammar: GrammarId, source: string) {
  const { units } = await parseOk(parser, grammar, source);
  const [unit] = units;
  if (!unit) {
    throw new Error(`No function found in:\n${source}`);
  }
  return unit.metrics;
}

const js = (body: string) => `function f(a, b, c, xs) {\n${body}\n}\n`;
const py = (body: string) =>
  `def f(a, b, c, xs):\n${body
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n')}\n`;
const cs = (body: string) =>
  `class K {\n  void M(int a, int b, int c, int[] xs) {\n${body}\n  }\n}\n`;

describe('the same program gives the same measures in every language (US-010 to US-012, US-060 to US-062)', () => {
  const onlyUnit = async (file: string) => {
    const result = await scan(fixture(`metrics/${file}`));
    const units = result.files.flatMap((f) => f.units);
    expect(units).toHaveLength(1);
    return units[0]?.metrics;
  };

  it.each(['classify.js', 'classify.ts', 'classify.py', 'Classify.cs'])(
    '%s: cyclomatic complexity 11, two parameters, nesting 2',
    async (file) => {
      const metrics = await onlyUnit(file);

      expect(metrics?.cyclomatic).toBe(11);
      expect(metrics?.parameters).toBe(2);
      expect(metrics?.maxNesting).toBe(2);
    },
  );

  it.each(['deep.js', 'deep.ts', 'deep.py', 'Deep.cs'])(
    '%s: nesting 4, cyclomatic complexity 5, three parameters',
    async (file) => {
      const metrics = await onlyUnit(file);

      expect(metrics?.maxNesting).toBe(4);
      expect(metrics?.cyclomatic).toBe(5);
      expect(metrics?.parameters).toBe(3);
    },
  );

  it.each(['many.js', 'many.ts', 'many.py', 'Many.cs'])('%s: six parameters', async (file) => {
    expect((await onlyUnit(file))?.parameters).toBe(6);
  });

  it('gives identical figures on every run (US-011)', async () => {
    const first = await scan(fixture('metrics'));
    const second = await scan(fixture('metrics'));

    expect(second.files).toEqual(first.files);
  });
});

describe('cyclomatic complexity: what adds a path (US-010)', () => {
  it.each<[string, GrammarId, string, number]>([
    ['nothing', 'javascript', js(''), 1],
    ['if', 'javascript', js('if (a) {}'), 2],
    ['if / else', 'javascript', js('if (a) {} else {}'), 2],
    ['if / else if', 'javascript', js('if (a) {} else if (b) {}'), 3],
    ['for', 'javascript', js('for (;;) {}'), 2],
    ['for...of', 'javascript', js('for (const x of xs) {}'), 2],
    ['for...in', 'javascript', js('for (const k in a) {}'), 2],
    ['while', 'javascript', js('while (a) {}'), 2],
    ['do...while', 'javascript', js('do {} while (a);'), 2],
    [
      'two cases and default',
      'javascript',
      js('switch (a) { case 1: break; case 2: break; default: break; }'),
      3,
    ],
    ['try / catch / finally', 'javascript', js('try {} catch (e) {} finally {}'), 2],
    ['ternary', 'javascript', js('return a ? b : c;'), 2],
    ['&&', 'javascript', js('return a && b;'), 2],
    ['||', 'javascript', js('return a || b;'), 2],
    ['??', 'javascript', js('return a ?? b;'), 2],
    ['&& and || together', 'javascript', js('return a && b || c;'), 3],
    ['logical assignment', 'javascript', js('a ||= b; a &&= b; a ??= b;'), 4],
    ['arithmetic is not a branch', 'javascript', js('return a + b - c * a;'), 1],
    [
      'a callback counts toward the function around it',
      'javascript',
      js('xs.forEach((x) => { if (x) {} });'),
      2,
    ],
    ['if', 'typescript', 'function f(a: boolean): void { if (a) {} }', 2],
    ['pass', 'python', py('pass'), 1],
    ['if', 'python', py('if a:\n    pass'), 2],
    ['if / elif / else', 'python', py('if a:\n    pass\nelif b:\n    pass\nelse:\n    pass'), 3],
    ['for', 'python', py('for x in xs:\n    pass'), 2],
    ['while', 'python', py('while a:\n    pass'), 2],
    [
      'try / two excepts / finally',
      'python',
      py('try:\n    pass\nexcept A:\n    pass\nexcept B:\n    pass\nfinally:\n    pass'),
      3,
    ],
    ['conditional expression', 'python', py('return 1 if a else 2'), 2],
    ['and / or', 'python', py('return a and b or c'), 3],
    ['comprehension with a condition', 'python', py('return [x for x in xs if x]'), 3],
    [
      'match: two cases and a wildcard',
      'python',
      py(
        'match a:\n    case 1:\n        pass\n    case 2:\n        pass\n    case _:\n        pass',
      ),
      3,
    ],
    [
      'match: a guard adds a path, the wildcard does not',
      'python',
      py('match a:\n    case 1:\n        pass\n    case _ if b:\n        pass'),
      3,
    ],
    ['nothing', 'csharp', cs(''), 1],
    ['if', 'csharp', cs('if (a > 0) {}'), 2],
    ['if / else if', 'csharp', cs('if (a > 0) {} else if (b > 0) {}'), 3],
    ['for', 'csharp', cs('for (;;) {}'), 2],
    ['foreach', 'csharp', cs('foreach (var x in xs) {}'), 2],
    ['while', 'csharp', cs('while (a > 0) {}'), 2],
    ['do...while', 'csharp', cs('do {} while (a > 0);'), 2],
    [
      'switch: each case label counts, default does not',
      'csharp',
      cs('switch (a) { case 1: case 2: break; default: break; }'),
      3,
    ],
    [
      'switch expression: arms count, the discard does not',
      'csharp',
      cs('var v = a switch { 1 => 2, 3 => 4, _ => 0 };'),
      3,
    ],
    ['two catches', 'csharp', cs('try {} catch (Exception) {} catch {}'), 3],
    ['ternary', 'csharp', cs('var v = a > 0 ? b : c;'), 2],
    ['&&', 'csharp', cs('var v = a > 0 && b > 0;'), 2],
    ['||', 'csharp', cs('var v = a > 0 || b > 0;'), 2],
    ['??', 'csharp', cs('string v = null ?? "x";'), 2],
  ])('%s (%s)', async (_name, grammar, source, expected) => {
    expect((await firstUnit(grammar, source)).cyclomatic).toBe(expected);
  });

  it('counts a nested function toward the function around it, and reports it as well', async () => {
    const source = js('function inner() { if (a) {} }\nreturn inner;');

    const { units } = await parseOk(parser, 'javascript', source);

    expect(units.map((u) => [u.name, u.metrics.cyclomatic])).toEqual([
      ['f', 2],
      ['inner', 2],
    ]);
  });
});

describe('nesting depth (US-012)', () => {
  it.each<[string, GrammarId, string, number]>([
    ['no control structures', 'javascript', js('return a;'), 0],
    ['three levels of if', 'javascript', js('if (a) { if (b) { if (c) {} } }'), 3],
    [
      'an else-if chain is one level',
      'javascript',
      js('if (a) {} else if (b) {} else if (c) {} else {}'),
      1,
    ],
    [
      'else-if branches nest independently',
      'javascript',
      js('if (a) { if (b) {} } else if (c) { if (a) {} }'),
      2,
    ],
    ['loop, try, then if', 'javascript', js('for (;;) { try { } catch (e) { if (a) {} } }'), 3],
    ['switch with an if inside', 'javascript', js('switch (a) { case 1: if (b) {} }'), 2],
    ['two levels of if', 'python', py('if a:\n    if b:\n        pass'), 2],
    [
      'an elif chain is one level',
      'python',
      py('if a:\n    pass\nelif b:\n    pass\nelif c:\n    pass'),
      1,
    ],
    [
      'loop with try',
      'python',
      py('for x in xs:\n    try:\n        pass\n    except E:\n        pass'),
      2,
    ],
    [
      'match with an if inside',
      'python',
      py('match a:\n    case 1:\n        if b:\n            pass'),
      2,
    ],
    [
      'an else-if chain is one level',
      'csharp',
      cs('if (a > 0) {} else if (b > 0) {} else if (c > 0) {}'),
      1,
    ],
    [
      'else-if branches nest independently',
      'csharp',
      cs('if (a > 0) { if (b > 0) {} } else if (c > 0) { if (a > 0) {} }'),
      2,
    ],
    [
      'an if in the body of an if, without braces, nests',
      'csharp',
      cs('if (a > 0) if (b > 0) {}'),
      2,
    ],
  ])('%s (%s)', async (_name, grammar, source, expected) => {
    expect((await firstUnit(grammar, source)).maxNesting).toBe(expected);
  });
});

describe('parameter count (US-012)', () => {
  const countOf = async (grammar: GrammarId, source: string, name: string) => {
    const { units } = await parseOk(parser, grammar, source);
    return units.find((unit) => unit.name === name)?.metrics.parameters;
  };

  it.each<[string, GrammarId, string, string, number]>([
    ['none', 'javascript', 'function f() {}', 'f', 0],
    ['default and rest', 'javascript', 'function f(a, b = 1, ...rest) {}', 'f', 3],
    ['destructured', 'javascript', 'function f({ a, b }, [c]) {}', 'f', 2],
    ['a bare arrow parameter', 'javascript', 'const f = (x) => x;', 'f', 1],
    ['an arrow without parentheses', 'javascript', 'const f = x => x;', 'f', 1],
    ['two arrow parameters', 'javascript', 'const f = (x, y) => x;', 'f', 2],
    [
      'a parameter named self is counted in JavaScript',
      'javascript',
      'class K { m(self, a) {} }',
      'm',
      2,
    ],
    [
      'TypeScript: the this pseudo-parameter is not counted',
      'typescript',
      'function f(this: Foo, a: number, b?: string, c = 1) {}',
      'f',
      3,
    ],
    [
      'TypeScript: constructor parameter properties',
      'typescript',
      'class A { constructor(private x: number, public y: string) {} }',
      'constructor',
      2,
    ],
    [
      'Python: self is not counted in a method',
      'python',
      'class K:\n    def m(self, a, b=1, *args, c, **kw):\n        pass',
      'm',
      5,
    ],
    [
      'Python: cls is not counted in a decorated method',
      'python',
      'class K:\n    @classmethod\n    def m(cls, a):\n        pass',
      'm',
      1,
    ],
    ['Python: self is counted in a plain function', 'python', 'def f(self, a):\n    pass', 'f', 2],
    [
      'Python: / and * separators are not parameters',
      'python',
      'def g(a, /, b, *, c):\n    pass',
      'g',
      3,
    ],
    [
      'C#: default, params, ref, out, and in',
      'csharp',
      'class K { void M(int a, string b = "x", params int[] r, ref int q, out int o, in int i) {} }',
      'M',
      6,
    ],
    [
      'C#: the this of an extension method is not counted',
      'csharp',
      'static class E { public static int F(this string s, int x) => x; }',
      'F',
      1,
    ],
    ['C#: constructor', 'csharp', 'class K { K(int a) {} }', 'K', 1],
  ])('%s', async (_name, grammar, source, name, expected) => {
    expect(await countOf(grammar, source, name)).toBe(expected);
  });

  it('labels a decorated Python method as a method', async () => {
    const { units } = await parseOk(
      parser,
      'python',
      'class K:\n    @staticmethod\n    def m(a):\n        pass\n',
    );

    expect(units.map((u) => u.kind)).toEqual(['method']);
  });
});

describe('Halstead counts (US-011)', () => {
  const add = {
    distinctOperators: 3, // function/def, return, +
    distinctOperands: 3, // add, a, b
    totalOperators: 3,
    totalOperands: 5, // add, a, b, a, b
  };

  it('counts keywords and operators as operators, names as operands, and ignores separators: JavaScript', async () => {
    const metrics = await firstUnit('javascript', 'function add(a, b) { return a + b; }\n');

    expect(metrics.halstead).toMatchObject(add);
  });

  it('gives the same counts for the same program in Python', async () => {
    const metrics = await firstUnit('python', 'def add(a, b):\n    return a + b\n');

    expect(metrics.halstead).toMatchObject(add);
    expect(metrics.halstead.volume).toBe(20.68);
    expect(metrics.halstead.difficulty).toBe(2.5);
    expect(metrics.halstead.effort).toBe(51.7);
  });

  it('counts a string as one operand however it is built', async () => {
    const metrics = await firstUnit('python', 'def f():\n    return "a\\nb"\n');

    // operands: f and the string
    expect(metrics.halstead.totalOperands).toBe(2);
  });

  it('is internally consistent in C#', async () => {
    const metrics = await firstUnit(
      'csharp',
      'class K { int Add(int a, int b) { return a + b; } }',
    );
    const h = metrics.halstead;

    expect(h.vocabulary).toBe(h.distinctOperators + h.distinctOperands);
    expect(h.length).toBe(h.totalOperators + h.totalOperands);
    expect(h.volume).toBeGreaterThan(0);
    expect(h.totalOperators).toBeGreaterThanOrEqual(h.distinctOperators);
    expect(h.totalOperands).toBeGreaterThanOrEqual(h.distinctOperands);
  });
});

describe('lines of code (US-012)', () => {
  it('does not count blank lines or comments, and counts every line a multi-line string spans', async () => {
    const python = await firstUnit(
      'python',
      'def f():\n    # a comment\n\n    x = 1  # trailing\n    return x\n',
    );
    const javascript = await firstUnit(
      'javascript',
      'function f() {\n  /* block\n     comment */\n  return `a\nb\nc`;\n}\n',
    );

    expect(python.codeLines).toBe(3);
    expect(javascript.codeLines).toBe(5); // function line, three template lines, closing brace
  });
});

describe('maintainability index (US-011)', () => {
  it('matches the hand-calculated value for a two-line function', async () => {
    const metrics = await firstUnit('python', 'def add(a, b):\n    return a + b\n');

    expect(metrics.maintainabilityIndex).toBe(84.09);
  });

  it('scores the branchy fixture lower than the trivial one', async () => {
    const trivial = await firstUnit('python', 'def add(a, b):\n    return a + b\n');
    const { files } = await scan(fixture('metrics/classify.py'));

    expect(files[0]?.units[0]?.metrics.maintainabilityIndex).toBeLessThan(
      trivial.maintainabilityIndex,
    );
  });

  it('measures the whole file too', async () => {
    const { files } = await scan(fixture('metrics/classify.js'));

    const [file] = files;
    expect(file?.metrics.cyclomatic).toBe(11);
    expect(file?.metrics.codeLines).toBeGreaterThan(20);
    expect(file?.metrics.maintainabilityIndex).toBeGreaterThan(0);
    expect(file?.metrics.maintainabilityIndex).toBeLessThanOrEqual(100);
  });
});

describe('very deeply nested code', () => {
  it('is measured without overflowing the call stack', async () => {
    const depth = 4_000;
    const source = js(`${'if (a) {'.repeat(depth)}${'}'.repeat(depth)}`);

    const metrics = await firstUnit('javascript', source);

    expect(metrics.maxNesting).toBe(depth);
    expect(metrics.cyclomatic).toBe(depth + 1);
  });
});
