import type { CalledName, CallFact, FileFacts, FileUsage } from '../model/types.js';

/**
 * What a file imports and calls, reduced to the little that rules looking across the whole project
 * need. Each distinct callee appears once, with the line of its first call and a count, so a file
 * that calls one function a hundred times stays small. Sorted, so a result is the same every run.
 */
export function summarizeUsage(
  facts: Pick<FileFacts, 'imports' | 'calls' | 'namespaces'>,
): FileUsage {
  const byCallee = new Map<string, { call: CallFact; line: number; count: number }>();
  for (const call of facts.calls) {
    const seen = byCallee.get(call.callee);
    if (seen) {
      seen.count += 1;
      seen.line = Math.min(seen.line, call.line);
    } else {
      byCallee.set(call.callee, { call, line: call.line, count: 1 });
    }
  }
  const calls: CalledName[] = [...byCallee.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([callee, { call, line, count }]) => ({
      callee,
      name: call.name,
      receiver: call.receiver,
      isNew: call.isNew,
      line,
      count,
    }));
  const namespaces = [...new Set(facts.namespaces)].sort();
  return { imports: [...facts.imports].sort((a, b) => a.line - b.line), namespaces, calls };
}
