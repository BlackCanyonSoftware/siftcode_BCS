import { z } from 'zod';
import type { AnalyzedFile, MemberChain } from '../../languages/model/types.js';
import { defineRule } from '../define.js';
import { enclosingUnit, isTestFile, normalizeName } from './context.js';

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

/** `get` is too common to mean "locate" unless the receiver is clearly a container. */
const AMBIGUOUS_METHODS = new Set(['get']);

/** A receiver whose name says it hands out services. */
const CONTAINER_NAME = /container|locator|injector|kernel|serviceprovider|resolver|ioc|moduleref/;
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
const COMPOSITION_FOLDERS = new Set(['composition', 'di', 'ioc', 'container', 'bootstrap']);
const COMPOSITION_FUNCTION =
  /^(main|configure\w*|register\w*|bootstrap\w*|compose\w*|setup\w*|buildservice\w*|createhostbuilder)$/i;

export function isCompositionRoot(path: string): boolean {
  const segments = path.toLowerCase().split('/');
  const file = (segments.pop() ?? '').split('.')[0] ?? '';
  return (
    COMPOSITION_FILES.has(file.replace(/[-_]/g, '')) ||
    segments.some((s) => COMPOSITION_FOLDERS.has(s))
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
    const method = normalizeName(hop.name);
    if (hop.call && names.length > 0) {
      const receivers = names.map(normalizeName);
      const clearContainer = receivers.some((name) => CONTAINER_NAME.test(name));
      const isLocator = LOCATOR_METHODS.has(method)
        ? clearContainer || receivers.some((name) => PROVIDER_NAME.test(name))
        : AMBIGUOUS_METHODS.has(method) && clearContainer;
      if (isLocator) {
        return `${[...shown, hop.name].join('.')}()`;
      }
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
    if (isCompositionRoot(file.path) || isTestFile(file.path)) {
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
