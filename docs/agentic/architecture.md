# Architecture

How the pieces fit together and what happens from an issue to a merged PR. This describes what is in the repository today; where something is a guess or only tested in this template, the [register](register.md) says so.

## One run, end to end

```
issue or comment with @claude
        |
        v
claude.yml  --- checks out, trims skills, picks the model, runs claude-code-action
        |          as the claude-dev agent (max 40 turns, 45 minutes)
        v
claude-dev (orchestrator)
        |-- triage      acceptance criteria and a PR summary
        |-- qa-tester   failing test first, then the self-check commands
        |-- (claude-dev writes the minimal change itself)
        |-- fixer       only on red, fresh instance per round, at most 2 rounds
        v
branch claude/issue-<nr>-..., PR "Closes #<nr>"
        |
        v
ci.yml  check job    runs the project's check command
        review job   independent review comment (once, plus one automated fix round)
        |
        v
a human reads the PR and merges
```

1. **Trigger.** `claude.yml` starts when a comment, review comment or review contains `@claude`, or when an issue is opened or assigned and its title or body contains `@claude`. Who may trigger it is covered in the [security model](security-model.md).
2. **Setup.** It checks out the repository, trims the installed skills to the four the CI run needs (`scripts/trim-skills.mjs`), and chooses the model: `DEV_MODEL` (default `claude-opus-5-5`), or DeepSeek when the issue carries the label `dev:deepseek` ([ADR 0007](adr/0007-model-agnostic-base-url.md), pilot).
3. **Work.** `claude-dev` follows the per-issue workflow in `CLAUDE.md` and delegates to subagents. It orchestrates because subagents cannot start subagents.
4. **PR.** `claude-dev` pushes a branch `claude/issue-<nr>-...` and opens the PR itself with `gh pr create`. Its `--allowedTools` list contains no merge command; `gh pr merge` and the common spellings of force-push are denied in `settings.json`, but `git push` itself is allowed (see the security model).
5. **Review.** On a PR from a `claude/` branch of the same repository, the `review` job of `ci.yml` runs the `reviewer` agent in CI mode, which posts one review comment starting with `<!-- claude-review -->`. If it finds blocking points and no earlier review exists, it ends with `@claude please fix the blocking findings above`, which starts `claude.yml` once more. After that round it only asks the maintainer to look. The count of earlier reviews is computed by a workflow step, not by the model ([ADR 0003](adr/0003-budget-cap-and-loop-limits.md)).
6. **Merge.** A human decides. Nothing in the setup merges.

## Agents

The template's agents are files in `.claude/agents/` ([ADR 0001](adr/0001-runtime-claude-code-action.md)) and are protected paths: a human edits them. Every agent a workflow starts is one of these files: each `claude-code-action` step names its agent with `--agent`, and a test fails if a step has none or names a file that does not exist. Not defined here are Claude Code's own built-in subagents (such as general-purpose, Explore and Plan), which exist in every session. `claude-code-action` ships no agents of its own.

| Agent | Role | Model | Tools |
|---|---|---|---|
| `claude-dev` | Main session for one issue: orchestrates, implements, opens the PR. | `DEV_MODEL`, default `claude-opus-5-5` | all |
| `triage` | Reads the issue, returns acceptance criteria and a summary as JSON. | `claude-haiku-5-5` | read-only, `gh` |
| `qa-tester` | Writes the failing test first, runs the self-check commands. | `claude-sonnet-5-5` | read, edit, bash |
| `fixer` | Fixes one failing check from a failure report; a fresh instance per round. | `claude-opus-5-5` | read, edit, bash |
| `reviewer` | Read-only review of a diff or PR against the criteria and `CLAUDE.md`. Runs the CI review job and reviews started from a session. | `claude-opus-5-5` when a person starts it; the CI job overrides it with `REVIEW_MODEL` (default `claude-sonnet-5-5`) | read-only, bash |

