import { z } from 'zod';
import type { AnalyzedFile, CallFact, ValueFact } from '../../languages/model/types.js';
import { defineRule } from '../define.js';
import { isTestFile } from '../shared.js';
import {
  cheatSheet,
  cwe,
  firstArgument,
  importsModule,
  keywordArgument,
  optionsEntry,
  owaspTop10,
  plain,
} from './shared.js';

/** A command that is not fixed: built from a variable, or passed in as one. */
function isVariable(value: ValueFact | undefined): boolean {
  if (!value) {
    return false;
  }
  if (value.kind === 'dynamic-string' || value.kind === 'name') {
    return true;
  }
  // A list of constant strings (`["ls", "-l"]`) is as fixed as a string.
  const constantList = /^\[\s*(?:(?:'[^']*'|"[^"]*")\s*,?\s*)+\]$/.test(value.text);
  return value.kind === 'other' && !constantList;
}

const isTrue = (value: ValueFact | undefined): boolean =>
  value?.kind === 'boolean' && /^true$/i.test(value.text);

/** Python calls that always hand their argument to a shell. */
const PYTHON_SHELL_CALLS = new Set([
  'os.system',
  'os.popen',
  'commands.getoutput',
  'commands.getstatusoutput',
  'subprocess.getoutput',
  'subprocess.getstatusoutput',
]);
const PYTHON_SUBPROCESS = new Set(
  ['call', 'run', 'popen', 'check_call', 'check_output'].map((name) => `subprocess.${name}`),
);

/**
 * True when the call is made on `child_process` as the file imported it: `cp.exec(...)` after
 * `const cp = require('child_process')`, or a bare `exec(...)` after importing it by name. A
 * regular expression's `.exec()` in the same file is not.
 */
function isChildProcessCall(file: AnalyzedFile, call: CallFact): boolean {
  const bindings = file.facts.imports
    .filter((entry) => entry.module.replace(/^node:/, '') === 'child_process')
    .flatMap((entry) => entry.bindings);
  const receiverRoot = call.receiver.split('.')[0] ?? '';
  return call.receiver === '' ? bindings.includes(call.name) : bindings.includes(receiverRoot);
}

function javascriptHit(file: AnalyzedFile, call: CallFact): boolean {
  if (!isChildProcessCall(file, call)) {
    return false;
  }
  const name = plain(call.name);
  const command = firstArgument(call);
  if (name === 'exec' || name === 'execsync') {
    return isVariable(command);
  }
  const spawns = ['spawn', 'spawnsync', 'execfile', 'execfilesync'].includes(name);
  return spawns && isTrue(optionsEntry(call, 'shell')) && isVariable(command);
}

function pythonHit(call: CallFact): boolean {
  const callee = call.callee.toLowerCase();
  if (PYTHON_SHELL_CALLS.has(callee)) {
    return isVariable(firstArgument(call));
  }
  return (
    PYTHON_SUBPROCESS.has(callee) &&
    isTrue(keywordArgument(call, 'shell')) &&
    isVariable(firstArgument(call))
  );
}

function csharpHit(file: AnalyzedFile, call: CallFact): boolean {
  if (!importsModule(file, 'System.Diagnostics')) {
    return false;
  }
  const starts =
    call.callee === 'Process.Start' || (call.isNew && call.name === 'ProcessStartInfo');
  return starts && call.args.some((arg) => arg.value.kind === 'dynamic-string');
}

/**
 * `new ProcessStartInfo { Arguments = "-c " + user }` and `info.FileName = $"{user}.exe"`: the
 * properties that name the program and its arguments, set to a string built from a variable. They
 * appear as named values, not as arguments of the creation, so they are looked for in files that use
 * `System.Diagnostics`. A plain variable is not flagged (that needs data-flow analysis, TD-12).
 */
function processStartInfoHits(file: AnalyzedFile) {
  if (file.grammar !== 'csharp' || !importsModule(file, 'System.Diagnostics')) {
    return [];
  }
  return file.facts.namedValues
    .filter(
      (entry) =>
        entry.value.kind === 'dynamic-string' && /(?:^|\.)(?:FileName|Arguments)$/.test(entry.name),
    )
    .map((entry) => {
      const property = entry.name.split('.').pop() ?? entry.name;
      return {
        startLine: entry.line,
        endLine: entry.line,
        message: `ProcessStartInfo.${property} is built from a variable.`,
        key: `ProcessStartInfo.${property}`,
      };
    });
}

export const commandInjection = defineRule({
  meta: {
    id: 'SC-SEC-003',
    title: 'Operating system command is built from a variable (command injection)',
    category: 'security',
    defaultSeverity: 'warning',
    confidence: 'medium',
    heuristic: true,
    standards: [
      cwe(78, 'Improper Neutralization of Special Elements used in an OS Command'),
      owaspTop10('A03', 'Injection', 'A03_2021-Injection'),
      cheatSheet('OS Command Injection Defense', 'OS_Command_Injection_Defense_Cheat_Sheet'),
    ],
    rationale:
      "When part of a command line comes from a variable, whoever controls it can add commands of their own, and the command runs with the program's privileges.",
    suggestion: {
      summary:
        'Do not use a shell: pass the program and its arguments as separate values (an argument list), and validate anything that comes from outside.',
      before: 'subprocess.run("ls " + directory, shell=True)',
      after: 'subprocess.run(["ls", directory])',
    },
  },
  options: z.strictObject({}),
  check(file) {
    if (isTestFile(file.path)) {
      return [];
    }
    const callHits = file.facts.calls.flatMap((call) => {
      const hit =
        file.grammar === 'python'
          ? pythonHit(call)
          : file.grammar === 'csharp'
            ? csharpHit(file, call)
            : javascriptHit(file, call);
      return hit
        ? [
            {
              startLine: call.line,
              endLine: call.line,
              message: `${call.callee}() runs a command that is built from a variable.`,
              key: call.callee,
            },
          ]
        : [];
    });
    return [...callHits, ...processStartInfoHits(file)];
  },
});
