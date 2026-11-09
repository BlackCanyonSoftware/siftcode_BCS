import { z } from 'zod';
import type { AnalyzedFile, MemberChain } from '../../languages/model/types.js';
import { defineRule } from '../define.js';
import { enclosingUnit, isOutOfScope, normalizeName } from './context.js';

/** Methods that hand out a dependency by type or name. Compared with {@link normalizeName}. */
const LOCATOR_METHODS = new Set([
  'resolve',
  'resolveall',
  'tryresolve',
  'resolveoptional',
  'getservice',
  'getservices',
  'getrequiredservice',
  'getkeyedservice',
  'getrequiredkeyedservice',
  'getinstance',
  'getallinstances',
  'getexportedvalue',
]);

/**
 * `get` is too common to mean "locate" unless the object it is called on is a container: its name
 * must end like one (`this.container.get`, not `this.container.children.get` or `containerElement.get`).
 */
const AMBIGUOUS_METHODS = new Set(['get']);
const CONTAINER_ENDING = /(?:container|locator|injector|kernel|ioc|moduleref|serviceprovider)$/;

/**
 * A receiver whose name says it hands out services. `resolver` is left out: it is as likely a
 * dependency resolver (pip), a DNS resolver, or a module resolver as a container.
 */
const CONTAINER_NAME = /container|locator|injector|kernel|serviceprovider|ioc|moduleref/;
const PROVIDER_NAME = /provider|^services$|requestservices/;

/** Files where wiring dependencies together is the job, so locating them is expected. */
const COMPOSITION_FILES = new Set([
  'program',
  'startup',
  'main',
  'app',
  'bootstrap',
  'composition',
  'compositionroot',
  'container',
  'containers',
  'di',
  'ioc',
  'setup',
  'module',
  'modules',
  'wiring',
  'registration',
  'registrations',
]);
/** File names that end like this are wiring too: `PaymentsStartup`, `MiddlewareConfig`, `InfrastructureServiceExtensions`. */
const COMPOSITION_SUFFIXES = [
  'startup',
  'bootstrap',
  'composition',
  'compositionroot',
  'config',
  'configuration',
  'configurations',
  'serviceextensions',
  'servicecollectionextensions',
  'module',
  'modules',
  'registrations',
];
const COMPOSITION_FOLDERS = new Set(['composition', 'di', 'ioc', 'container', 'bootstrap']);
/**
 * Functions whose job is to wire the application or prepare it to start: registering services,
 * seeding and migrating a database, initializing. `Add...Services` is the .NET registration idiom;
 * a plain `AddItem` is business code and is not exempt.
 */
const COMPOSITION_FUNCTION =
  /^(main|configure\w*|register\w*|bootstrap\w*|compose\w*|setup\w*|seed\w*|migrate\w*|initialize\w*|buildservice\w*|createhostbuilder|add\w*(services|infrastructure|dependencies))$/i;

export function isCompositionRoot(path: string): boolean {
  const segments = path.toLowerCase().split('/');
  const file = ((segments.pop() ?? '').split('.')[0] ?? '').replace(/[-_]/g, '');
  return (
    COMPOSITION_FILES.has(file) ||
    COMPOSITION_SUFFIXES.some((suffix) => file.endsWith(suffix)) ||
    segments.some((s) => COMPOSITION_FOLDERS.has(s))
  );
}

/**
 * True when `method`, called on the object reached through `receivers` (normalized names, nearest
 * the root first), hands out a dependency: a locator method on a container or provider, or the
 * ambiguous `get` on something that is itself named like a container.
 */
function isLocatorMethod(method: string, receivers: readonly string[]): boolean {
  if (LOCATOR_METHODS.has(method)) {
    return (
      receivers.some((name) => CONTAINER_NAME.test(name)) ||
      receivers.some((name) => PROVIDER_NAME.test(name))
    );
  }
  return (
    AMBIGUOUS_METHODS.has(method) && CONTAINER_ENDING.test(receivers[receivers.length - 1] ?? '')
  );
}

/**
 * The call in `chain` that fetches a dependency, written out as `this.container.get()`, if there is
 * one.
 */
export function findLocatorCall(chain: MemberChain): string | undefined {
  // `names` are what the call is made on, for judging the receiver; `shown` is the same path
  // including `this` or `self`, for the message.
  const names = chain.rootKind === 'name' ? [chain.root] : [];
  const shown = chain.rootKind === 'other' ? [] : [chain.root];
  for (const hop of chain.hops) {
    if (
      hop.call &&
      names.length > 0 &&
      isLocatorMethod(normalizeName(hop.name), names.map(normalizeName))
    ) {
      return `${[...shown, hop.name].join('.')}()`;
    }
    names.push(hop.name);
    shown.push(hop.name);
  }
  return undefined;
}

function isInCompositionFunction(file: AnalyzedFile, line: number): boolean {
  const unit = enclosingUnit(file, line);
  return unit !== undefined && COMPOSITION_FUNCTION.test(unit.name);
}

export const serviceLocator = defineRule({
  meta: {
    id: 'SC-DES-002',
    title: 'Dependency is fetched from a container instead of being injected (Service Locator)',
    category: 'design',
    defaultSeverity: 'warning',
    confidence: 'medium',
    heuristic: true,
    standards: [
      {
        standard: 'Seemann, Service Locator is an Anti-Pattern',
        id: 'Service Locator',
        url: 'https://blog.ploeh.dk/2010/02/03/ServiceLocatorisanAnti-Pattern/',
      },
      {
        standard: 'Fowler, Inversion of Control Containers and the Dependency Injection pattern',
        id: 'Service Locator versus Dependency Injection',
        url: 'https://martinfowler.com/articles/injection.html',
      },
    ],
    rationale:
      'A class that asks a container for its dependencies hides what it needs: the dependencies are not visible in its constructor, missing ones fail at run time instead of at construction, and tests must set up the container.',
    suggestion: {
      summary:
        'Declare the dependency as a constructor parameter and let the composition root (the one place that wires the application together) provide it.',
      before: [
        'class OrderService {',
        '  place(order) {',
        '    const payments = container.resolve(PaymentGateway);',
        '    payments.charge(order);',
        '  }',
        '}',
      ].join('\n'),
      after: [
        'class OrderService {',
        '  constructor(private payments: PaymentGateway) {}',
        '  place(order) {',
        '    this.payments.charge(order);',
        '  }',
        '}',
      ].join('\n'),
    },
  },
  options: z.strictObject({}),
  check(file) {
    if (isCompositionRoot(file.path) || isOutOfScope(file.path)) {
      return [];
    }
    return file.facts.chains.flatMap((chain) => {
      const call = findLocatorCall(chain);
      if (!call || isInCompositionFunction(file, chain.startLine)) {
        return [];
      }
      const unit = enclosingUnit(file, chain.startLine);
      const where = unit ? `"${unit.name}"` : 'This code';
      return [
        {
          startLine: chain.startLine,
          endLine: chain.endLine,
          message: `${where} fetches a dependency with ${call} instead of receiving it.`,
          key: `${unit?.name ?? ''}:${call}`,
        },
      ];
    });
  },
});
