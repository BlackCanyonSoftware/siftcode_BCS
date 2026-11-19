import { addAiSuggestions } from '../ai/enrich.js';
import type { Config } from '../config/schema.js';
import type { ScanResult } from '../core/result.js';
import { UsageError } from '../shared/errors.js';
import type { Output } from './output.js';

/**
 * Adds the AI service\x27s suggestions to a scan, for `siftcode scan --ai`. The `ai` section of the
 * config says which service; without it the flag is an error, not a guess at a default service.
 */
export async function withAiSuggestions(
  result: ScanResult,
  config: Config,
  output: Output,
): Promise<ScanResult> {
  if (config.ai === undefined) {
    throw new UsageError(
      '--ai needs an "ai" section in siftcode.config.json: {"ai": {"provider": "openai" or "anthropic", "model": "..."}}. See the README, "AI suggestions".',
    );
  }
  return addAiSuggestions(result, config.ai, {
    fetch: globalThis.fetch,
    env: process.env,
    announce: (message) => {
      output.stderr(`${message}\n`);
    },
  });
}
