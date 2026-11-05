import { z } from 'zod';
import { defineUnitThresholdRule, unitLabel } from './threshold.js';

export const functionLength = defineUnitThresholdRule({
  meta: {
    id: 'SC-MET-001',
    title: 'Function or method is too long',
    category: 'maintainability',
    defaultSeverity: 'info',
    confidence: 'medium',
    heuristic: true,
    standards: [
      {
        standard: 'Refactoring (Fowler)',
        id: 'Extract Function',
        url: 'https://refactoring.com/catalog/extractFunction.html',
      },
      { standard: 'Clean Code (Martin)', id: 'Chapter 3: Functions' },
    ],
    rationale:
      'Long functions are harder to read, test, and change, and they usually do several jobs at once.',
    suggestion: {
      summary:
        'Extract cohesive blocks into small, well-named functions so each one does a single job.',
      before: [
        'function processOrder(order) {',
        '  // 80 lines: validate, price, charge, notify',
        '}',
      ].join('\n'),
      after: [
        'function processOrder(order) {',
        '  validate(order);',
        '  const total = price(order);',
        '  charge(order, total);',
        '  notify(order);',
        '}',
      ].join('\n'),
    },
  },
  option: 'maxLines',
  limit: z.number().int().positive(),
  defaultLimit: 50,
  measure: (unit) => unit.endLine - unit.startLine + 1,
  breaks: 'above',
  message: (unit, lines, limit) =>
    `${unitLabel(unit)} "${unit.name}" is ${lines} lines long (limit ${limit}).`,
});
