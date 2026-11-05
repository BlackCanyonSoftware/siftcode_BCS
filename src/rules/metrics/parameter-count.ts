import { z } from 'zod';
import { defineUnitThresholdRule, unitLabel } from './threshold.js';

export const parameterCount = defineUnitThresholdRule({
  meta: {
    id: 'SC-MET-003',
    title: 'Function or method takes too many parameters',
    category: 'maintainability',
    defaultSeverity: 'info',
    confidence: 'medium',
    heuristic: true,
    standards: [
      { standard: 'Clean Code (Martin)', id: 'Chapter 3: Function Arguments' },
      {
        standard: 'Refactoring (Fowler)',
        id: 'Introduce Parameter Object',
        url: 'https://refactoring.com/catalog/introduceParameterObject.html',
      },
      { standard: 'Refactoring (Fowler)', id: 'Long Parameter List (code smell)' },
    ],
    rationale:
      'Long parameter lists are hard to remember, easy to call with arguments in the wrong order, and often mean the function needs data that belongs together.',
    suggestion: {
      summary:
        'Group related parameters into one object (or split the function), so callers pass one meaningful value instead of many loose ones.',
      before: 'function createUser(name, email, age, country, newsletter, role) { /* ... */ }',
      after: [
        'function createUser({ name, email, age, country, newsletter, role }) {',
        '  /* ... */',
        '}',
      ].join('\n'),
    },
  },
  option: 'maxParameters',
  limit: z.number().int().positive(),
  defaultLimit: 5,
  measure: (unit) => unit.metrics.parameters,
  breaks: 'above',
  message: (unit, value, limit) =>
    `${unitLabel(unit)} "${unit.name}" takes ${value} parameters (limit ${limit}).`,
});
