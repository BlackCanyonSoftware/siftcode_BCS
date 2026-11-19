import { z } from 'zod';
import { SEVERITIES } from '../shared/severity.js';

/**
 * The `ai` section of `siftcode.config.json`: an AI service that writes a suggestion for a finding,
 * fitted to the code around it. Nothing here runs unless a scan is started with `--ai`, and nothing
 * leaves the machine without it: the scan itself never uses the network (ADR 0018).
 */
export const aiSchema = z.strictObject({
  /**
   * `openai` is any service that speaks the OpenAI chat completions API (OpenAI, Azure OpenAI, Ollama,
   * LM Studio, vLLM, OpenRouter, ...); `anthropic` is the Anthropic Messages API.
   */
  provider: z.enum(['openai', 'anthropic']),
  /** The model name, as the service knows it. There is no default: models change. */
  model: z.string().min(1),
  /**
   * The service's base URL (`https://api.openai.com/v1`, `http://localhost:11434/v1`). The default is
   * the provider's own. Plain `http` is accepted only for this machine (localhost).
   */
  endpoint: z.string().min(1).optional(),
  /**
   * The name of the environment variable that holds the API key. The key is never read from the
   * config file. Defaults to `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`; not needed for localhost.
   */
  apiKeyEnv: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'must be the name of an environment variable')
    .optional(),
  /** Only findings at least this severe get a suggestion. */
  minSeverity: z.enum(SEVERITIES).default('warning'),
  /** At most this many findings are sent, the most severe first. */
  maxFindings: z.number().int().min(1).max(50).default(10),
  /** Lines of code sent above and below a finding. */
  contextLines: z.number().int().min(0).max(30).default(6),
  /** How long to wait for one answer. */
  timeoutSeconds: z.number().int().min(5).max(300).default(60),
  /** Rule ids whose findings are never sent (`SC-SEC-001`, which finds credentials, never is). */
  skipRules: z.array(z.string().min(1)).default([]),
});

export type AiSettings = z.output<typeof aiSchema>;
