import { z } from 'zod';
import { anchorPath } from '../anchor.js';
import { defineRepoRule } from '../define.js';
import {
  fuzzTesting,
  mutationTesting,
  owaspFuzzing,
  propertyBasedTesting,
  selfTestingCode,
  testPyramid,
} from '../standards.js';
import { TOOLS_BY_LANGUAGE, detectTesting, hasAdvancedTesting, hasTests } from './tooling.js';

const SIZE_OPTION = z.strictObject({
  /** Projects with fewer source files than this are left alone (SC-TST-002) or get a note (SC-TST-001). */
  minSourceFiles: z.number().int().min(0).default(20),
});

export const noAutomatedTests = defineRepoRule({
  meta: {
    id: 'SC-TST-001',
    title: 'No automated tests found',
    category: 'testing',
    defaultSeverity: 'warning',
    confidence: 'medium',
    heuristic: true,
    standards: [selfTestingCode, testPyramid],
    rationale:
      'Without automated tests every change is checked by hand or not at all, so a regression is found by a user instead of by the build. The check looks for test files and for a test framework among the dependencies; a project whose tests live in another repository will not be recognized.',
    suggestion: {
      summary:
        'Start with tests for the code that changes most or breaks most, using the usual framework for the language (Vitest or Jest, pytest, xUnit), and run them in CI so they stay green.',
      before: 'src/billing.ts            (no billing.test.ts, no test script)',
      after: 'src/billing.ts\nsrc/billing.test.ts       (npm test runs it in CI)',
    },
  },
  options: SIZE_OPTION,
  async check(repo, options) {
    if (!repo.isRepositoryRoot || repo.sourceFileCount === 0) {
      return [];
    }
    if (hasTests(await detectTesting(repo))) {
      return [];
    }
    const sizeable = repo.sourceFileCount >= options.minSourceFiles;
    return [
      {
        path: anchorPath(repo),
        startLine: 1,
        endLine: 1,
        message: `No automated tests were found among ${repo.sourceFileCount} source files: no test files, and no test framework in the dependencies.`,
        key: 'no-tests',
        severity: sizeable ? 'warning' : 'note',
      },
    ];
  },
});

export const noAdvancedTesting = defineRepoRule({
  meta: {
    id: 'SC-TST-002',
    title: 'Tests exist, but no mutation, property-based, or fuzz testing',
    category: 'testing',
    defaultSeverity: 'note',
    confidence: 'low',
    heuristic: true,
    standards: [mutationTesting, propertyBasedTesting, fuzzTesting, owaspFuzzing],
    rationale:
      'Example-based tests show that the code does what the examples expect. Mutation testing shows whether the tests would notice a change (a test suite can pass while checking little), property-based testing tries many inputs against a rule that must always hold, and fuzzing feeds malformed input to find crashes and hangs. A project with none of them has only the first kind of evidence. This is a suggestion, not a defect.',
    suggestion: {
      summary:
        'Pick one: a mutation tester on the module with the most logic, a property-based test for a function with a clear invariant (round-trips, ordering, idempotence), or a fuzz target for anything that parses outside input.',
      before: 'expect(parse("1,2")).toEqual([1, 2]);',
      after:
        'fc.assert(fc.property(fc.array(fc.integer()), (xs) => deepEqual(parse(format(xs)), xs)));',
    },
  },
  options: SIZE_OPTION,
  async check(repo, options) {
    if (!repo.isRepositoryRoot || repo.sourceFileCount < options.minSourceFiles) {
      return [];
    }
    const setup = await detectTesting(repo);
    if (!hasTests(setup) || hasAdvancedTesting(setup)) {
      return [];
    }
    const suggestions = setup.languages
      .flatMap((language) => {
        const tools = TOOLS_BY_LANGUAGE[language];
        return tools === undefined ? [] : [`${language}: ${tools}`];
      })
      .join('; ');
    return [
      {
        path: anchorPath(repo),
        startLine: 1,
        endLine: 1,
        message: `The project has tests, but no mutation testing, property-based testing, or fuzzing tool is configured.${suggestions === '' ? '' : ` Tools to look at (mutation, property-based, fuzzing): ${suggestions}.`}`,
        key: 'no-advanced-testing',
      },
    ];
  },
});
