# 0007. Model-agnostic via base URL

- Status: proposed (pilot required)

## Context
Non-Claude models need an Anthropic-compatible endpoint. DeepSeek offers `https://api.deepseek.com/anthropic`. claude-code-action officially supports only Anthropic, Bedrock, Vertex and Foundry; passing `ANTHROPIC_BASE_URL` via `env:` is undocumented.

## Decision
Claude is the default. The label `dev:deepseek` on an issue makes a first step in `claude.yml` override the model and `ANTHROPIC_BASE_URL` (from `vars.DEEPSEEK_BASE_URL`, key in a separate secret). Only the main session is switchable; subagents and review stay on Claude.

## Consequences
- If `env:` does not work in the pilot, fall back to a step that runs `claude -p` headless.
- Tool use, subagents and caching may behave differently; telemetry cost is computed per model.
