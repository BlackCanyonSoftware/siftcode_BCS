import { z } from 'zod';
import type { MemberChain, MemberHop } from '../../languages/model/types.js';
import { defineRule } from '../define.js';
import { isOutOfScope, normalizeName } from './context.js';

/** Turns a space-separated word list into a set of normalized names. */
const names = (words: string): Set<string> => new Set(words.split(/\s+/).map(normalizeName));

/**
 * Methods that are idiomatic to chain: collection and string operations, LINQ, promises, and
 * builders. A call to one of these returns a value to keep working on, not a part of the object, so
 * it does not count as reaching through it.
 */
const FLUENT_CALLS = names(`
  map filter reduce reduceRight forEach find findIndex findLast some every flat flatMap slice splice
  concat join split replace replaceAll trim trimStart trimEnd padStart padEnd substring startsWith
  endsWith includes indexOf toString toLowerCase toUpperCase toFixed at push pop shift unshift
  reverse sort keys values entries then catch finally bind call apply
  strip lstrip rstrip lower upper title capitalize format encode decode items append extend copy get
  Select SelectMany Where OrderBy OrderByDescending ThenBy ThenByDescending GroupBy Take Skip
  TakeWhile SkipWhile First FirstOrDefault Single SingleOrDefault Last LastOrDefault Any All Count
  Sum Min Max Average Distinct ToList ToArray ToDictionary ToHashSet AsEnumerable AsQueryable Cast
  OfType Union Intersect Except Append AppendLine ConfigureAwait Include ThenInclude AsNoTracking
  ToLower ToUpper
`);

/** Properties that read a size, not another object. */
const SIZE_MEMBERS = names('length size count');

/** Calls that start a fluent assertion or query chain: `expect(x).to.be...`, `cy.get().should()`. */
const FLUENT_ROOTS = new Set([
  'expect()',
  'assert()',
  'should()',
  '$()',
  'jQuery()',
  'require()',
  'cy',
  'chai',
  'sinon',
]);

/** The longest part of a chain worth showing in a message. */
const MAX_SHOWN = 60;

/**
 * The members a chain reaches through. The first member after `this`/`self` is the object's own
 * component, so it is free; idiomatic chaining calls and size reads do not count.
 */
export function reachedMembers(chain: MemberChain): MemberHop[] {
  const hops = chain.rootKind === 'self' ? chain.hops.slice(1) : chain.hops;
  return hops.filter((hop) => {
    const name = normalizeName(hop.name);
    return hop.call ? !FLUENT_CALLS.has(name) : !SIZE_MEMBERS.has(name);
  });
}

/** `order.customer.address.city`, with `()` after members that are called. */
export function describeChain(chain: MemberChain): string {
  const text = `${chain.root}${chain.hops.map((hop) => `.${hop.name}${hop.call ? '()' : ''}`).join('')}`;
  return text.length > MAX_SHOWN ? `${text.slice(0, MAX_SHOWN - 1)}…` : text;
}

export const lawOfDemeter = defineRule({
  meta: {
    id: 'SC-DES-001',
    title: 'Code reaches through several objects (Law of Demeter)',
    category: 'design',
    defaultSeverity: 'info',
    confidence: 'low',
    heuristic: true,
    standards: [
      {
        standard: 'Law of Demeter (Lieberherr and Holland, 1989)',
        id: 'Principle of Least Knowledge',
        url: 'https://www2.ccs.neu.edu/research/demeter/demeter-method/LawOfDemeter/paper-boy/demeter.pdf',
      },
      {
        standard: 'Refactoring (Fowler)',
        id: 'Hide Delegate',
        url: 'https://refactoring.com/catalog/hideDelegate.html',
      },
    ],
    rationale:
      'A long chain depends on the internal structure of objects the code should not know about, so a change deep inside one of them breaks callers far away.',
    suggestion: {
      summary:
        'Ask the nearest object to do the work (add a method that hides the delegate), or pass in what is needed, instead of navigating through its internals.',
      before: 'const city = order.customer.address.city();',
      after: ['// Order hides how the city is found:', 'const city = order.shippingCity();'].join(
        '\n',
      ),
    },
  },
  options: z.strictObject({
    maxChain: z.number().int().positive().default(3),
    /** Also report chains that only read properties (`a.b.c.d`), with no method call in them. */
    includeDataChains: z.boolean().default(false),
  }),
  check(file, { maxChain, includeDataChains }) {
    if (isOutOfScope(file.path)) {
      return [];
    }
    const imported = new Set(file.facts.imports.flatMap((entry) => entry.bindings));
    return file.facts.chains.flatMap((chain) => {
      // Modules, namespaces, and imported objects are reached by name, not through another object.
      const isReference = chain.rootKind === 'name' && imported.has(chain.root);
      if (isReference || FLUENT_ROOTS.has(chain.root)) {
        return [];
      }
      const reached = reachedMembers(chain);
      // Reading plain data fields (`node.loc.start.line`) is a weaker case than reaching through
      // objects to call behavior, so by default a chain needs a method call to be reported.
      if (reached.length <= maxChain || !(includeDataChains || reached.some((hop) => hop.call))) {
        return [];
      }
      const text = describeChain(chain);
      return [
        {
          startLine: chain.startLine,
          endLine: chain.endLine,
          message: `The chain "${text}" follows ${reached.length} members (limit ${maxChain}).`,
          key: text,
        },
      ];
    });
  },
});
