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

const factsOf = async (grammar: GrammarId, source: string) =>
  (await parseOk(parser, grammar, source)).facts;

/** Calls as `callee(kind:text, name=kind:text)`, so a whole call fits on one line. */
async function callsOf(grammar: GrammarId, source: string): Promise<string[]> {
  const { calls } = await factsOf(grammar, source);
  return calls.map((call) => {
    const args = call.args.map((arg) => {
      const props = arg.value.props?.map((p) => `${p.key}:${p.value.kind}`).join(',');
      const value =
        props === undefined ? `${arg.value.kind}:${arg.value.text}` : `object{${props}}`;
      return arg.name === undefined ? value : `${arg.name}=${value}`;
    });
    return `${call.isNew ? 'new ' : ''}${call.callee}(${args.join(', ')})`;
  });
}

describe('calls and the shape of their arguments (US-030)', () => {
  it.each<[string, GrammarId, string, string[]]>([
    [
      'concatenation with a variable',
      'javascript',
      "db.query('SELECT * FROM t WHERE id=' + id);",
      ['db.query(dynamic-string:SELECT * FROM t WHERE id=)'],
    ],
    [
      'a template with a substitution',
      'javascript',
      'db.query(`SELECT ${x}`);',
      ['db.query(dynamic-string:SELECT )'],
    ],
    [
      'a template without one is constant',
      'javascript',
      'db.query(`SELECT 1`);',
      ['db.query(string:SELECT 1)'],
    ],
    ['a constant concatenation is constant', 'javascript', "f('a' + 'b');", ['f(string:ab)']],
    ['a tagged template is not an ordinary call', 'javascript', 'sql`SELECT ${x}`;', []],
    [
      'an options object',
      'javascript',
      'exec(cmd, { shell: true });',
      ['exec(name:cmd, object{shell:boolean})'],
    ],
    ['new', 'javascript', "new Function('a', body);", ['new Function(string:a, name:body)']],
    [
      'a call on a call result',
      'javascript',
      "require('child_process').exec(c);",
      ['….exec(name:c)', 'require(string:child_process)'],
    ],
    ['a dotted receiver', 'javascript', 'a.b.c(1);', ['a.b.c(number:1)']],
    [
      'percent formatting',
      'python',
      'cursor.execute("SELECT %s" % uid)\n',
      ['cursor.execute(dynamic-string:SELECT %s)'],
    ],
    [
      'an f-string',
      'python',
      'cursor.execute(f"SELECT {uid}")\n',
      ['cursor.execute(dynamic-string:SELECT )'],
    ],
    [
      'str.format',
      'python',
      'cursor.execute("SELECT {}".format(uid))\n',
      ['cursor.execute(dynamic-string:SELECT {})', '….format(name:uid)'],
    ],
    [
      'parameters passed separately',
      'python',
      'cursor.execute("SELECT %s", (uid,))\n',
      ['cursor.execute(string:SELECT %s, other:(uid,))'],
    ],
    [
      'keyword arguments',
      'python',
      'subprocess.run(cmd, shell=True)\n',
      ['subprocess.run(name:cmd, shell=boolean:True)'],
    ],
    [
      'concatenation in Python',
      'python',
      'os.system("ls " + d)\n',
      ['os.system(dynamic-string:ls )'],
    ],
    [
      'concatenation in C#',
      'csharp',
      'class K { void M() { cmd.ExecuteReader("SELECT " + id); } }',
      ['cmd.ExecuteReader(dynamic-string:SELECT )'],
    ],
    [
      'an interpolated string in C#',
      'csharp',
      'class K { void M() { cmd.ExecuteReader($"SELECT {id}"); } }',
      ['cmd.ExecuteReader(dynamic-string:SELECT )'],
    ],
    [
      'an interpolated string without a value is constant',
      'csharp',
      'class K { void M() { f($"abc"); } }',
      ['f(string:abc)'],
    ],
    [
      'two C# arguments',
      'csharp',
      'class K { void M() { Process.Start("cmd", "/c " + arg); } }',
      ['Process.Start(string:cmd, dynamic-string:/c )'],
    ],
    [
      'an object creation',
      'csharp',
      'class K { void M() { new MD5CryptoServiceProvider(); } }',
      ['new MD5CryptoServiceProvider()'],
    ],
    [
      'a qualified type',
      'csharp',
      'class K { void M() { new System.Security.Cryptography.SHA1Managed(); } }',
      ['new SHA1Managed()'],
    ],
    [
      'a named argument',
      'csharp',
      'class K { void M() { Call(password: "xyz"); } }',
      ['Call(password=string:xyz)'],
    ],
    [
      'a generic method name',
      'csharp',
      'class K { void M() { p.GetService<IFoo>(); } }',
      ['p.GetService()'],
    ],
  ])('%s (%s)', async (_name, grammar, source, expected) => {
    expect(await callsOf(grammar, source)).toEqual(expected);
  });

  it('flattens a very long concatenation without overflowing the stack, keeping a truncated prefix', async () => {
    const terms = Array.from({ length: 3000 }, (_, i) => `'s${i}'`);

    const { calls } = await factsOf('javascript', `f(${terms.join(' + ')} + x);`);

    const value = calls[0]?.args[0]?.value;
    expect(value?.kind).toBe('dynamic-string');
    expect(value?.text.startsWith('s0s1s2s3')).toBe(true);
    expect(value?.text).toHaveLength(300);
  });

  it('describes string.Format in C# as a dynamic string', async () => {
    const calls = await callsOf(
      'csharp',
      'class K { void M() { Run(string.Format("a{0}", b)); } }',
    );

    expect(calls).toEqual(['Run(dynamic-string:a{0})', 'string.Format(string:a{0}, name:b)']);
  });

  it('records the callee, name, receiver, and line of a call', async () => {
    const { calls } = await factsOf('javascript', '\n\nchild_process.execSync(x);\n');

    expect(calls[0]).toMatchObject({
      callee: 'child_process.execSync',
      name: 'execSync',
      receiver: 'child_process',
      isNew: false,
      line: 3,
    });
  });
});

