# Proven and not proven

What has been used for real, what is only prescribed, and where help is wanted. The statuses are the template owner's statements, recorded as given. This page invents no numbers: where a figure or an evidence trail is not in the repository, it says "not recorded". The reasoning behind each decision is in [decisions](decisions.md).

How to read the groups: **proven** means used in other projects; **prescribed, not exercised** means the setup says what to do but it has not been tried; **open for improvement** means it works but nobody claims it is optimal; **built here, tested here only** means covered by this template's own tests and not yet run on a real spawned project.

## Proven (used in other projects)

| Component | Claim | Evidence |
|---|---|---|
| Agents | The agent setup (a dev orchestrator with triage, test and fix subagents) is used in other projects. | The owner's statement that they were used in other projects. Whether this covers each of the five agent files, including `reviewer`, is not recorded. |
| Telemetry | Per-run cost and usage are recorded and visible. | The owner's statement. Budget caps are counted here as part of telemetry and guardrails: **to confirm** during review. They alert after a run and do not stop spending ([ADR 0003](adr/0003-budget-cap-and-loop-limits.md)). |
| Guardrails | Protected paths, deny rules, the hook and the human merge keep agents inside their lane ([ADR 0004](adr/0004-protected-paths.md)). | The owner's statement. The limits are in the [security model](security-model.md). |
| ADR checking | Reviews check changes against the project's decisions in `docs/adr/`. | The owner's statement. |

## Prescribed, not exercised

| Component | Claim | Evidence | How to help |
|---|---|---|---|
| Model allocation | Opus for the dev session and fixer, Sonnet for tests and review, Haiku for triage ([ADR 0002](adr/0002-model-allocation.md)). | Not exercised. The models are set in the agent files; the inference choices are not tuned. | Report a run with a different allocation: what ran, on what, and the cost from `node scripts/report.mjs`. |
| Non-Claude models via a base URL | The label `dev:deepseek` runs the dev session on another model ([ADR 0007](adr/0007-model-agnostic-base-url.md)). | Pilot. Whether the action honours `ANTHROPIC_BASE_URL` set through `env:` is unverified. | Run it once and report the outcome, including a failure. If it does not work, the ADR names the fallback to try. |

## Open for improvement

| Component | Claim | Evidence | How to help |
|---|---|---|---|
| Loops between dev, test, review and fix | The limits keep a run bounded: 2 fix rounds, 1 automated review round, turn and time limits ([ADR 0003](adr/0003-budget-cap-and-loop-limits.md)). | They work as limits. That they are the right numbers, or the right shape, is not shown; there is room to try Ralph-style loops. | Run a different loop on a real issue and report the quality of the result and the cost. |
| Context and cost management | The knowledge graph and selective reading cut the context an agent spends on exploration ([ADR 0006](adr/0006-knowledge-graph.md)). | It helps; it is not known to be optimal, and no comparison with other approaches is recorded. | Compare token cost on the same issue with and without the graph, or with another approach. |

## Built here, tested here only

`init`, `check`, `vendor`, `staleness`, `sync`, `release`, `run` and `report` are scripts built in this template. They are covered by this repository's tests, including a test that spawns a throwaway project, and have not yet been run on a real spawned project. `release` exists only in the template repository. The decisions about versioning, which template files a spawned project keeps and why staleness is checked on request are ADRs 0008 to 0010, also in the template repository. This group is the template author's addition to the owner's statement and is **to confirm** during review.

| Component | Claim | Evidence |
|---|---|---|
| `init`, `check` | Fill in a new project and report what is missing. | Unit tests and the throwaway-spawn test. |
| `vendor`, `staleness` | Pin and verify vendored tools; report what is behind. | Unit tests, with stub servers for the network. |
| `sync` | Bring a spawned project's agentic layer up to a release as a normal PR. | Unit and integration tests. |
| `release`, `run`, `report` | Tag a release; list the commands; summarise telemetry. | Unit tests. |
