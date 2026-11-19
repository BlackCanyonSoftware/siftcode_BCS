import { z } from 'zod';
import { defineRepoRule } from '../define.js';
import { acyclicDependencies, stableDependencies } from '../standards.js';
import type { Cycle } from './cycles.js';
import { findCycles } from './cycles.js';
import { buildDependencyGraph } from './graph.js';

/** A tangle of many folders is named by its first few; the cycle shown is the shortest one in it. */
const MAX_NAMED = 5;

const place = (edge: { from: string; line: number }): string => `${edge.from}:${edge.line}`;

function describe(cycle: Cycle): string {
  const parts = cycle.steps.map(
    (step) => `${step.component} imports ${step.next} (${place(step.edge)})`,
  );
  const shown = cycle.components.slice(0, MAX_NAMED);
  const more = cycle.components.length - shown.length;
  const list = more > 0 ? `${shown.join(', ')} and ${more} more` : shown.join(', ');
  return `The folders ${list} depend on each other in a cycle: ${parts.join(', and ')}.`;
}

export const importCycles = defineRepoRule({
  meta: {
    id: 'SC-ARC-001',
    title: 'Folders import each other in a cycle',
    category: 'design',
    defaultSeverity: 'info',
    confidence: 'medium',
    heuristic: true,
    standards: [acyclicDependencies, stableDependencies],
    rationale:
      'When folder A imports from B and B imports from A, neither can be understood, tested, changed, or released without the other: they are one component with a boundary drawn through it. A change in either can break the other, and a build or a test of one needs both. Cycles also tend to grow, because each new import across the boundary looks harmless.',
    suggestion: {
      summary:
        'Break the cycle at its weakest import: move the shared code into a folder both import, or invert one dependency (the lower folder defines an interface, the higher one implements it).',
      before:
        'orders/service.ts imports billing/invoice.ts, and billing/invoice.ts imports orders/service.ts',
      after:
        'shared/types.ts holds what both need; orders and billing each import shared, and neither imports the other',
    },
  },
  options: z.strictObject({}),
  check(repo) {
    if (repo.codeFiles.length === 0) {
      return Promise.resolve([]);
    }
    const graph = buildDependencyGraph(repo);
    return Promise.resolve(
      findCycles(graph).flatMap((cycle) => {
        const first = cycle.steps[0];
        return first === undefined
          ? []
          : [
              {
                path: first.edge.from,
                startLine: first.edge.line,
                endLine: first.edge.line,
                message: describe(cycle),
                key: cycle.components.join('|'),
              },
            ];
      }),
    );
  },
});
