import { describe, expect, it } from 'vitest';
import { scan } from '../../src/core/scan.js';
import { firstConditionalBranch } from '../../src/languages/conditional-compilation.js';
import { SyntaxParser } from '../../src/languages/parser.js';
import { onlyRule, useProjects } from '../helpers/project.js';

const projects = useProjects();

/** From CliWrap: the `#if` splits the modifiers of one method, so neither branch is a whole member. */
const SPLIT_MODIFIERS = [
  'internal partial class S : Stream',
  '{',
  '#if NETSTANDARD2_1_OR_GREATER || NETCOREAPP2_1_OR_GREATER',
  '    public override',
  '#else',
  '    private',
  '#endif',
  '    async ValueTask WriteAsync(int buffer)',
  '    {',
  '        await Task.Delay(1);',
  '    }',
  '}',
  '',
].join('\n');

describe('firstConditionalBranch (US-062)', () => {
  it('keeps the first branch, blanks the directives and the other branches, and keeps every line', () => {
    const reduced = firstConditionalBranch(SPLIT_MODIFIERS);

    expect(reduced?.split('\n')).toEqual([
      'internal partial class S : Stream',
      '{',
      '',
      '    public override',
      '',
      '',
      '',
      '    async ValueTask WriteAsync(int buffer)',
      '    {',
      '        await Task.Delay(1);',
      '    }',
      '}',
      '',
    ]);
  });

  it('follows #elif and nested blocks, keeping only the first branch of each', () => {
    const source = [
      '#if A',
      'a1();',
      '#if B',
      'b1();',
      '#else',
      'b2();',
      '#endif',
      '#elif C',
      'c1();',
      '#else',
      'd1();',
      '#endif',
      'after();',
    ].join('\n');

    const kept = firstConditionalBranch(source)
      ?.split('\n')
      .filter((line) => line !== '');

    expect(kept).toEqual(['a1();', 'b1();', 'after();']);
  });

  it('keeps Windows line endings, so the lines of the file do not move', () => {
    const reduced = firstConditionalBranch('#if A\r\nx();\r\n#else\r\ny();\r\n#endif\r\nz();\r\n');

    expect(reduced).toBe('\r\nx();\r\n\r\n\r\n\r\nz();\r\n');
  });

  it('leaves other directives alone, and returns nothing when there is no #if', () => {
    expect(firstConditionalBranch('#region x\nint a;\n#endregion\n')).toBeUndefined();
    expect(firstConditionalBranch('#nullable enable\n#if A\nx();\n#endif\n')).toContain(
      '#nullable enable',
    );
  });
});

describe('C# files with conditional compilation (US-062, US-071)', () => {
  it('parses a file whose #if splits a member, and says it read the first branch', async () => {
    const parser = await SyntaxParser.create();
    try {
      const result = await parser.parse('csharp', SPLIT_MODIFIERS);

      expect(result.outcome).toBe('ok');
      expect(result.outcome === 'ok' && result.conditionalCompilation).toBe(true);
      expect(result.outcome === 'ok' && result.units.map((unit) => unit.name)).toEqual([
        'WriteAsync',
      ]);
    } finally {
      parser.dispose();
    }
  });

  it('does not touch a file that already parses, even if it has #if blocks', async () => {
    const parser = await SyntaxParser.create();
    try {
      const result = await parser.parse('csharp', 'class A {\n#if X\n  void M() {}\n#endif\n}\n');

      expect(result.outcome).toBe('ok');
      expect(result.outcome === 'ok' && result.conditionalCompilation).toBeFalsy();
    } finally {
      parser.dispose();
    }
  });

  it('still reports a real syntax error as not checked', async () => {
    const parser = await SyntaxParser.create();
    try {
      const result = await parser.parse('csharp', 'class A {\n#if X\n  void M( {}\n#endif\n}\n');

      expect(result.outcome).toBe('syntax-error');
    } finally {
      parser.dispose();
    }
  });

  it('checks the file in a scan, with measurements, and tells the user in a note', async () => {
    const folder = await projects.create({ 'S.cs': SPLIT_MODIFIERS });

    const result = await scan(folder, { config: onlyRule('SC-MET-001', { maxLines: 3 }) });

    expect(result.problems).toEqual([]);
    expect(result.files.map((file) => file.path)).toEqual(['S.cs']);
    // the method starts at its first modifier, on the original line 4
    expect(result.findings.map((finding) => finding.startLine)).toEqual([4]);
    expect(result.notes).toEqual([
      '1 C# file was read as the first branch of its #if blocks, because it does not parse otherwise: the code under #else and #elif was not checked.',
    ]);
  });
});
