# 0001. Runtime is claude-code-action

- Status: accepted

## Context
Agent work needs one runtime with one permission model and one telemetry path. Alternatives (a Copilot agent template, a custom runner) would duplicate that.

## Decision
All agent work runs on claude-code-action. Agent definitions live in `.claude/agents/`.

## Consequences
- One runtime, one set of permissions and telemetry.
- Agent definitions are protected paths (see 0004); a human edits them.
