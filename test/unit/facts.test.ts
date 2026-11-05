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

/** Chains as `root.hop.hop()`, with `()` marking a called member. */
async function chainsOf(grammar: GrammarId, source: string): Promise<string[]> {
  const { facts } = await parseOk(parser, grammar, source);
  return facts.chains.map(
    (chain) =>
      `${chain.root}${chain.hops.map((hop) => `.${hop.name}${hop.call ? '()' : ''}`).join('')}`,
  );
}

describe('member chains (US-020)', () => {
  it.each<[string, GrammarId, string, string[]]>([
    ['a plain chain', 'javascript', 'a.b.c.d();', ['a.b.c.d()']],
    ['calls and indexing inside a chain', 'javascript', 'a.b().c[0].d;', ['a.b().c.d']],
    ['optional chaining', 'javascript', 'x?.y?.z;', ['x.y.z']],
    [
      'a call result as the root',
      'javascript',
      'getUser().account.name;',
      ['getUser().account.name'],
    ],
    ['this as the root', 'javascript', 'this.svc.repo.find(1);', ['this.svc.repo.find()']],
    ['a TypeScript non-null assertion', 'typescript', 'a!.b.c;', ['a.b.c']],
    ['no member hop is not a chain', 'javascript', 'f(x); a[0]; a;', []],
    ['arguments are separate chains', 'javascript', 'f(a.b, c.d.e);', ['a.b', 'c.d.e']],
    ['one chain, not its shorter parts', 'javascript', 'a.b.c.d;', ['a.b.c.d']],
    ['a plain chain', 'python', 'a.b.c.d()\n', ['a.b.c.d()']],
    ['calls and indexing inside a chain', 'python', 'a.b()[0].c\n', ['a.b().c']],
    ['self as the root', 'python', 'self.x.y.z()\n', ['self.x.y.z()']],
    ['a module path', 'python', 'os.path.join("a")\n', ['os.path.join()']],
    ['a plain chain', 'csharp', 'class K { void M() { a.B.C.D(); } }', ['a.B.C.D()']],
    ['this as the root', 'csharp', 'class K { void M() { this.s.r.F(); } }', ['this.s.r.F()']],
    ['null-conditional access', 'csharp', 'class K { void M() { var v = x?.Y?.Z; } }', ['x.Y.Z']],
    [
      'a generic method name',
      'csharp',
      'class K { void M() { var s = provider.GetService<IFoo>(); } }',
      ['provider.GetService()'],
    ],
    [
      'a static chain',
      'csharp',
      'class K { void M() { var r = ServiceLocator.Current.GetInstance<IBar>(); } }',
      ['ServiceLocator.Current.GetInstance()'],
    ],
  ])('%s (%s)', async (_name, grammar, source, expected) => {
    expect(await chainsOf(grammar, source)).toEqual(expected);
  });

  it('classifies the root and records the lines of a chain', async () => {
    const { facts } = await parseOk(
      parser,
      'javascript',
      'a.b;\nthis.c.d;\nf().g;\n(a || b).h;\nlong.\n  chain.\n  here;\n',
    );

    expect(facts.chains.map((c) => [c.root, c.rootKind])).toEqual([
      ['a', 'name'],
      ['this', 'self'],
      ['f()', 'other'],
      ['…', 'other'],
      ['long', 'name'],
    ]);
    expect(facts.chains.at(-1)).toMatchObject({ startLine: 5, endLine: 7 });
  });
});

describe('imports (US-022, US-020)', () => {
  const importsOf = async (grammar: GrammarId, source: string) =>
    (await parseOk(parser, grammar, source)).facts.imports.map((i) => [i.module, ...i.bindings]);

  it('reads JavaScript and TypeScript imports, re-exports, and require calls', async () => {
    const source = [
      "import a from 'm';",
      "import { b, c as d } from './n';",
      "import * as ns from 'o';",
      "import 'side';",
      "export * from 'q';",
      "export { e } from 'r';",
      "const z = require('p');",
      "const { w, k: renamed } = require('v');",
    ].join('\n');

    expect(await importsOf('javascript', source)).toEqual([
      ['m', 'a'],
      ['./n', 'b', 'd'],
      ['o', 'ns'],
      ['side'],
      ['q'],
      ['r'],
      ['p', 'z'],
      ['v', 'w', 'renamed'],
    ]);
  });

  it('reads a TypeScript import-equals and type-only import', async () => {
    const source = "import type { T } from './t';\nimport x = require('x');\n";

    expect(await importsOf('typescript', source)).toEqual([
      ['./t', 'T'],
      ['x', 'x'],
    ]);
  });

  it('reads Python imports, aliases, and relative imports', async () => {
    const source = [
      'import os',
      'import a.b.c',
      'import x as y',
      'from m import n, o as p',
      'from . import q',
      'from ..pkg import r',
      'from s import *',
    ].join('\n');

    expect(await importsOf('python', source)).toEqual([
      ['os', 'os'],
      ['a.b.c', 'a'],
      ['x', 'y'],
      ['m', 'n', 'p'],
      ['.', 'q'],
      ['..pkg', 'r'],
      ['s'],
    ]);
  });

  it('reads C# using directives: the namespace root is the binding, an alias replaces it', async () => {
    const source = [
      'using System;',
      'using System.IO;',
      'using static System.Math;',
      'using A = System.Text;',
      'global using System.Linq;',
    ].join('\n');

    expect(await importsOf('csharp', source)).toEqual([
      ['System', 'System'],
      ['System.IO', 'System'],
      ['System.Math'],
      ['System.Text', 'A'],
      ['System.Linq', 'System'],
    ]);
  });
});

