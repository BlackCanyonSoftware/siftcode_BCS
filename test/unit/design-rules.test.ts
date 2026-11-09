import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/config/load.js';
import type { ScanResult } from '../../src/core/result.js';
import { scan } from '../../src/core/scan.js';
import { ALL_RULES } from '../../src/rules/index.js';
import { fixture, useProjects } from '../helpers/project.js';

const projects = useProjects();

/** A config with only `id` switched on, so a test sees that rule's findings and no others. */
function only(id: string, options: object = {}) {
  const rules: Record<string, object> = {};
  for (const rule of ALL_RULES) {
    rules[rule.meta.id] = rule.meta.id === id ? { options } : { enabled: false };
  }
  return parseConfig(JSON.stringify({ rules }), 'test config');
}

const messages = (result: ScanResult) => result.findings.map((finding) => finding.message);

describe('SC-DES-001 Law of Demeter (US-020)', () => {
  const positive = fixture('rules/SC-DES-001/positive');
  const negative = fixture('rules/SC-DES-001/negative');

  it.each([
    ['chain.js', 'user.account.subscription.plan.cancel()'],
    ['chain.ts', 'user.account.subscription.plan.cancel()'],
    ['chain.py', 'user.account.subscription.plan.cancel()'],
    ['Billing.cs', 'user.Account.Subscription.Plan.Cancel()'],
  ])('flags a four-member chain in %s', async (file, chain) => {
    const result = await scan(join(positive, file), { config: only('SC-DES-001') });

    expect(messages(result)).toEqual([`The chain "${chain}" follows 4 members (limit 3).`]);
    expect(result.findings[0]?.severity).toBe('info');
  });

  it('leaves idiomatic chaining, imported modules, own components, and data reads alone', async () => {
    const result = await scan(negative, { config: only('SC-DES-001') });

    expect(result.filesScanned).toBe(4);
    expect(result.findings).toEqual([]);
  });

  it.each([
    ['tidy.js', 'order.customer.address.city.zip'],
    ['tidy.ts', 'order.customer.address.city.zip'],
    ['tidy.py', 'order.customer.address.city.zip'],
    ['Tidy.cs', 'order.Customer.Address.City.Zip'],
  ])('reports pure property chains too when asked: %s', async (file, chain) => {
    const config = only('SC-DES-001', { includeDataChains: true });

    const result = await scan(join(negative, file), { config });

    expect(messages(result)).toEqual([`The chain "${chain}" follows 4 members (limit 3).`]);
  });

  describe('fluent configuration is not reaching through objects', () => {
    const run = async (file: string, code: string) =>
      messages(await scan(await projects.create({ [file]: code }), { config: only('SC-DES-001') }));

    it.each([
      // EF Core, Autofac, FluentValidation: a statement made of calls that configures one object
      [
        'A.cs',
        'class A { void M(B b) { b.Property().IsRequired().HasMaxLength(5).HasColumnType("x"); } }',
      ],
      [
        'A.cs',
        'class A { void M(B builder) { builder.Services.AddOne().AddTwo().AddThree().AddFour(); } }',
      ],
      [
        'A.cs',
        'class A { void M() { RuleFor(x => x.Name).NotEmpty().WithMessage("a").MaximumLength(5); } }',
      ],
      ['A.cs', 'class A { async void M(B b) { await b.Open().Then().Wait().Done(); } }'],
      // a builder that ends in Build, or starts from something named ...Builder
      [
        'A.cs',
        'class A { void M() { var t = TriggerBuilder.Create().StartNow().WithX().Build(); } }',
      ],
      ['A.cs', 'class A { void M(B b) { var x = b.One().Two().Three().Four().Build(); } }'],
      [
        'A.cs',
        'class A { void M(B modelBuilder) { var x = modelBuilder.One().Two().Three().Four(); } }',
      ],
      ['a.js', 'app.use(a).use(b).use(c).listen(3000);'],
      ['a.py', 'parser.add(a).add(b).add(c).add(d)'],
    ])('leaves it alone in %s: %s', async (file, code) => {
      expect(await run(file, code)).toEqual([]);
    });

    it.each([
      // the value is used: it navigates to something
      ['A.cs', 'class A { void M(B a) { var x = a.One().Two().Three().Four(); } }'],
      ['a.js', 'const x = a.one().two().three().four();'],
      // it reaches through properties, even as a statement
      ['A.cs', 'class A { void M(B user) { user.Account.Subscription.Plan.Cancel(); } }'],
      ['a.js', 'user.account.subscription.plan.cancel();'],
    ])('still reports a chain that navigates, in %s: %s', async (file, code) => {
      expect(await run(file, code)).toHaveLength(1);
    });
  });

  it('uses a configurable limit', async () => {
    const stricter = await scan(join(negative, 'tidy.js'), {
      config: only('SC-DES-001', { maxChain: 2 }),
    });
    const looser = await scan(join(positive, 'chain.js'), {
      config: only('SC-DES-001', { maxChain: 4 }),
    });

    expect(messages(stricter)).toEqual([
      'The chain "this.parts.engine.cooling.pump()" follows 3 members (limit 2).',
    ]);
    expect(looser.findings).toEqual([]);
  });

  it('does not apply to test code', async () => {
    const folder = await projects.create({
      'tests/chain.test.js': 'export const x = user.account.subscription.plan.cancel();\n',
      'test_chain.py': 'x = user.account.subscription.plan.cancel()\n',
    });

    expect((await scan(folder, { config: only('SC-DES-001') })).findings).toEqual([]);
  });

  it('counts a chain once, at its outermost end, and reports where it is', async () => {
    const folder = await projects.create({
      'a.js': 'function f(u) {\n  return u.a.b.c.d()\n    .e;\n}\n',
    });

    const result = await scan(folder, { config: only('SC-DES-001') });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ startLine: 2, endLine: 3 });
  });
});

