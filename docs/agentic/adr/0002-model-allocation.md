# 0002. Model allocation

- Status: accepted

## Decision
| Role | Model |
| --- | --- |
| `claude-dev` (main session) | `claude-opus-5-5`, from repository variable `DEV_MODEL` |
| `fixer` | `claude-opus-5-5`, fresh context per round |
| `qa-tester` | `claude-sonnet-5-5` |
| CI `review` job | `claude-sonnet-5-5` |
| `triage` | `claude-haiku-5-5` |

## Consequences
- The default model is changed through the variable, not through a workflow edit.
- Telemetry reports cost per model.
- Model IDs are pinned in agent frontmatter; `node scripts/staleness.mjs` cannot check them (there is no key-free way to ask which models are current), so it prints a reminder to revisit them, and the changelog flags changes.

## Alternatives
Not recorded. The ADR records the allocation that was chosen, not the options that were considered.