/** Named values as `target = kind:text`. */
async function valuesOf(grammar: GrammarId, source: string): Promise<string[]> {
  const { namedValues } = await factsOf(grammar, source);
  return namedValues.map((v) => `${v.target} = ${v.value.kind}:${v.value.text}`);
}

describe('named values (US-030)', () => {
  it.each<[string, GrammarId, string, string[]]>([
    [
      'a declaration',
      'javascript',
      "const password = 'hunter2hunter2';",
      ['password = string:hunter2hunter2'],
    ],
    ['a property assignment', 'javascript', "cfg.apiKey = 'abcd';", ['cfg.apiKey = string:abcd']],
    [
      'an object entry',
      'javascript',
      "const o = { token: 'xyz', n: 1 };",
      ['token = string:xyz', 'n = number:1'],
    ],
    ['a quoted key', 'javascript', "const o = { 'api-key': 'xyz' };", ['api-key = string:xyz']],
    [
      'an environment variable',
      'javascript',
      "process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';",
      ['process.env.NODE_TLS_REJECT_UNAUTHORIZED = string:0'],
    ],
    [
      'an indexed environment variable',
      'javascript',
      "process.env['X'] = '1';",
      ['process.env.X = string:1'],
    ],
    ['a destructuring is not a name', 'javascript', 'const { a } = b; x += 1;', []],
    [
      'a class field',
      'typescript',
      "class A { password = 'abcdefgh'; }",
      ['password = string:abcdefgh'],
    ],
    [
      'a plain assignment',
      'python',
      'password = "hunter2hunter2"\n',
      ['password = string:hunter2hunter2'],
    ],
    [
      'an attribute assignment',
      'python',
      'self.api_key = "abcd"\n',
      ['self.api_key = string:abcd'],
    ],
    [
      'a dictionary entry',
      'python',
      'd = {"token": "xyz", "n": 1}\n',
      ['token = string:xyz', 'n = number:1'],
    ],
    ['a keyword argument', 'python', 'connect(password="xyz")\n', ['password = string:xyz']],
    [
      'a name as the value',
      'python',
      'context.verify_mode = ssl.CERT_NONE\n',
      ['context.verify_mode = name:ssl.CERT_NONE'],
    ],
    ['adjacent literals', 'python', 'x = "a" "b"\n', ['x = string:ab']],
    [
      'a C# field',
      'csharp',
      'class K { string Password = "hunter2hunter2"; }',
      ['Password = string:hunter2hunter2'],
    ],
    [
      'a C# object initializer',
      'csharp',
      'class K { void M() { var c = new Cfg { ApiKey = "abcd" }; } }',
      ['c = other:new Cfg { ApiKey = "abcd" }', 'ApiKey = string:abcd'],
    ],
    [
      'a C# named argument',
      'csharp',
      'class K { void M() { Call(password: "xyz"); } }',
      ['password = string:xyz'],
    ],
    [
      'a C# property initializer',
      'csharp',
      'class K { public string Token { get; set; } = "abcdefgh"; }',
      ['Token = string:abcdefgh'],
    ],
    [
      'a C# lambda value',
      'csharp',
      'class K { void M() { A.B = (x, y) => true; } }',
      ['A.B = other:(x, y) => true'],
    ],
  ])('%s (%s)', async (_name, grammar, source, expected) => {
    expect(await valuesOf(grammar, source)).toEqual(expected);
  });
});

describe('long strings (US-030)', () => {
  it.each<[GrammarId, string]>([
    [
      'javascript',
      "const a = 'short'; const b = 'this one is long enough'; const c = `${x} is spliced and long enough`;",
    ],
    [
      'python',
      'a = "short"\nb = "this one is long enough"\nc = f"{x} is spliced and long enough"\n',
    ],
    [
      'csharp',
      'class K { string a = "short"; string b = "this one is long enough"; string c = $"{x} spliced and long enough"; }',
    ],
  ])('keeps constant strings of 16 characters or more only (%s)', async (grammar, source) => {
    const { strings } = await factsOf(grammar, source);

    expect(strings.map((s) => s.value)).toEqual(['this one is long enough']);
  });

  it('reads triple-quoted and verbatim strings', async () => {
    const python = await factsOf('python', 'x = """a long triple-quoted string"""\n');
    const csharp = await factsOf('csharp', 'class K { string x = @"a long verbatim string"; }');

    expect(python.strings.map((s) => s.value)).toEqual(['a long triple-quoted string']);
    expect(csharp.strings.map((s) => s.value)).toEqual(['a long verbatim string']);
  });

  it('records the line of each string', async () => {
    const { strings } = await factsOf('javascript', "\nconst a = 'a string of length 20';\n");

    expect(strings[0]?.line).toBe(2);
  });
});

describe('hostile input', () => {
  it('does not overflow the stack on deeply nested parentheses', async () => {
    const depth = 3000;
    const source = `f(${'('.repeat(depth)}'a long constant string'${')'.repeat(depth)} + x);`;

    const { calls } = await factsOf('javascript', source);

    expect(calls).toHaveLength(1);
  });
});
