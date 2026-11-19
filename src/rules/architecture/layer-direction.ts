import ignore from 'ignore';
import { z } from 'zod';
import { defineRepoRule } from '../define.js';
import { dependencyRule } from '../standards.js';
import { buildDependencyGraph } from './graph.js';

const layerSchema = z.strictObject({
  /** The name other layers use to refer to this one in `mayImport`. */
  name: z.string().min(1),
  /** Gitignore-style patterns for the files of the layer (`src/domain/`, `**\/ports/**`). */
  paths: z.array(z.string().min(1)).min(1),
  /** The other layers this one may import from. A layer may always import from itself. */
  mayImport: z.array(z.string().min(1)).default([]),
});

const optionsSchema = z
  .strictObject({ layers: z.array(layerSchema).default([]) })
  .superRefine((options, context) => {
    const names = new Set<string>();
    options.layers.forEach((layer, index) => {
      if (names.has(layer.name)) {
        context.addIssue({
          code: 'custom',
          path: ['layers', index, 'name'],
          message: `Two layers are named "${layer.name}".`,
        });
      }
      names.add(layer.name);
    });
    options.layers.forEach((layer, index) => {
      layer.mayImport.forEach((other, position) => {
        if (!names.has(other)) {
          context.addIssue({
            code: 'custom',
            path: ['layers', index, 'mayImport', position],
            message: `"${other}" is not the name of a layer.`,
          });
        }
      });
    });
  });

export const layerDirection = defineRepoRule({
  meta: {
    id: 'SC-ARC-002',
    title: 'A layer imports a layer it may not depend on',
    category: 'design',
    defaultSeverity: 'warning',
    confidence: 'high',
    heuristic: false,
    standards: [dependencyRule],
    rationale:
      'A layered design is a promise about which code may depend on which: the domain does not know about the database, the user interface is not imported by the business rules. Each import against that direction ties the inner layer to the outer one, so the outer one cannot be replaced, and the inner one cannot be tested or reused without it. The layers and the allowed directions are the ones this project declares in its configuration; the rule reports the imports that break them.',
    suggestion: {
      summary:
        'Remove the import: define an interface in the inner layer for what it needs and let the outer layer implement it (dependency inversion), or move the shared code to a layer both may import.',
      before: "// src/domain/order.ts\nimport { db } from '../infrastructure/db';",
      after:
        '// src/domain/order.ts\nexport interface OrderStore { save(order: Order): void }\n// src/infrastructure/db.ts implements OrderStore',
    },
  },
  options: optionsSchema,
  check(repo, options) {
    if (options.layers.length === 0 || repo.codeFiles.length === 0) {
      return Promise.resolve([]);
    }
    const matchers = options.layers.map((layer) => ({
      layer,
      matches: ignore().add(layer.paths),
    }));
    const layerOf = (path: string) => matchers.find(({ matches }) => matches.ignores(path))?.layer;

    const graph = buildDependencyGraph(repo);
    const seen = new Set<string>();
    const hits = graph.edges.flatMap((edge) => {
      const from = layerOf(edge.from);
      const to = layerOf(edge.to);
      const key = `${edge.from}>${edge.to}`;
      if (!from || !to || from === to || from.mayImport.includes(to.name) || seen.has(key)) {
        return [];
      }
      seen.add(key);
      const allowed =
        from.mayImport.length === 0
          ? 'no other layer'
          : from.mayImport.map((name) => `"${name}"`).join(', ');
      return [
        {
          path: edge.from,
          startLine: edge.line,
          endLine: edge.line,
          message: `The layer "${from.name}" imports the layer "${to.name}" (${edge.to}); it may import ${allowed}.`,
          key: `${from.name}>${to.name}:${edge.to}`,
        },
      ];
    });
    return Promise.resolve(hits);
  },
});
