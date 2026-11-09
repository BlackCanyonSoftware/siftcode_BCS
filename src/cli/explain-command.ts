import { parseArgs } from 'node:util';
import { UsageError } from '../core/errors.js';
import { renderExplanation, renderRuleList } from '../reporters/index.js';
import { ALL_RULES } from '../rules/index.js';
import { EXIT_OK, type Output } from './output.js';
import { lookupRule } from './rule-lookup.js';
import { USAGE } from './usage.js';

/** `siftcode explain [rule-id]`: one rule in full, or the list of all rules when no id is given. */
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
  if (extra.length > 0) {
    throw new UsageError('The explain command takes at most one rule id.');
  }
  if (id === undefined) {
    output.stdout(renderRuleList(ALL_RULES));
    return EXIT_OK;
  }
  const lookup = lookupRule(id);
  if (lookup.found === undefined) {
    const didYouMean =
      lookup.suggestions.length > 0 ? ` Did you mean ${lookup.suggestions.join(', ')}?` : '';
    throw new UsageError(
      `Unknown rule "${id}".${didYouMean} Run "siftcode explain" to list the rules.`,
    );
  }
  output.stdout(renderExplanation(lookup.found));
  return EXIT_OK;
}
