import { describe, expect, it } from 'vitest';
import { isTestFile } from '../../src/rules/shared.js';

describe('isTestFile (US-020, US-030)', () => {
  it.each([
    'test/app.js',
    'src/__tests__/app.ts',
    'src/app.test.ts',
    'src/app.spec.ts',
    'pkg/test_app.py',
    'pkg/app_test.py',
    'pkg/test.py',
    'Tests/AppTests.cs',
    'src/App/BillingTest.cs',
    'src/App.Tests/Billing.cs',
    'src/App.UnitTests/Billing.cs',
    'src/App.IntegrationTests/Billing.cs',
    'src/AppTests/Billing.cs',
    'src/App.Tests.Benchmarks/Data.cs',
    'src/App.Benchmarks/Data.cs',
    'src/App/BillingTester.cs',
  ])('treats %s as test code', (path) => {
    expect(isTestFile(path)).toBe(true);
  });

  it.each([
    'src/app.ts',
    'src/App/Billing.cs',
    'src/Contests/Billing.cs',
    'src/Latest/Billing.cs',
    'src/Attester/Billing.cs',
    'src/App/Contester.cs',
    'src/App/Contest.cs',
    'pkg/protest.py',
  ])('does not treat %s as test code', (path) => {
    expect(isTestFile(path)).toBe(false);
  });
});
