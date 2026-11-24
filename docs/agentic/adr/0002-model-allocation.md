# 0002. Model allocation

- Status: accepted

## Decision
| Role | Model |
| --- | --- |
| `claude-dev` (main session) | `claude-opus-5-5`, from repository variable `DEV_MODEL` |
| `fixer` | `claude-opus-5-5`, fresh context per round |
| `qa-tester` | `claude-sonnet-5-5` |
| `reviewer` started by a person | `claude-opus-5-5`, the `model:` in the agent file |
| CI `review` job | the `reviewer` agent on `claude-sonnet-5-5`, from repository variable `REVIEW_MODEL`, passed as `--model` |
| `triage` | `claude-haiku-5-5` |

## Consequences
- The default model is changed through the variable, not through a workflow edit.
- The `model:` in an agent file is a default. A `--model` flag overrides it, and the CI review job relies on that to run the `reviewer` agent on Sonnet. Checked locally with Claude Code 2.1.318 on 2026-11-24 (`--agent reviewer --model claude-haiku-5-5` billed only Haiku; without the flag the agent ran on its own model). Not yet checked in the action's bundled Claude Code: read the model in the first CI run's telemetry.
- Telemetry reports cost per model.
- Model IDs are pinned in agent frontmatter; `node scripts/staleness.mjs` cannot check them (there is no key-free way to ask which models are current), so it prints a reminder to revisit them, and the changelog flags changes.

## Alternatives
Not recorded. The ADR records the allocation that was chosen, not the options that were considered.