describe('classes (US-022)', () => {
  const classOf = async (grammar: GrammarId, source: string) => {
    const { classes } = await parseOk(parser, grammar, source);
    const [first] = classes;
    if (!first) {
      throw new Error('no class found');
    }
    return first;
  };

  // Two groups of methods that share no state: {g, m, n} use a and b through each other, {other} uses z.
  it('counts JavaScript methods and fields, and finds two cohesion groups', async () => {
    const source = [
      'class A extends B {',
      '  x = 1;',
      '  static y = 2;',
      '  constructor(a) { this.a = a; this.b = 0; }',
      '  get g() { return this.a; }',
      '  m() { return this.n() + this.a; }',
      '  n() { return this.b; }',
      '  static s() {}',
      '  other() { return this.z; }',
      '}',
    ].join('\n');

    const result = await classOf('javascript', source);

    expect(result).toMatchObject({ name: 'A', kind: 'class', startLine: 1, endLine: 10 });
    expect(result.methods).toBe(5); // g, m, n, s, other; the constructor is not counted
    expect(result.fields).toBe(4); // x, y, and the assigned a and b
    expect(result.cohesion).toEqual({ methods: 4, components: 2 });
  });

  it('counts Python methods, class attributes, and assigned attributes', async () => {
    const source = [
      'class A(B):',
      '    x = 1',
      '    def __init__(self, a):',
      '        self.a = a',
      '        self.b = 0',
      '    @property',
      '    def g(self):',
      '        return self.a',
      '    def m(self):',
      '        return self.n() + self.a',
      '    def n(self):',
      '        return self.b',
      '    @staticmethod',
      '    def s():',
      '        pass',
      '    def other(self):',
      '        return self.z',
      '    class Inner:',
      '        pass',
    ].join('\n');

    const classes = (await parseOk(parser, 'python', source)).classes;

    expect(classes.map((c) => c.name)).toEqual(['A', 'Inner']);
    expect(classes[0]?.methods).toBe(5);
    expect(classes[0]?.fields).toBe(3); // x, a, b
    expect(classes[0]?.cohesion).toEqual({ methods: 4, components: 2 });
  });

  it('counts C# methods, fields, properties, and primary-constructor parameters', async () => {
    const source = [
      'class A : B {',
      '  private int a;',
      '  private int b;',
      '  private int z;',
      '  public int P { get; set; }',
      '  public A(int init) { a = init; }',
      '  public int G() { return a; }',
      '  public int M() { return N() + a; }',
      '  int N() { return b; }',
      '  static void S() { }',
      '  int Other() { return this.z; }',
      '  int Foreign(A o) { return o.a; }',
      '}',
    ].join('\n');

    const result = await classOf('csharp', source);

    expect(result).toMatchObject({ name: 'A', kind: 'class' });
    expect(result.methods).toBe(6); // G, M, N, S, Other, Foreign
    expect(result.fields).toBe(4); // a, b, z, P
    // G, M, N share a and b; Other uses z alone; Foreign touches another object's member only.
    expect(result.cohesion).toEqual({ methods: 4, components: 2 });
  });

  it('treats C# primary constructor parameters as fields', async () => {
    const result = await classOf(
      'csharp',
      'class R(int a, string b) { public int M() => a; public int N() => b.Length; }',
    );

    expect(result.fields).toBe(2);
    expect(result.cohesion).toEqual({ methods: 2, components: 2 });
  });

  it('recognizes structs and records, and skips interfaces', async () => {
    const source =
      'struct S { int x; } record Rec(int A) { public void M() { } } interface I { void M(); }';

    const classes = (await parseOk(parser, 'csharp', source)).classes;

    expect(classes.map((c) => [c.name, c.kind])).toEqual([
      ['S', 'struct'],
      ['Rec', 'record'],
    ]);
  });

  it('finds TypeScript abstract classes, and ignores anonymous classes', async () => {
    const source =
      'abstract class A { private f = 0; abstract m(): void; n(): void { this.f++; } }\nexport default class {}\n';

    const classes = (await parseOk(parser, 'typescript', source)).classes;

    expect(classes.map((c) => c.name)).toEqual(['A']);
    expect(classes[0]).toMatchObject({ methods: 1, fields: 1 });
  });

  it('has no cohesion verdict for a class with fewer than two stateful methods', async () => {
    const result = await classOf('javascript', 'class A { m() { return 1; } n() { return 2; } }');

    expect(result.cohesion).toEqual({ methods: 0, components: 0 });
  });
});
