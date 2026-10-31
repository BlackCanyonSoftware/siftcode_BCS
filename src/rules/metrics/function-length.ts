import { z } from 'zod';
import { defineRule } from '../define.js';

const DEFAULT_MAX_LINES = 50;

export const functionLength = defineRule({
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
  options: z.strictObject({
    maxLines: z.number().int().positive().default(DEFAULT_MAX_LINES),
  }),
  check(file, { maxLines }) {
    return file.units.flatMap((unit) => {
      const lines = unit.endLine - unit.startLine + 1;
      if (lines <= maxLines) {
        return [];
      }
      const label = unit.kind === 'method' ? 'Method' : 'Function';
      return [
        {
          startLine: unit.startLine,
          endLine: unit.endLine,
          message: `${label} "${unit.name}" is ${lines} lines long (limit ${maxLines}).`,
          key: `${unit.kind}:${unit.name}`,
        },
      ];
    });
  },
});
