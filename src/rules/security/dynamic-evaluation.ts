import { z } from 'zod';
import type { CallFact } from '../../languages/model/types.js';
import { defineRule } from '../define.js';
import { isTestFile } from '../shared.js';
import { cheatSheet, cwe, firstArgument, isConstant, owaspTop10 } from './shared.js';

/** Calls that run text as code, by grammar family. */
const JAVASCRIPT_EVAL = new Set(['eval', 'window.eval', 'global.eval', 'globalThis.eval']);
const JAVASCRIPT_VM = new Set(
  ['runInNewContext', 'runInThisContext', 'runInContext'].map((name) => `vm.${name}`),
);
const PYTHON_EVAL = new Set(['eval', 'exec']);
const CSHARP_SCRIPT = new Set(['CSharpScript.EvaluateAsync', 'CSharpScript.RunAsync']);

/** `new Function(args..., body)`: the last argument is the code. */
function isFunctionConstructor(call: CallFact): boolean {
  const body = call.args.at(-1)?.value;
  return call.name === 'Function' && body !== undefined && !isConstant(body);
}

/** True when `call` is one of `names` and its first argument is not a constant. */
function callsWithVariable(names: ReadonlySet<string>, call: CallFact): boolean {
  const code = firstArgument(call);
  return names.has(call.callee) && code !== undefined && !isConstant(code);
}

function evaluatesText(grammar: string, call: CallFact): boolean {
  switch (grammar) {
    case 'python':
      return callsWithVariable(PYTHON_EVAL, call);
    case 'csharp':
      return callsWithVariable(CSHARP_SCRIPT, call);
    default:
      return (
        isFunctionConstructor(call) ||
        callsWithVariable(JAVASCRIPT_EVAL, call) ||
        callsWithVariable(JAVASCRIPT_VM, call)
      );
  }
}

export const dynamicEvaluation = defineRule({
  meta: {
    id: 'SC-SEC-004',
    title: 'Code is built and run at run time (code injection)',
    category: 'security',
    defaultSeverity: 'warning',
    confidence: 'medium',
    heuristic: true,
    standards: [
      cwe(
        95,
        "Improper Neutralization of Directives in Dynamically Evaluated Code ('Eval Injection')",
      ),
      owaspTop10('A03', 'Injection', 'A03_2021-Injection'),
      cheatSheet('Injection Prevention', 'Injection_Prevention_Cheat_Sheet'),
    ],
    rationale:
      'Running text as code lets anyone who controls the text run their own code with the full privileges of the program. It also defeats static analysis and makes the code hard to follow.',
    suggestion: {
      summary:
        'Avoid evaluating text. Parse data with a data parser (JSON, `ast.literal_eval`), and replace computed code with a lookup table or a function chosen from a fixed set.',
      before: 'const result = eval(userExpression);',
      after: [
        'const operations = { add: (a, b) => a + b, subtract: (a, b) => a - b };',
        'const result = operations[name](a, b);',
      ].join('\n'),
    },
  },
  options: z.strictObject({}),
  check(file) {
    if (isTestFile(file.path)) {
      return [];
    }
    return file.facts.calls
      .filter((call) => evaluatesText(file.grammar, call))
      .map((call) => ({
        startLine: call.line,
        endLine: call.line,
        message: `${call.isNew ? 'new ' : ''}${call.callee}() runs code that is built at run time.`,
        key: call.callee,
      }));
  },
});
