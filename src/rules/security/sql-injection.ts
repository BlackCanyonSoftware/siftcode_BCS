import { z } from 'zod';
import type { AnalyzedFile, CallFact, ValueFact } from '../../languages/model/types.js';
import { defineRule } from '../define.js';
import { isTestFile } from '../shared.js';
import { cheatSheet, cwe, firstArgument, lastValueBefore, owaspTop10, plain } from './shared.js';

/** Methods whose first argument is an SQL statement, across the common database libraries. */
const SQL_METHODS = new Set(
  [
    'execute',
    'executemany',
    'executescript',
    'query',
    'raw',
    'rawquery',
    'exec',
    'execsql',
    'executesql',
    'executereader',
    'executenonquery',
    'executescalar',
    'executereaderasync',
    'executenonqueryasync',
    'executescalarasync',
    'fromsqlraw',
    'executesqlraw',
    'queryrawunsafe',
    'executerawunsafe',
    'readsql',
    'readsqlquery',
    'prepare',
  ].map(plain),
);

/** C# command classes whose constructor takes the SQL text. */
const COMMAND_CLASSES = new Set(
  [
    'SqlCommand',
    'OleDbCommand',
    'OdbcCommand',
    'MySqlCommand',
    'NpgsqlCommand',
    'SqliteCommand',
    'OracleCommand',
  ].map(plain),
);

/** The fixed parts of a string read like SQL: a verb and a clause word. */
export function looksLikeSql(text: string): boolean {
  return (
    /\b(select|insert|update|delete)\b/i.test(text) &&
    /\b(from|into|set|where|values)\b/i.test(text)
  );
}

const isBuiltSql = (value: ValueFact | undefined): boolean =>
  value?.kind === 'dynamic-string' && looksLikeSql(value.text);

/** Whether the SQL statement passed to `call` is built from something not constant. */
function runsBuiltSql(file: AnalyzedFile, call: CallFact): boolean {
  const statement = firstArgument(call);
  if (!statement) {
    return false;
  }
  if (isBuiltSql(statement)) {
    return true;
  }
  // `sql = "SELECT ..." + x; cursor.execute(sql)`: look at what the variable was last given.
  return statement.kind === 'name' && isBuiltSql(lastValueBefore(file, statement.text, call.line));
}

export const sqlInjection = defineRule({
  meta: {
    id: 'SC-SEC-002',
    title: 'SQL statement is built from a variable (SQL injection)',
    category: 'security',
    defaultSeverity: 'warning',
    confidence: 'medium',
    heuristic: true,
    standards: [
      cwe(89, 'Improper Neutralization of Special Elements used in an SQL Command'),
      owaspTop10('A03', 'Injection', 'A03_2021-Injection'),
      cheatSheet('SQL Injection Prevention', 'SQL_Injection_Prevention_Cheat_Sheet'),
    ],
    rationale:
      'When a value is joined into an SQL statement as text, whoever controls the value can change what the statement does, up to reading or destroying the whole database.',
    suggestion: {
      summary:
        'Keep the statement constant and pass values as parameters (placeholders), so the database never reads them as SQL.',
      before: 'cursor.execute("SELECT * FROM users WHERE id = " + user_id)',
      after: 'cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))',
    },
  },
  options: z.strictObject({}),
  check(file) {
    if (isTestFile(file.path)) {
      return [];
    }
    const hits = [];
    for (const call of file.facts.calls) {
      const isSqlCall = call.isNew
        ? COMMAND_CLASSES.has(plain(call.name))
        : SQL_METHODS.has(plain(call.name));
      if (isSqlCall && runsBuiltSql(file, call)) {
        hits.push({
          startLine: call.line,
          endLine: call.line,
          message: `${call.callee}() runs an SQL statement that is built from a variable.`,
          key: call.callee,
        });
      }
    }
    // C#: `command.CommandText = "SELECT ... " + id;`
    for (const entry of file.facts.namedValues) {
      if (entry.name === 'CommandText' && isBuiltSql(entry.value)) {
        hits.push({
          startLine: entry.line,
          endLine: entry.line,
          message: 'CommandText is set to an SQL statement that is built from a variable.',
          key: 'CommandText',
        });
      }
    }
    return hits;
  },
});
