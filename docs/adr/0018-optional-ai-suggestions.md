# ADR 0018: Optional AI suggestions

- Status: accepted
- Date: 2026-11-18

## Context

Each rule carries one general suggestion, with a before and an after. For a finding in a particular piece of code, a model can say what to change in that code. The roadmap listed this as deferred "(needs owner approval: paid service, sends code out)". The owner approved building it as an opt-in for people who have an AI service: it changes the security model (code can leave the machine), so the constraints below are the decision.

## Decisions

### Off unless asked, and never in the scan

`siftcode scan --ai` is the only way in. The `ai` section of the config names the service but does nothing without the flag: a config file checked into a repository cannot turn it on for whoever runs a scan. The scan (`src/core`) is unchanged and still never uses the network; the AI step (`src/ai`) runs afterwards on the finished result, and nothing in `src/core` imports it. `AGENTS.md` states the exception.

### Which service

Two providers, because between them they cover the services people have: `openai` for anything that speaks the OpenAI chat completions API (OpenAI itself, Azure OpenAI, Ollama, LM Studio, vLLM, OpenRouter) and `anthropic` for the Messages API. A local model through Ollama or LM Studio is the case where no code leaves the machine. No new dependency: the global `fetch` of Node 24. The model name is required, with no default, because defaults go stale.

### What may go to a service

- **Not credentials.** Findings from `SC-SEC-001` are never sent (the code they point at is the secret), whatever `skipRules` says. Every excerpt is also passed through a redaction that replaces known key formats, a password in a URL, a quoted value given to a name like `password` or `apiKey`, and a long generated-looking literal with `[redacted]`. It errs toward removing too much. It is a pattern list, not a guarantee (TD-33).
- **Only the lines around a finding**, `contextLines` (6) above and below, at most 4,000 characters, plus the rule's own explanation. Nothing else in the project is read: not other files, not the config.
- **The most severe findings only**: `minSeverity` (default `warning`) and `maxFindings` (default 10). A path that leads outside the scanned folder is never read.
- **Told first.** Before the first request, SiftCode prints how many excerpts, how many lines, from how many files, to which host, and whether that host is this machine.

### How the key and the connection are kept safe

The key comes from an environment variable (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or the one in `apiKeyEnv`) and is refused in the config (an unknown key there is a configuration error). A service on another machine must use `https`; plain `http` is allowed for `localhost` only, and only there may the key be absent. The key is sent in the provider's header, never printed, and removed from an error message even if the service echoed it. A refused key (401, 403) stops the run at once; three failures in a row stop it too; a timeout is set per request.

### What the answer is

Untrusted text from a model. It is cut at 3,000 characters, stripped of control characters, and shown as text: escaped in Markdown (as a quotation), escaped in HTML (inside a code block with the same keyboard stop and copy button as the report's own examples), a string in JSON (`aiSuggestion: { text, model }`) and a property in SARIF. Every place says it was written by a model and is not reviewed. It is not in the fingerprint and not in a baseline, and it changes neither what a scan finds nor its exit code: a service that is down leaves the findings as they were and adds a note.

### Request shapes

OpenAI's own host gets `max_completion_tokens` and no custom temperature (newer models reject `max_tokens` and a changed temperature); every other OpenAI-compatible service gets `max_tokens` and a temperature of 0.2; Anthropic gets `x-api-key`, `anthropic-version: 2023-06-01`, and `system` as a field.

## Verification, and what was not verified

Verified: a fake `fetch` for the request and response shapes of both providers, the refusal paths, the key never appearing in an error, and the cut and cleaning of an answer; a real HTTP server on `127.0.0.1` driving `siftcode scan --ai` end to end in text, Markdown, HTML, JSON, and SARIF, including that nothing is sent without `--ai`; and that a credential in the lines around another finding is redacted from the request body.

**Not verified: a live OpenAI or Anthropic account.** No key was available, so the request fields and the response paths follow the providers' public documentation and may need adjusting for a particular model or API version (TD-33). The quality of the suggestions was not assessed: that depends on the model.

## Consequences

- The security model has one documented exception, in one folder, that the user must ask for with a flag every time.
- Cost is the user's: one request per finding, up to `maxFindings`, with no token budget (TD-33).
- Reports made with `--ai` differ from reports made without it, so the same scan is not byte-identical when it is used; the JSON schema version is unchanged because the field is only added.
