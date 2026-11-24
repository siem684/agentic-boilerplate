# Decisions

One row per decision record in [adr/](adr/): what was chosen, what was rejected, and how well it has been tested (the groups of the [register](register.md)). The ADRs hold the reasoning; this page points to them and does not repeat them. Your project's own decisions go in `docs/adr/`.

The status column is the register's group, not the `Status:` line inside each ADR (which says whether the decision is accepted). Statuses are the register's: **proven** means used in other projects, according to the owner of the template. Where an ADR has no record of the alternatives, the table says "not recorded" and does not guess.

| Decision | Alternatives rejected | Status | ADR |
|---|---|---|---|
| All agent work runs on claude-code-action; agents live in `.claude/agents/`. | A Copilot agent template; a custom runner. | Proven (agents). | [0001](adr/0001-runtime-claude-code-action.md) |
| Opus for the dev session and the fixer, Sonnet for tests and review, Haiku for triage; the dev model is a repository variable. | Not recorded. | Prescribed, not exercised: the allocation is set, the inference choices are not tuned. | [0002](adr/0002-model-allocation.md) |
| Turn and time limits on every job, a cost alert after each run, at most 2 fix rounds and 1 automated review round. | A hard cost stop (the cost is known only after the run). Other limits: not recorded. | Proven as far as telemetry and guardrails go (to confirm); optimising the loops is open. | [0003](adr/0003-budget-cap-and-loop-limits.md) |
| Agents cannot edit `_bmad/`, `_bmad-output/`, `.claude/` or `.github/workflows/`; enforced by deny rules and a hook; `CODEOWNERS`; a human merges. | Deny rules alone or the hook alone: not chosen, why one was not enough is not recorded. Protecting `scripts/` and branch protection: see the ADR's known gaps. | Proven (guardrails). | [0004](adr/0004-protected-paths.md) |
| No real personal data anywhere; test data is fictional. | Not recorded. | Proven (owner: good practice). | [0005](adr/0005-no-personal-data.md) |
| `graphify-out/` is committed and agents read its report first. | Not recorded. | Open for improvement: it helps, and it is not known to be optimal. | [0006](adr/0006-knowledge-graph.md) |
| Claude by default; the label `dev:deepseek` switches the dev session to another model through a base URL, with a separate key and no fallback. | Bedrock, Vertex or Foundry (Claude models only); a headless `claude -p` step (kept as the fallback); falling back to the Anthropic key (rejected). | Pilot: whether the action honours the setting is unverified. | [0007](adr/0007-model-agnostic-base-url.md) |

## Choices without an ADR

These have no decision record. Each has a one-line reason taken from the repository. If one of them needs more than that, it should become an ADR in `docs/agentic/adr/`.

- **GitHub Actions are pinned by commit SHA**, with the version in a comment. A moved tag cannot change what runs, and `node scripts/staleness.mjs` reads the comment to tell you when a pin is behind. Alternatives considered: not recorded.
- **`claude-dev` orchestrates the subagents.** Subagents cannot start subagents, so the main session calls `triage`, `qa-tester` and `fixer` itself and keeps their results as compact JSON ([architecture](architecture.md)).
- **CI keeps only four BMAD skills.** Every installed skill costs a line of context on every run, so `scripts/trim-skills.mjs` removes the rest for the job.
- **No scheduled workflows.** Staleness is checked when someone asks. Reasoning: a start-of-session message or a weekly issue is noise, and a schedule would add a file in a protected path. The decision record is ADR 0010, which lives in the template repository (`docs/template/adr/`), together with ADRs 0008 (versioning and release) and 0009 (which files a spawned project keeps). Those three are about the template itself and are not copied into spawned projects.
