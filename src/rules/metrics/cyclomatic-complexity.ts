import { z } from 'zod';
import { defineUnitThresholdRule, unitLabel } from './threshold.js';

export const cyclomaticComplexity = defineUnitThresholdRule({
  meta: {
    id: 'SC-MET-002',
    title: 'Function or method is too complex',
    category: 'maintainability',
    defaultSeverity: 'warning',
    confidence: 'high',
    heuristic: false,
    standards: [
      {
        standard: 'McCabe, A Complexity Measure (IEEE Transactions on Software Engineering, 1976)',
        id: 'Cyclomatic complexity',
      },
      {
        standard: 'NIST Special Publication 500-235, Structured Testing',
        id: 'Recommended complexity limit of 10',
        url: 'https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication500-235.pdf',
      },
      {
        standard: 'Refactoring (Fowler)',
        id: 'Decompose Conditional',
        url: 'https://refactoring.com/catalog/decomposeConditional.html',
      },
      {
        standard: 'Refactoring (Fowler)',
        id: 'Replace Conditional with Polymorphism',
        url: 'https://refactoring.com/catalog/replaceConditionalWithPolymorphism.html',
      },
    ],
    rationale:
      'Cyclomatic complexity counts the independent paths through a function. Each path needs its own test and its own thought from the reader, so functions above about 10 paths are hard to test fully and tend to hide defects.',
    suggestion: {
      summary:
        'Give each part fewer branches: extract decisions into well-named functions, replace long if/else or switch chains with a lookup table or polymorphism, and return early to remove nesting.',
      before: [
        'function shipping(order) {',
        "  if (order.country === 'US') { return 5; }",
        "  else if (order.country === 'CA') { return 8; }",
        "  else if (order.country === 'MX') { return 9; }",
        '  // ...a branch for every country',
        '}',
      ].join('\n'),
      after: [
        'const SHIPPING_COST = { US: 5, CA: 8, MX: 9 };',
        '',
        'function shipping(order) {',
        '  return SHIPPING_COST[order.country] ?? DEFAULT_SHIPPING_COST;',
        '}',
      ].join('\n'),
    },
  },
  option: 'maxComplexity',
  limit: z.number().int().positive(),
  defaultLimit: 10,
  measure: (unit) => unit.metrics.cyclomatic,
  breaks: 'above',
  message: (unit, value, limit) =>
    `${unitLabel(unit)} "${unit.name}" has a cyclomatic complexity of ${value} (limit ${limit}).`,
});
