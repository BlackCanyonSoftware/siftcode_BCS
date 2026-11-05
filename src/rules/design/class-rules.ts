import { z } from 'zod';
import type { RuleMeta, StandardRef } from '../types.js';
import { defineRule } from '../define.js';
import { classLabel, isTestFile } from './context.js';

const SRP: StandardRef = {
  standard: 'Single Responsibility Principle (Martin)',
  id: 'A module should have one reason to change',
};

const EXTRACT_CLASS: StandardRef = {
  standard: 'Refactoring (Fowler)',
  id: 'Extract Class',
  url: 'https://refactoring.com/catalog/extractClass.html',
};

const sizeMeta: RuleMeta = {
  id: 'SC-DES-003',
  title: 'Class has too many methods',
  category: 'design',
  defaultSeverity: 'info',
  confidence: 'low',
  heuristic: true,
  standards: [
    SRP,
    {
      standard: 'Chidamber and Kemerer, A Metrics Suite for Object Oriented Design (1994)',
      id: 'Weighted Methods per Class',
    },
    EXTRACT_CLASS,
  ],
  rationale:
    'A class with very many methods usually has several jobs. It changes for several reasons, is hard to test, and is hard to name.',
  suggestion: {
    summary:
      'Look for groups of methods that work on the same data and move each group into its own class; the original class then delegates to or uses them.',
  },
};

export const classSize = defineRule({
  meta: sizeMeta,
  options: z.strictObject({ maxMethods: z.number().int().positive().default(25) }),
  check(file, { maxMethods }) {
    if (isTestFile(file.path)) {
      return [];
    }
    return file.classes.flatMap((c) =>
      c.methods > maxMethods
        ? [
            {
              startLine: c.startLine,
              endLine: c.endLine,
              message: `${classLabel(c.kind)} "${c.name}" has ${c.methods} methods (limit ${maxMethods}).`,
              key: `class:${c.name}`,
            },
          ]
        : [],
    );
  },
});

const cohesionMeta: RuleMeta = {
  id: 'SC-DES-004',
  title: 'Class holds groups of methods that share no state',
  category: 'design',
  defaultSeverity: 'info',
  confidence: 'medium',
  heuristic: true,
  standards: [
    SRP,
    {
      standard:
        'Hitz and Montazeri, Measuring Coupling and Cohesion in Object-Oriented Systems (1995)',
      id: 'LCOM4 (lack of cohesion of methods)',
    },
    EXTRACT_CLASS,
  ],
  rationale:
    "When a class's methods fall into groups that use different data, the class is really several classes sharing one name, which is what the Single Responsibility Principle warns against.",
  suggestion: {
    summary:
      'Split the class along the groups: each group of methods and the data it uses belongs in its own class.',
  },
};

export const classCohesion = defineRule({
  meta: cohesionMeta,
  options: z.strictObject({
    /** How many methods must use the class's state before it is judged. */
    minMethods: z.number().int().positive().default(6),
    /** How many separate groups of methods make a class suspect. */
    minGroups: z.number().int().min(2).default(3),
  }),
  check(file, { minMethods, minGroups }) {
    if (isTestFile(file.path)) {
      return [];
    }
    return file.classes.flatMap((c) =>
      c.cohesion.components >= minGroups && c.cohesion.methods >= minMethods
        ? [
            {
              startLine: c.startLine,
              endLine: c.endLine,
              message: `${classLabel(c.kind)} "${c.name}" has ${c.cohesion.methods} methods that fall into ${c.cohesion.components} groups sharing no state.`,
              key: `class:${c.name}`,
            },
          ]
        : [],
    );
  },
});
