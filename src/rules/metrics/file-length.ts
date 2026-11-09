import { z } from 'zod';
import { defineRule } from '../define.js';
import { isTestFile, isVendored } from '../shared.js';

/**
 * Files written by a tool: nobody edits them by hand, so their length says nothing about design.
 * C# designer and `.g.cs` files, protobuf output, minified bundles, and database migrations.
 */
const GENERATED_FILE = /\.(?:g|generated|designer)\.[a-z]+$|_pb2(?:_grpc)?\.pyi?$|\.min\.[a-z]+$/i;
const GENERATED_FOLDERS = new Set(['migrations']);

function isGenerated(path: string): boolean {
  const segments = path.toLowerCase().split('/');
  const file = segments.pop() ?? '';
  return GENERATED_FILE.test(file) || segments.some((s) => GENERATED_FOLDERS.has(s));
}

export const fileLength = defineRule({
  meta: {
    id: 'SC-MET-006',
    title: 'File is too long',
    category: 'maintainability',
    defaultSeverity: 'info',
    confidence: 'medium',
    heuristic: true,
    standards: [
      { standard: 'Clean Code (Martin)', id: 'Chapter 5: Formatting, Vertical Size' },
      {
        standard: 'Single Responsibility Principle (Martin)',
        id: 'A module should have one reason to change',
      },
      {
        standard: 'ESLint',
        id: 'max-lines',
        url: 'https://eslint.org/docs/latest/rules/max-lines',
      },
      {
        standard: 'Pylint',
        id: 'C0302 too-many-lines',
        url: 'https://pylint.readthedocs.io/en/stable/user_guide/messages/convention/too-many-lines.html',
      },
    ],
    rationale:
      'A long file is hard to hold in your head, slow to navigate, and usually gathers several responsibilities, so unrelated changes collide in it.',
    suggestion: {
      summary:
        'Move each cohesive group of functions or classes into its own file, named for what it does. If the file is only data or generated output, exclude it in the config instead.',
    },
  },
  options: z.strictObject({ maxLines: z.number().int().positive().default(500) }),
  check(file, { maxLines }) {
    const exempt = isTestFile(file.path) || isVendored(file.path) || isGenerated(file.path);
    if (file.lineCount <= maxLines || exempt) {
      return [];
    }
    const count = file.units.length;
    const holds = count === 1 ? '1 function or method' : `${count} functions and methods`;
    return [
      {
        startLine: 1,
        endLine: file.lineCount,
        message: `The file is ${file.lineCount} lines long (limit ${maxLines}), with ${holds}.`,
        key: 'file',
      },
    ];
  },
});
