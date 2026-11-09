import { z } from 'zod';
import { defineRule } from '../define.js';
import { isBarrelFile, isOutOfScope } from './context.js';

export const moduleFanOut = defineRule({
  meta: {
    id: 'SC-DES-005',
    title: 'Module depends on too many other modules',
    category: 'design',
    defaultSeverity: 'info',
    confidence: 'low',
    heuristic: true,
    standards: [
      {
        standard: 'Martin, OO Design Quality Metrics: An Analysis of Dependencies (1994)',
        id: 'Efferent coupling (Ce)',
      },
      {
        standard: 'Chidamber and Kemerer, A Metrics Suite for Object Oriented Design (1994)',
        id: 'Coupling Between Objects',
      },
      {
        standard: 'Single Responsibility Principle (Martin)',
        id: 'A module should have one reason to change',
      },
    ],
    rationale:
      'A module that imports many others depends on many things, so it changes whenever any of them does, and it often mixes unrelated responsibilities.',
    suggestion: {
      summary:
        'Split the module by responsibility so each part needs fewer imports, or hide groups of related dependencies behind one focused module.',
    },
  },
  options: z.strictObject({ maxImports: z.number().int().positive().default(25) }),
  check(file, { maxImports }) {
    if (isOutOfScope(file.path) || isBarrelFile(file.path)) {
      return [];
    }
    const modules = new Set(file.facts.imports.map((entry) => entry.module));
    if (modules.size <= maxImports) {
      return [];
    }
    const lines = file.facts.imports.map((entry) => entry.line);
    return [
      {
        startLine: Math.min(...lines),
        endLine: Math.max(...lines),
        message: `The module imports ${modules.size} other modules (limit ${maxImports}).`,
        key: 'imports',
      },
    ];
  },
});