describe('SC-DES-002 Service Locator (US-021)', () => {
  const positive = fixture('rules/SC-DES-002/positive');
  const negative = fixture('rules/SC-DES-002/negative');

  it.each([
    [
      'order-service.js',
      ['"place" fetches a dependency with container.resolve() instead of receiving it.'],
    ],
    [
      'order-service.ts',
      ['"place" fetches a dependency with this.container.get() instead of receiving it.'],
    ],
    [
      'order_service.py',
      ['"place" fetches a dependency with self.container.resolve() instead of receiving it.'],
    ],
    [
      'OrderService.cs',
      [
        '"Place" fetches a dependency with _provider.GetRequiredService() instead of receiving it.',
        '"Place" fetches a dependency with ServiceLocator.Current.GetInstance() instead of receiving it.',
      ],
    ],
  ])('flags the container lookups in %s', async (file, expected) => {
    const result = await scan(join(positive, file), { config: only('SC-DES-002') });

    expect(messages(result)).toEqual(expected);
    expect(result.findings[0]?.severity).toBe('warning');
  });

  it('leaves look-alike calls, composition roots, and wiring functions alone', async () => {
    const result = await scan(negative, { config: only('SC-DES-002') });

    expect(result.filesScanned).toBe(3);
    expect(result.findings).toEqual([]);
  });

  it.each(['main.js', 'src/bootstrap.ts', 'composition/root.ts', 'tests/order.test.js'])(
    'skips %s, where locating a dependency is expected',
    async (file) => {
      const folder = await projects.create({
        [file]: 'export function run() { return container.resolve(Thing); }\n',
      });

      expect((await scan(folder, { config: only('SC-DES-002') })).findings).toEqual([]);
    },
  );

  it.each([
    'src/Web/Configurations/MiddlewareConfig.cs',
    'src/Infrastructure/InfrastructureServiceExtensions.cs',
    'src/Modules/Payments/PaymentsStartup.cs',
    'src/Modules/Payments/PaymentsModule.cs',
    'src/App/AppConfiguration.cs',
  ])('skips %s: a file named for wiring the application together', async (file) => {
    const folder = await projects.create({
      [file]: 'class A { void Run() { var x = container.Resolve(Thing); } }\n',
    });

    expect((await scan(folder, { config: only('SC-DES-002') })).findings).toEqual([]);
  });

  it.each(['SeedDatabase', 'MigrateDatabaseAsync', 'InitializeStore', 'AddInfrastructureServices'])(
    'skips the wiring function %s in any file',
    async (name) => {
      const folder = await projects.create({
        'src/Web/Thing.cs': `class A { void ${name}() { var x = services.GetRequiredService<Db>(); } }\n`,
      });

      expect((await scan(folder, { config: only('SC-DES-002') })).findings).toEqual([]);
    },
  );

  it('still flags a locator in business code, even in a method that starts with Add', async () => {
    const folder = await projects.create({
      'src/Billing/Cart.cs':
        'class Cart { void AddItem() { var x = _provider.GetRequiredService<Tax>(); } }\n',
    });

    expect(messages(await scan(folder, { config: only('SC-DES-002') }))).toEqual([
      '"AddItem" fetches a dependency with _provider.GetRequiredService() instead of receiving it.',
    ]);
  });

  it('does not take a dependency resolver or a DNS resolver for a container', async () => {
    const folder = await projects.create({
      'src/pip/run.py': 'def run(resolver):\n    return resolver.resolve(requirements)\n',
    });

    expect((await scan(folder, { config: only('SC-DES-002') })).findings).toEqual([]);
  });

  it('flags a locator in a file that is not one of those', async () => {
    const folder = await projects.create({
      'src/thing.js': 'export function run() { return container.resolve(Thing); }\n',
    });

    expect(messages(await scan(folder, { config: only('SC-DES-002') }))).toEqual([
      '"run" fetches a dependency with container.resolve() instead of receiving it.',
    ]);
  });

  it('does not treat get on a non-container as a locator, but does on a container', async () => {
    const folder = await projects.create({
      'src/a.js':
        'export const f = () => [cache.get("k"), settings.get("t"), injector.get(Service), moduleRef.get(Other)];\n',
    });

    const result = await scan(folder, { config: only('SC-DES-002') });

    expect(result.findings).toHaveLength(2);
    expect(result.findings.map((f) => /with (\S+)\(\)/.exec(f.message)?.[1])).toEqual([
      'injector.get',
      'moduleRef.get',
    ]);
  });
});

