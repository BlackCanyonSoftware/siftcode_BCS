import { isTestFile, isVendored } from '../shared.js';
import { readManifests } from '../supply-chain/manifests.js';
import type { RepoView } from '../types.js';

/** A source file in one of the languages SiftCode reads. */
const SOURCE_FILE = /\.(?:py|pyi|js|jsx|mjs|cjs|ts|tsx|cs)$/i;

/** Test frameworks. A project that depends on one has tests, even if the files are named oddly. */
const TEST_FRAMEWORKS = new Set([
  'jest',
  'vitest',
  'mocha',
  'ava',
  'jasmine',
  'jasmine-core',
  'tap',
  'uvu',
  'karma',
  'cypress',
  '@playwright/test',
  'pytest',
  'nose',
  'nose2',
  'xunit',
  'xunit.core',
  'nunit',
  'mstest.testframework',
  'mstest.testadapter',
  'microsoft.net.test.sdk',
]);

/** Tools that run mutation tests: they change the code and check that a test notices. */
const MUTATION_TOOLS = new Set([
  '@stryker-mutator/core',
  'stryker',
  'dotnet-stryker',
  'mutmut',
  'cosmic-ray',
  'mutpy',
  'mutatest',
]);

/** Libraries that generate many inputs and check a property of the result. */
const PROPERTY_TOOLS = new Set([
  'fast-check',
  'jsverify',
  'testcheck',
  'hypothesis',
  'fscheck',
  'fscheck.xunit',
  'fscheck.nunit',
  'cscheck',
  'hedgehog',
]);

/** Fuzzers: they feed a program malformed input and watch for crashes and hangs. */
const FUZZ_TOOLS = new Set([
  '@jazzer.js/core',
  'jsfuzz',
  'atheris',
  'pythonfuzz',
  'sharpfuzz',
  'sharpfuzz.commandline',
]);

const STRYKER_CONFIG = /(?:^|\/)(?:\.?stryker[.-]?conf(?:ig)?[^/]*|stryker\.config\.[^/]*)$/i;
/** A folder or file made for fuzzing: `fuzz/`, `fuzzers/`, `parser.fuzz.ts`, `.clusterfuzzlite/`. */
const FUZZ_FILE =
  /(?:^|\/)(?:fuzz|fuzzers?|fuzzing|\.clusterfuzzlite)\/|(?:^|\/)[\w.-]*[._-]fuzz[\w.-]*\.(?:py|js|mjs|ts|cs)$/i;

/** What the project has for testing, from its files and its dependencies. */
export interface TestingSetup {
  /** Source files that are tests. */
  readonly testFiles: readonly string[];
  /** The project depends on a test framework. */
  readonly hasFramework: boolean;
  readonly mutation: boolean;
  readonly property: boolean;
  readonly fuzz: boolean;
  /** The languages of the project's source files, as SiftCode names them (`Python`, `TypeScript`). */
  readonly languages: readonly string[];
}

export const hasTests = (setup: TestingSetup): boolean =>
  setup.testFiles.length > 0 || setup.hasFramework;

/** Mutation, property-based, or fuzz testing: anything beyond examples. */
export const hasAdvancedTesting = (setup: TestingSetup): boolean =>
  setup.mutation || setup.property || setup.fuzz;

/** `Hypothesis` and `hypothesis`, `pytest_cov` and `pytest-cov`, compare equal. */
const normalize = (name: string): string => name.toLowerCase().replace(/_/g, '-');

const cache = new WeakMap<RepoView, Promise<TestingSetup>>();

/** Works out what the project has for testing. The result is cached per scan. */
export function detectTesting(repo: RepoView): Promise<TestingSetup> {
  let pending = cache.get(repo);
  if (!pending) {
    pending = detect(repo);
    cache.set(repo, pending);
  }
  return pending;
}

async function detect(repo: RepoView): Promise<TestingSetup> {
  const files = repo.files.filter((path) => !isVendored(path));
  const manifests = await readManifests(repo);
  const names = new Set(
    manifests.flatMap((manifest) => manifest.dependencies.map((d) => normalize(d.name))),
  );
  const uses = (tools: ReadonlySet<string>): boolean => [...names].some((name) => tools.has(name));
  const dotnetTools = repo.has('.config/dotnet-tools.json')
    ? ((await repo.read('.config/dotnet-tools.json')) ?? '')
    : '';

  return {
    testFiles: files.filter((path) => SOURCE_FILE.test(path) && isTestFile(path)),
    hasFramework: uses(TEST_FRAMEWORKS),
    mutation:
      uses(MUTATION_TOOLS) ||
      files.some((path) => STRYKER_CONFIG.test(path)) ||
      /stryker/i.test(dotnetTools),
    property: uses(PROPERTY_TOOLS),
    fuzz: uses(FUZZ_TOOLS) || files.some((path) => FUZZ_FILE.test(path)),
    languages: [...new Set(repo.codeFiles.map((file) => file.language))].sort(),
  };
}

/** What to try, by language, for the three kinds of testing. */
export const TOOLS_BY_LANGUAGE: Readonly<Record<string, string>> = {
  JavaScript: 'Stryker, fast-check, Jazzer.js',
  TypeScript: 'Stryker, fast-check, Jazzer.js',
  Python: 'mutmut, Hypothesis, Atheris',
  'C#': 'Stryker.NET, FsCheck, SharpFuzz',
};
