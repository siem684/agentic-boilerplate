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
- Model IDs are pinned in agent frontmatter; `staleness` and the changelog flag when they should be revisited.
