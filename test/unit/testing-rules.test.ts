import { describe, expect, it } from 'vitest';
import { scan } from '../../src/core/scan.js';
import { onlyRule, useProjects } from '../helpers/project.js';

const projects = useProjects();

/** Scans a Git-repository-shaped project with only rule `id` switched on. */
async function findingsFor(id: string, files: Record<string, string>, options: object = {}) {
  const folder = await projects.create({ ...files, '.git/HEAD': 'ref: refs/heads/main\n' });
  return (await scan(folder, { config: onlyRule(id, options) })).findings;
}

/** `count` small source files in `dir`. */
const source = (count: number, dir = 'src', ext = 'ts'): Record<string, string> =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      `${dir}/m${i}.${ext}`,
      `export const v${i} = ${i};\n`,
    ]),
  );

const pythonSource = (count: number): Record<string, string> =>
  Object.fromEntries(Array.from({ length: count }, (_, i) => [`pkg/m${i}.py`, `v${i} = ${i}\n`]));

const packageJson = (
  dependencies: Record<string, string>,
  devDependencies: Record<string, string> = {},
) => JSON.stringify({ name: 'demo', dependencies, devDependencies });

describe('SC-TST-001 no automated tests (US-050)', () => {
  it('flags a larger project with no test files and no test framework, at warning level', async () => {
    const findings = await findingsFor('SC-TST-001', { ...source(25), 'README.md': '# Demo\n' });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      path: 'README.md',
      severity: 'warning',
      confidence: 'medium',
    });
    expect(findings[0]?.message).toBe(
      'No automated tests were found among 25 source files: no test files, and no test framework in the dependencies.',
    );
  });

  it('reports a small project at note level, and minSourceFiles changes the line', async () => {
    const small = await findingsFor('SC-TST-001', source(5));
    const strict = await findingsFor('SC-TST-001', source(5), { minSourceFiles: 3 });

    expect(small[0]?.severity).toBe('note');
    expect(strict[0]?.severity).toBe('warning');
  });

  it.each([
    ['a test file next to the code', { 'src/app.test.ts': 'test("a", () => {});\n' }],
    ['a tests folder', { 'tests/test_app.py': 'def test_a():\n    pass\n' }],
    ['a C# test project', { 'src/App.Tests/AppTests.cs': 'public class AppTests { }\n' }],
    ['a test framework in package.json', { 'package.json': packageJson({}, { vitest: '5.0.0' }) }],
    ['pytest in requirements', { 'requirements.txt': 'pytest==8.0.0\nrequests==2.0.0\n' }],
    [
      'xunit in a project file',
      {
        'App.csproj':
          '<Project><ItemGroup><PackageReference Include="xunit" Version="2.9.0" /></ItemGroup></Project>',
      },
    ],
  ])('is quiet when there is %s', async (_name, extra) => {
    expect(await findingsFor('SC-TST-001', { ...source(25), ...extra })).toEqual([]);
  });

  it('does not count a source file that only has "test" in a folder name it does not own', async () => {
    const findings = await findingsFor('SC-TST-001', {
      ...source(25),
      'src/latest/a.ts': 'export const a = 1;\n',
    });

    expect(findings).toHaveLength(1);
  });

  it('only runs at the top of a Git repository', async () => {
    const folder = await projects.create(source(25));

    const result = await scan(folder, { config: onlyRule('SC-TST-001') });

    expect(result.findings).toEqual([]);
  });
});

