import { z } from 'zod';
import { defineUnitThresholdRule, unitLabel } from './threshold.js';

export const unitMaintainabilityIndex = defineUnitThresholdRule({
  meta: {
    id: 'SC-MET-005',
    title: 'Function or method has a low maintainability index',
    category: 'maintainability',
    defaultSeverity: 'info',
    confidence: 'medium',
    heuristic: true,
    standards: [
      {
        standard:
          "Oman and Hagemeister, Metrics for Assessing a Software System's Maintainability (ICSM 1992)",
        id: 'Maintainability Index',
      },
      {
        standard: 'Microsoft, Code metrics values (Visual Studio)',
        id: 'Maintainability Index 0 to 100; 20 and above is good',
        url: 'https://learn.microsoft.com/en-us/visualstudio/code-quality/code-metrics-values',
      },
    ],
    rationale:
      'The Maintainability Index combines size, branching, and the amount of distinct vocabulary into one 0 to 100 score. Low scores mark code that is large, branchy, or dense, which costs more to understand and change.',
    suggestion: {
      summary:
        'Split the code into smaller, single-purpose pieces and simplify the branching. The index improves with fewer lines, fewer decisions, and less distinct vocabulary.',
    },
  },
  option: 'minIndex',
  limit: z.number().min(0).max(100),
  defaultLimit: 20,
  measure: (unit) => unit.metrics.maintainabilityIndex,
  breaks: 'below',
  message: (unit, value, limit) =>
    `${unitLabel(unit)} "${unit.name}" has a maintainability index of ${value} (minimum ${limit}).`,
});
