import { describe, expect, it } from 'vitest';
import { languageForFile } from '../../src/languages/registry.js';

describe('languageForFile (US-060, US-061, US-062)', () => {
  it.each([
    ['src/app.js', 'javascript', 'JavaScript'],
    ['src/app.jsx', 'javascript', 'JavaScript'],
    ['src/app.mjs', 'javascript', 'JavaScript'],
    ['src/app.cjs', 'javascript', 'JavaScript'],
    ['src/app.ts', 'typescript', 'TypeScript'],
    ['src/app.tsx', 'tsx', 'TypeScript'],
    ['tools/run.py', 'python', 'Python'],
    ['Models/User.cs', 'csharp', 'C#'],
  ])('maps %s to the %s grammar shown as %s', (path, grammar, displayName) => {
    const language = languageForFile(path);

    expect(language?.grammar).toBe(grammar);
    expect(language?.displayName).toBe(displayName);
  });

  it('ignores extension case', () => {
    expect(languageForFile('Legacy.PY')?.grammar).toBe('python');
  });

  it.each(['README.md', 'Makefile', 'image.png', 'types.d.cts.map'])(
    'returns undefined for the unsupported file %s',
    (path) => {
      expect(languageForFile(path)).toBeUndefined();
    },
  );
});