describe('SC-TST-003 binary decoder without a fuzz target (US-051)', () => {
  const python =
    'import struct\n' +
    Array.from({ length: 4 }, (_, i) => `a${i} = struct.unpack("<I", data[${i}:])\n`).join('');
  const typescript = Array.from(
    { length: 3 },
    (_, i) => `const a${i} = buf.readUInt32LE(${i});\n`,
  ).join('');
  const csharp = `class R { void M(byte[] b) {\n${Array.from({ length: 3 }, (_, i) => `  var a${i} = BitConverter.ToInt32(b, ${i});\n`).join('')}} }\n`;

  it.each([
    ['Python', 'src/wire.py', python, 4, 'struct.unpack'],
    ['TypeScript', 'src/wire.ts', typescript, 3, 'readUInt32LE'],
    ['C#', 'src/Wire.cs', csharp, 3, 'BitConverter.To'],
  ])(
    'flags a %s file that decodes binary data in several places',
    async (_language, path, text, count) => {
      const findings = await findingsFor('SC-TST-003', { ...source(3), [path]: text });

      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ path, severity: 'info', confidence: 'low' });
      expect(findings[0]?.message).toBe(
        `${path} reads binary data in ${count} places, from line ${text.split('\n').findIndex((l) => /unpack|read|To/.test(l) && !l.startsWith('import')) + 1}, and the project has no fuzz target: malformed input is what fuzzing exercises.`,
      );
    },
  );

  it.each([
    ['a fuzzing library in the dependencies', { 'requirements.txt': 'atheris==2.3.0\n' }],
    ['a fuzz folder', { 'fuzz/wire_fuzzer.py': 'import atheris\n' }],
    ['a fuzz target next to the code', { 'src/wire.fuzz.ts': 'export {};\n' }],
  ])('is quiet when there is %s', async (_name, extra) => {
    expect(await findingsFor('SC-TST-003', { 'src/wire.py': python, ...extra })).toEqual([]);
  });

  it('is quiet for a file with only a read or two, for tests, and for vendored code', async () => {
    const findings = await findingsFor('SC-TST-003', {
      'src/few.py': 'import struct\nstruct.unpack("<I", d)\nstruct.unpack("<I", e)\n',
      'tests/test_wire.py': python,
      'src/_vendor/wire.py': python,
    });

    expect(findings).toEqual([]);
  });

  it('reports the files with the most reads first, at most maxFiles of them', async () => {
    const many = (n: number) =>
      'import struct\n' + Array.from({ length: n }, () => 'struct.unpack("<I", d)\n').join('');
    const findings = await findingsFor(
      'SC-TST-003',
      { 'a.py': many(3), 'b.py': many(7), 'c.py': many(5) },
      { maxFiles: 2 },
    );

    expect(findings.map((f) => f.path).sort()).toEqual(['b.py', 'c.py']);
  });

  it('only runs at the top of a Git repository', async () => {
    const folder = await projects.create({ 'src/wire.py': python });

    expect((await scan(folder, { config: onlyRule('SC-TST-003') })).findings).toEqual([]);
  });
});

describe('SC-TST-002 tests, but no mutation, property-based, or fuzz tooling (US-050)', () => {
  const withTests = { 'src/app.test.ts': 'test("a", () => {});\n' };

  it('suggests tools for the languages of the project, once, as a note', async () => {
    const findings = await findingsFor('SC-TST-002', {
      ...source(25),
      ...pythonSource(5),
      ...withTests,
      'README.md': '# Demo\n',
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ path: 'README.md', severity: 'note', confidence: 'low' });
    expect(findings[0]?.message).toContain(
      'has tests, but no mutation testing, property-based testing, or fuzzing tool',
    );
    expect(findings[0]?.message).toContain('Python: mutmut, Hypothesis, Atheris');
    expect(findings[0]?.message).toContain('TypeScript: Stryker, fast-check, Jazzer.js');
  });

  it.each([
    ['fast-check', { 'package.json': packageJson({}, { 'fast-check': '3.0.0' }) }],
    [
      '@stryker-mutator/core',
      { 'package.json': packageJson({}, { '@stryker-mutator/core': '8.0.0' }) },
    ],
    ['a Stryker config file', { 'stryker.config.json': '{}' }],
    ['hypothesis', { 'requirements-dev.txt': 'pytest\nhypothesis==6.0.0\n' }],
    ['mutmut', { 'requirements.txt': 'mutmut==2.4.0\n' }],
    [
      'FsCheck',
      {
        'App.csproj':
          '<Project><ItemGroup><PackageReference Include="FsCheck" Version="2.16.0" /></ItemGroup></Project>',
      },
    ],
    [
      'a dotnet Stryker tool',
      { '.config/dotnet-tools.json': '{"tools":{"dotnet-stryker":{"version":"4.0.0"}}}' },
    ],
    ['a fuzz folder', { 'fuzz/parse_fuzzer.py': 'import atheris\n' }],
    ['a fuzz target file', { 'src/parser.fuzz.ts': 'export {};\n' }],
  ])('is quiet when %s is configured', async (_name, extra) => {
    expect(await findingsFor('SC-TST-002', { ...source(25), ...withTests, ...extra })).toEqual([]);
  });

  it("is quiet when there are no tests at all: that is SC-TST-001's finding", async () => {
    expect(await findingsFor('SC-TST-002', source(25))).toEqual([]);
  });

  it('is quiet for a small project, and minSourceFiles changes that', async () => {
    expect(await findingsFor('SC-TST-002', { ...source(5), ...withTests })).toEqual([]);
    expect(
      await findingsFor('SC-TST-002', { ...source(5), ...withTests }, { minSourceFiles: 3 }),
    ).toHaveLength(1);
  });
});