describe('SC-DES-003 class with too many methods (US-022)', () => {
  const javascript = (n: number) =>
    `export class Big {\n${Array.from({ length: n }, (_, i) => `  m${i}() { return ${i}; }`).join('\n')}\n}\n`;
  const python = (n: number) =>
    `class Big:\n${Array.from({ length: n }, (_, i) => `    def m${i}(self):\n        return ${i}`).join('\n')}\n`;
  const csharp = (n: number) =>
    `public class Big\n{\n${Array.from({ length: n }, (_, i) => `    public int M${i}() => ${i};`).join('\n')}\n}\n`;

  it.each([
    ['big.js', javascript],
    ['big.py', python],
    ['Big.cs', csharp],
  ])('flags 26 methods but not 25 (%s)', async (file, generate) => {
    const folder = await projects.create({
      [`over/${file}`]: generate(26),
      [`at/${file}`]: generate(25),
    });

    const result = await scan(folder, { config: only('SC-DES-003') });

    expect(result.findings.map((f) => [f.path, f.message])).toEqual([
      [`over/${file}`, 'Class "Big" has 26 methods (limit 25).'],
    ]);
  });

  it('uses a configurable limit, and says Struct or Record when it is one', async () => {
    const folder = await projects.create({
      'S.cs': 'public struct S { int A() => 1; int B() => 2; int C() => 3; }\n',
      'R.cs': 'public record R(int X) { int A() => 1; int B() => 2; int C() => 3; }\n',
    });

    const result = await scan(folder, { config: only('SC-DES-003', { maxMethods: 2 }) });

    expect(messages(result)).toEqual([
      'Record "R" has 3 methods (limit 2).',
      'Struct "S" has 3 methods (limit 2).',
    ]);
  });

  it('does not count constructors, and does not apply to test classes', async () => {
    const folder = await projects.create({
      'ctor.js': 'export class C { constructor() {} a() {} }\n',
      'test_big.py': python(40),
      'BigTests.cs': csharp(40),
      'tests/big.js': javascript(40),
    });

    const result = await scan(folder, { config: only('SC-DES-003', { maxMethods: 1 }) });

    expect(result.findings).toEqual([]);
  });
});

describe('SC-DES-004 class whose methods share no state (US-022)', () => {
  /** `groups` groups of `size` methods, each group using its own field. */
  const javascript = (groups: number, size: number) =>
    `export class C {\n${Array.from({ length: groups }, (_, g) =>
      Array.from({ length: size }, (_, i) => `  m${g}_${i}() { return this.f${g}; }`).join('\n'),
    ).join('\n')}\n}\n`;
  const python = (groups: number, size: number) =>
    `class C:\n${Array.from({ length: groups }, (_, g) =>
      Array.from(
        { length: size },
        (_, i) => `    def m${g}_${i}(self):\n        return self.f${g}`,
      ).join('\n'),
    ).join('\n')}\n`;
  const csharp = (groups: number, size: number) =>
    `public class C\n{\n${Array.from({ length: groups }, (_, g) => `    private int f${g};`).join('\n')}\n${Array.from(
      { length: groups },
      (_, g) =>
        Array.from({ length: size }, (_, i) => `    public int M${g}_${i}() => f${g};`).join('\n'),
    ).join('\n')}\n}\n`;

  it.each([
    ['c.js', javascript],
    ['c.py', python],
    ['C.cs', csharp],
  ])('flags three groups of two methods (%s) and says how many', async (file, generate) => {
    const folder = await projects.create({ [file]: generate(3, 2) });

    const result = await scan(folder, { config: only('SC-DES-004') });

    expect(messages(result)).toEqual([
      'Class "C" has 6 methods that fall into 3 groups sharing no state.',
    ]);
  });

  it('is satisfied by two groups by default, and flags them when asked', async () => {
    const folder = await projects.create({ 'c.js': javascript(2, 3) });

    expect((await scan(folder, { config: only('SC-DES-004') })).findings).toEqual([]);
    const strict = await scan(folder, { config: only('SC-DES-004', { minGroups: 2 }) });
    expect(messages(strict)).toEqual([
      'Class "C" has 6 methods that fall into 2 groups sharing no state.',
    ]);
  });

  it('needs enough methods that use state before judging', async () => {
    const folder = await projects.create({ 'c.js': javascript(3, 1) });

    expect((await scan(folder, { config: only('SC-DES-004') })).findings).toEqual([]);
    const lenient = await scan(folder, { config: only('SC-DES-004', { minMethods: 3 }) });
    expect(lenient.findings).toHaveLength(1);
  });

  it('ignores static and stateless methods, and a class whose methods work together', async () => {
    const folder = await projects.create({
      'together.js': `export class T {
  a() { return this.x; }
  b() { return this.x + this.y; }
  c() { return this.y + this.z; }
  d() { return this.z; }
  e() { return this.w + this.z; }
  f() { return this.a() + this.w; }
  static s1() { return 1; }
  static s2() { return 2; }
  pure1() { return 1; }
  pure2() { return 2; }
}
`,
    });

    const result = await scan(folder, { config: only('SC-DES-004', { minGroups: 2 }) });

    expect(result.findings).toEqual([]);
  });

  it('does not apply to test classes', async () => {
    const folder = await projects.create({ 'tests/c.js': javascript(4, 3) });

    expect((await scan(folder, { config: only('SC-DES-004') })).findings).toEqual([]);
  });
});

