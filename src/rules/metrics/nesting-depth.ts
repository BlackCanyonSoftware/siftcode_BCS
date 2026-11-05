import { z } from 'zod';
import { defineUnitThresholdRule, unitLabel } from './threshold.js';

export const nestingDepth = defineUnitThresholdRule({
  meta: {
    id: 'SC-MET-004',
    title: 'Control structures are nested too deeply',
    category: 'maintainability',
    defaultSeverity: 'info',
    confidence: 'medium',
    heuristic: true,
    standards: [
      {
        standard: 'Refactoring (Fowler)',
        id: 'Replace Nested Conditional with Guard Clauses',
        url: 'https://refactoring.com/catalog/replaceNestedConditionalWithGuardClauses.html',
      },
      {
        standard: 'Cognitive Complexity (Campbell, SonarSource)',
        id: 'Nesting increments',
        url: 'https://www.sonarsource.com/resources/cognitive-complexity/',
      },
    ],
    rationale:
      'Each level of nesting adds a condition the reader must keep in mind, so deeply nested code is hard to follow and to change safely.',
    suggestion: {
      summary:
        'Handle the exceptional cases first with early returns (guard clauses), and extract inner blocks into named functions, so the main path stays at the left margin.',
      before: [
        'function charge(order) {',
        '  if (order) {',
        '    if (order.paid === false) {',
        '      if (order.total > 0) {',
        '        send(order);',
        '      }',
        '    }',
        '  }',
        '}',
      ].join('\n'),
      after: [
        'function charge(order) {',
        '  if (!order || order.paid) return;',
        '  if (order.total <= 0) return;',
        '  send(order);',
        '}',
      ].join('\n'),
    },
  },
  option: 'maxDepth',
  limit: z.number().int().positive(),
  defaultLimit: 4,
  measure: (unit) => unit.metrics.maxNesting,
  breaks: 'above',
  message: (unit, value, limit) =>
    `${unitLabel(unit)} "${unit.name}" nests control structures ${value} levels deep (limit ${limit}).`,
});
