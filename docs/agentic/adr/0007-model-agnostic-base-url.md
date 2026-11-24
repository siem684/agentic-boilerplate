# 0007. Model-agnostic via base URL

- Status: proposed (pilot required)

## Context
Non-Claude models need an Anthropic-compatible endpoint. DeepSeek offers `https://api.deepseek.com/anthropic`. claude-code-action officially supports only Anthropic, Bedrock, Vertex and Foundry; passing `ANTHROPIC_BASE_URL` via `env:` is undocumented.

## Decision
Claude is the default. The label `dev:deepseek` on an issue makes a first step in `claude.yml` override the model and `ANTHROPIC_BASE_URL` (from `vars.DEEPSEEK_BASE_URL`, key in a separate secret). Only the main session is switchable; subagents and review stay on Claude.

## Key handling
The provider decides the key, and there is no fallback between them. With `dev:deepseek` and no `DEEPSEEK_API_KEY` secret the job fails before anything is configured; it never sends `ANTHROPIC_API_KEY` to the DeepSeek endpoint. Any unknown provider resolves to an empty key.

## Consequences
- If `env:` does not work in the pilot, fall back to a step that runs `claude -p` headless.
- Tool use, subagents and caching may behave differently; telemetry cost is computed per model.

## Alternatives
- Bedrock, Vertex or Foundry: the only non-Anthropic providers claude-code-action officially supports; they serve Claude models, so they do not give a non-Claude model.
- A step that runs `claude -p` headless: the fallback if `ANTHROPIC_BASE_URL` set through `env:` does not work in the pilot.
- Falling back to `ANTHROPIC_API_KEY` when the DeepSeek key is missing: rejected, because it would send that key to another provider (see Key handling).