describe('SC-DES-005 module with too many imports (US-022)', () => {
  const javascript = (n: number) =>
    Array.from({ length: n }, (_, i) => `import m${i} from 'mod${i}';`).join('\n') + '\n';
  const python = (n: number) =>
    Array.from({ length: n }, (_, i) => `import mod${i}`).join('\n') + '\n';
  const csharp = (n: number) =>
    Array.from({ length: n }, (_, i) => `using Mod${i};`).join('\n') + '\n';

  it.each([
    ['a.js', javascript],
    ['a.py', python],
    ['A.cs', csharp],
  ])('flags 26 imports but not 25 (%s)', async (file, generate) => {
    const folder = await projects.create({
      [`over/${file}`]: generate(26),
      [`at/${file}`]: generate(25),
    });

    const result = await scan(folder, { config: only('SC-DES-005') });

    expect(result.findings.map((f) => [f.path, f.message, f.startLine, f.endLine])).toEqual([
      [`over/${file}`, 'The module imports 26 other modules (limit 25).', 1, 26],
    ]);
  });

  it('counts a module once however often it is imported, and uses a configurable limit', async () => {
    const folder = await projects.create({
      'a.js':
        "import a from 'x';\nimport { b } from 'x';\nconst c = require('x');\nimport d from 'y';\n",
    });

    expect(
      (await scan(folder, { config: only('SC-DES-005', { maxImports: 2 }) })).findings,
    ).toEqual([]);
    const strict = await scan(folder, { config: only('SC-DES-005', { maxImports: 1 }) });
    expect(messages(strict)).toEqual(['The module imports 2 other modules (limit 1).']);
  });

  it('does not apply to barrel files or test code', async () => {
    const folder = await projects.create({
      'index.js': javascript(40),
      'pkg/__init__.py': python(40),
      'tests/a.test.js': javascript(40),
      'test_a.py': python(40),
    });

    expect((await scan(folder, { config: only('SC-DES-005') })).findings).toEqual([]);
  });
});

describe('the design rules', () => {
  it('describe themselves as design rules with standards and a suggestion (US-040)', () => {
    const design = ALL_RULES.filter((rule) => rule.meta.id.startsWith('SC-DES-'));

    expect(design.map((rule) => rule.meta.id)).toEqual([
      'SC-DES-001',
      'SC-DES-002',
      'SC-DES-003',
      'SC-DES-004',
      'SC-DES-005',
    ]);
    for (const { meta } of design) {
      expect(meta.category).toBe('design');
      expect(meta.heuristic).toBe(true);
      expect(['warning', 'info', 'note']).toContain(meta.defaultSeverity);
    }
  });

  it.each([
    ['SC-DES-001', { maxChain: 0 }, 'maxChain'],
    ['SC-DES-001', { includeDataChains: 'yes' }, 'includeDataChains'],
    ['SC-DES-002', { strict: true }, 'strict'],
    ['SC-DES-003', { maxMethods: 2.5 }, 'maxMethods'],
    ['SC-DES-004', { minGroups: 1 }, 'minGroups'],
    ['SC-DES-005', { maxImports: -1 }, 'maxImports'],
  ])('reject bad options: %s %j', async (id, options, option) => {
    const error = await scan(fixture('sample'), { config: only(id, options) }).catch(
      (e: unknown) => e,
    );

    expect((error as Error).message).toContain(id);
    expect((error as Error).message).toContain(option);
  });
});
