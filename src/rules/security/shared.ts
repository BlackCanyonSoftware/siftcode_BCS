import type {
  AnalyzedFile,
  ArgumentFact,
  CallFact,
  ValueFact,
} from '../../languages/model/types.js';
import { enclosingUnit } from '../shared.js';
import type { StandardRef } from '../types.js';

export const cwe = (id: number, title: string): StandardRef => ({
  standard: 'MITRE Common Weakness Enumeration',
  id: `CWE-${id}: ${title}`,
  url: `https://cwe.mitre.org/data/definitions/${id}.html`,
});

export const owaspTop10 = (code: string, title: string, slug: string): StandardRef => ({
  standard: 'OWASP Top 10 (2021)',
  id: `${code}: ${title}`,
  url: `https://owasp.org/Top10/${slug}/`,
});

export const cheatSheet = (title: string, slug: string): StandardRef => ({
  standard: 'OWASP Cheat Sheet Series',
  id: title,
  url: `https://cheatsheetseries.owasp.org/cheatsheets/${slug}.html`,
});

/** Lowercase letters and digits only, so `$queryRawUnsafe`, `query_raw_unsafe`, and `QueryRawUnsafe` match. */
export function plain(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

/** A value that is fixed when the code is written. */
export function isConstant(value: ValueFact): boolean {
  return (
    value.kind === 'string' ||
    value.kind === 'number' ||
    value.kind === 'boolean' ||
    value.kind === 'null'
  );
}

export const firstArgument = (call: CallFact): ValueFact | undefined => call.args[0]?.value;

/** The value of the keyword or named argument `name` (compared ignoring case and underscores). */
export function keywordArgument(call: CallFact, name: string): ValueFact | undefined {
  return call.args.find(
    (arg: ArgumentFact) => arg.name !== undefined && plain(arg.name) === plain(name),
  )?.value;
}

/** The value of the entry `key` of an options object passed as an argument (`{ shell: true }`). */
export function optionsEntry(call: CallFact, key: string): ValueFact | undefined {
  for (const arg of call.args) {
    const entry = arg.value.props?.find((prop) => plain(prop.key) === plain(key));
    if (entry) {
      return entry.value;
    }
  }
  return undefined;
}

/**
 * The value a name was last given before `line`, within the same function (or anywhere in the file
 * when the line is not inside one). A rough stand-in for tracking a value through a variable.
 */
export function lastValueBefore(
  file: AnalyzedFile,
  name: string,
  line: number,
): ValueFact | undefined {
  const unit = enclosingUnit(file, line);
  let found: ValueFact | undefined;
  for (const entry of file.facts.namedValues) {
    const inScope = unit === undefined || entry.line >= unit.startLine;
    if (entry.target === name && entry.line <= line && inScope) {
      found = entry.value;
    }
  }
  return found;
}

/** True when the file imports `module` (compared without a leading `node:`). */
export function importsModule(file: AnalyzedFile, ...modules: readonly string[]): boolean {
  const wanted = new Set(modules);
  return file.facts.imports.some((entry) => wanted.has(entry.module.replace(/^node:/, '')));
}
