import { describe, expect, it } from 'vitest';
import { scan } from '../../src/core/scan.js';
import { isTestFile, isVendored } from '../../src/rules/shared.js';
import { longJsFunction, onlyRule, useProjects } from '../helpers/project.js';

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
    'frontend/e2e/provider-stub.mjs',
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

describe('vendored code (US-010, US-020)', () => {
  const projects = useProjects();

  it.each([
    'vendor/lib/a.js',
    'third_party/x.py',
    'src/pip/_vendor/requests/api.py',
    'pkg/_vendored/x.py',
    'src/externals/y.cs',
    'external/z.ts',
  ])('treats %s as vendored', (path) => {
    expect(isVendored(path)).toBe(true);
  });

  it.each(['src/pip/_internal/a.py', 'src/vendorless/a.ts', 'src/vendor_logic.py'])(
    'does not treat %s as vendored',
    (path) => {
      expect(isVendored(path)).toBe(false);
    },
  );

  it('leaves vendored functions out of the metric rules', async () => {
    const folder = await projects.create({
      'src/own.js': longJsFunction('own', 8),
      'src/pip/_vendor/bundled.js': longJsFunction('bundled', 8),
    });

    const result = await scan(folder, { config: onlyRule('SC-MET-001', { maxLines: 3 }) });

    expect(result.findings.map((f) => f.path)).toEqual(['src/own.js']);
  });

  it('leaves vendored code out of the design rules', async () => {
    const chain = 'const x = a.b().c().d().e();\n';
    const folder = await projects.create({
      'src/own.js': chain,
      'src/_vendor/bundled.js': chain,
    });

    const result = await scan(folder, { config: onlyRule('SC-DES-001') });

    expect(result.findings.map((f) => f.path)).toEqual(['src/own.js']);
  });
});
