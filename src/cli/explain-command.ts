import { parseArgs } from 'node:util';
import { UsageError } from '../core/errors.js';
import { renderExplanation } from '../reporters/index.js';
import { ALL_RULES, findRule } from '../rules/index.js';
import { EXIT_OK, type Output } from './output.js';
import { USAGE } from './usage.js';

export function explainCommand(args: readonly string[], output: Output): number {
  const { values, positionals } = parseArgs({
    args: [...args],
    allowPositionals: true,
    options: { help: { type: 'boolean', short: 'h' } },
  });
  if (values.help) {
    output.stdout(USAGE);
    return EXIT_OK;
  }

  const [id, ...extra] = positionals;
  if (id === undefined || extra.length > 0) {
    throw new UsageError('The explain command takes exactly one rule id.');
  }
  const rule = findRule(id.toUpperCase());
  if (!rule) {
    const known = ALL_RULES.map((r) => r.meta.id).join(', ');
    throw new UsageError(`Unknown rule "${id}". Known rules: ${known}.`);
  }
  output.stdout(renderExplanation(rule.meta));
  return EXIT_OK;
}
