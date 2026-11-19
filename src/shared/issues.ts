import type { ZodError } from 'zod';

/** One line per problem, naming the key and what was wrong with it. */
export function describeIssues(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const where = issue.path.length > 0 ? issue.path.map(String).join('.') : '(top level)';
      return `  - ${where}: ${issue.message}`;
    })
    .join('\n');
}
