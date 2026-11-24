# 0003. Budget cap and loop limits

- Status: accepted

## Decision
- Every job sets `--max-turns` and `timeout-minutes`.
- A telemetry step compares cost with the repository variable `MAX_COST_USD_DEV` after the run has finished; on overrun the job fails and posts a summary comment. This is an alert, not a hard stop: it cannot interrupt spending, and `0` disables it. The hard bounds are `--max-turns` and `timeout-minutes`.
- The fix loop runs at most 2 rounds, then stops with a status comment.
- The automated review gets at most one fix round.

## Consequences
- Worst-case cost per issue is bounded by turns and time; the cost variable only reports overruns.
- Caps are tuned from telemetry in each project.

## Alternatives
- A hard cost stop: not what was chosen: the check runs after the run has finished and cannot interrupt spending, so the cap alerts and the turn and time limits are the hard bounds.
- Other loop limits than 2 fixer rounds and 1 automated review round: not recorded.
