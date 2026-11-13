import type {
  AnalyzedFile,
  ArgumentFact,
  CallFact,
  ValueFact,
} from '../../languages/model/types.js';

export { lastValueBefore } from '../shared.js';
export { cheatSheet, cwe, owaspTop10 } from '../standards.js';

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

/** True when the file imports `module` (compared without a leading `node:`). */
export function importsModule(file: AnalyzedFile, ...modules: readonly string[]): boolean {
  const wanted = new Set(modules);
  return file.facts.imports.some((entry) => wanted.has(entry.module.replace(/^node:/, '')));
}