Who calls whom: `claude-dev` calls `triage`, `qa-tester` and `fixer`. The `reviewer` agent is not called by `claude-dev`. It is started by the `review` job of `ci.yml` (`--agent reviewer`) and by a person who wants a review in a session. It has one review standard and two modes. In a session it runs the self-check commands and prints the review. In CI it does not run them (the `check` job did) and posts one comment; the mode is chosen by the prompt, which carries the PR number and the count of earlier reviews. `--model` on the command line overrides the `model:` in an agent file, which is how the same file runs on Opus for a person and on Sonnet in CI. Models are pinned in the agent files and in the workflow variables; the rationale is in [ADR 0002](adr/0002-model-allocation.md).

## Workflows

| File | Trigger | What it does |
|---|---|---|
| `claude.yml` | `@claude` in an issue, comment or review | Runs `claude-dev`; then telemetry, a budget-overrun comment and an artifact upload. |
| `ci.yml` | Pull requests and pushes to the default branch | `check` runs your check command. `review` runs only for `claude/` branches of the same repository, after `check` passes. |

A third workflow, `template-ci.yml`, runs this template's own tests and exists only in the template repository. All actions are pinned by commit SHA. There are no scheduled workflows: nothing checks for updates on its own.

## Where the agents get context

- **`CLAUDE.md`**: project rules, the per-issue workflow and the self-check commands. `init.mjs` fills in its placeholders when a project is spawned.
- **`docs/adr/`**: your project's decisions. The template's own synced decisions are in `docs/agentic/adr/` (see [decisions](decisions.md)).
- **graphify**: if `graphify-out/GRAPH_REPORT.md` exists, `claude-dev` reads it first and then reads only the files it points to ([ADR 0006](adr/0006-knowledge-graph.md)). graphify is installed per project, not shipped ([vendoring](vendoring.md)).
- **BMAD skills**: `bmad-agent-dev`, `bmad-build`, `bmad-qa-generate-e2e-tests` and `bmad-code-review` are used where installed. The other BMAD skills are removed in CI to save context.

## Telemetry and budget

Each job ends with `scripts/telemetry.mjs`, which reads the action's execution file, appends one line to `telemetry.jsonl`, writes a table to the step summary and uploads both as an artifact kept for 30 days. If the cost is above `MAX_COST_USD_DEV` (default 5) or `MAX_COST_USD_REVIEW` (default 1) the job fails and a comment is posted. That is an alert after the run, not a stop. The hard bounds are `--max-turns` and `timeout-minutes` ([ADR 0003](adr/0003-budget-cap-and-loop-limits.md)). `node scripts/report.mjs` summarises many runs.

## Guardrails

`permissions.deny` in `.claude/settings.json` and the `protect-paths` hook keep agents out of `_bmad/`, `_bmad-output/`, `.claude/` and `.github/workflows/`; `CODEOWNERS` makes the owner the reviewer of `.github/`, `.claude/`, `docs/adr/` and `CLAUDE.md` (not of `_bmad/` or `_bmad-output/`) ([ADR 0004](adr/0004-protected-paths.md)). The limits of these controls are in the [security model](security-model.md).

## Layers and ownership

`layers.json` is the single source of truth for who owns which file. `sync.mjs`, `vendor.mjs`, `check.mjs` and `init.mjs` read it.

| Layer | Owner | Examples | Updated by |
|---|---|---|---|
| `agentic` | the template | `.claude/agents/`, `.claude/hooks/`, `.claude/settings.json`, workflows, `scripts/`, `tests/agentic/`, `docs/agentic/`, `layers.json` | `sync.mjs`, reviewed as a normal PR |
| `vendored` | upstream (BMAD, graphify) | `_bmad/`, `.claude/skills/bmad-*`, `.claude/skills/graphify` | installed at the version pinned in `vendor.json` |
| `project` | your project | `src/`, `tests/` (except `tests/agentic/`), `docs/adr/`, `_bmad-output/` | you |
| seeded | your project, copied once | `CLAUDE.md`, `README.md`, `.github/CODEOWNERS`, `vendor.json`, `ci.yml` | you; sync never overwrites them |
| `template-only` | the template | the changelog, design documents, release script, contributor and fork docs | removed by `init.mjs` in a spawned project |

A path that matches no layer is yours. A project never needs to edit the `agentic` layer by hand; to change it, change the template and sync.
