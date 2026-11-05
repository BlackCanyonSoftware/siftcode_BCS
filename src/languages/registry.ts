import { extname } from 'node:path';
import grammars from './grammars.json' with { type: 'json' };

/** Identifies one compiled tree-sitter grammar. */
export type GrammarId = keyof typeof grammars;

export interface LanguageSpec {
  readonly grammar: GrammarId;
  /** Name shown to users. Several grammars can share one (TypeScript and TSX). */
  readonly displayName: string;
  /** Lowercase file extensions including the dot. */
  readonly extensions: readonly string[];
}

export const LANGUAGES: readonly LanguageSpec[] = [
  { grammar: 'javascript', displayName: 'JavaScript', extensions: ['.js', '.jsx', '.mjs', '.cjs'] },
  { grammar: 'typescript', displayName: 'TypeScript', extensions: ['.ts', '.mts', '.cts'] },
  { grammar: 'tsx', displayName: 'TypeScript', extensions: ['.tsx'] },
  { grammar: 'python', displayName: 'Python', extensions: ['.py'] },
  { grammar: 'csharp', displayName: 'C#', extensions: ['.cs'] },
];

const byExtension = new Map<string, LanguageSpec>(
  LANGUAGES.flatMap((language) => language.extensions.map((ext) => [ext, language] as const)),
);

/** The language a file is written in, judged by its extension, or undefined if unsupported. */
export function languageForFile(path: string): LanguageSpec | undefined {
  // TypeScript declaration files (`.d.ts`, `.d.cts`, `.d.mts`) only describe types: there is no
  // code in them to measure or check, and some of their syntax is newer than the grammar knows.
  if (/\.d\.[cm]?ts$/i.test(path)) {
    return undefined;
  }
  return byExtension.get(extname(path).toLowerCase());
}

/** File name of the compiled grammar inside the `grammars/` folder. */
export function grammarFileName(grammar: GrammarId): string {
  return grammars[grammar].file;
}
