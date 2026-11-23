# 0003. Budget cap and loop limits

- Status: accepted

## Decision
- Every job sets `--max-turns` and `timeout-minutes`.
- A telemetry step compares cost with the repository variable `MAX_COST_USD_DEV`; on overrun the job fails and posts a summary comment.
- The fix loop runs at most 2 rounds, then stops with a status comment.
- The automated review gets at most one fix round.

## Consequences
- Worst-case cost per issue is bounded.
- Caps are tuned from telemetry in each project.
