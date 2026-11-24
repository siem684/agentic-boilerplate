# Changelog

All notable changes to this template. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: [SemVer](https://semver.org/), rules in [ADR 0008](docs/template/adr/0008-versioning-and-release.md).

Each entry is grouped by layer and ends with an **Action required** line for spawned projects.

## [Unreleased]

### Agentic layer
- New synced documents in `docs/agentic/`: an index (`README.md`), `architecture.md` (how a run flows from issue to PR, the agents, workflows, context, telemetry, layers), `security-model.md` (who can start the agent, who spends the API key, controls and known gaps), `decisions.md` (one row per ADR with alternatives and status) and `register.md` (what is proven, prescribed, open, and tested only in this template). ADRs 0001-0007 gained an `## Alternatives` section. ADRs 0008-0010 are about the template itself: they moved to the template-only `docs/template/adr/` and are no longer synced. The README is shorter and links the new documents. `tests/agentic/docs-agentic.test.mjs` keeps links and the ADR index from drifting.
- The CI review job runs the `reviewer` agent (`--agent reviewer`) instead of its own inline prompt, so one file holds the review standard. `reviewer` now has a session mode (runs the self-check commands, prints the review) and a CI mode (no self-check, posts one `<!-- claude-review -->` comment with the loop-protection rule), and its output is markdown with `Blocking` and `Suggestions` headings instead of JSON. CI keeps passing `--model` from `REVIEW_MODEL`, which overrides the agent's own Opus. A new test, `tests/agentic/workflow-agents.test.mjs`, fails when a `claude-code-action` step in any workflow has no `--agent` or names an agent that has no file. [ADR 0002](docs/agentic/adr/0002-model-allocation.md) and the architecture document were updated.
- New `scripts/sync.mjs`: brings a spawned project's agentic layer up to a template release. It is a dry-run unless you pass `--apply`. It compares the template at your `boilerplate.lock` version, the template at the target (the latest GitHub Release, or `--to`) and your project, per path of the agentic layer: files you did not touch are added, updated or deleted, files you changed that the template also changed are reported as conflicts and skipped (`--force` takes the template's version). Files only your project has are never touched. `--apply` needs a git repository and refuses when a file it would write, or `boilerplate.lock`, has uncommitted changes. The lock moves to the new version only when no conflict is left. `--diff` shows the changes, `--from`/`--base` use local template trees instead of release tarballs. Exit code 0 nothing to do or applied cleanly, 1 changes pending or conflicts left, 2 the run failed. New helpers `scripts/tar.mjs` (a minimal tar reader) and `scripts/sync-plan.mjs` (the decision table). Listed in `scripts/commands.json`. Tests in `tests/agentic/`.
- The template's tests moved from `tests/` to `tests/agentic/`, a new agentic-layer path, so they are synced with the scripts they cover ([ADR 0009](docs/template/adr/0009-template-files-in-spawned-projects.md)). `tests/**` stays the project's, except `tests/agentic/**`.

### Template-only
- New `CONTRIBUTING.md`, `SECURITY.md` and `docs/template/` (the fork guide and ADRs 0008-0010); `init.mjs` removes them in a spawned project. `tests/docs.test.mjs` checks their links and that no document names the original project.

**Action required:** `ci.yml` is seeded and not synced, so in a project spawned earlier replace the `prompt:` and `claude_args:` of the review step by hand: keep the three context lines (`REPO`, `PR NUMBER`, `PREVIOUS_REVIEWS`), add the line `Review this pull request in CI mode.`, and add `--agent reviewer` as the first line of `claude_args`. Until you do, the new workflow test fails in your project. Projects spawned earlier delete their copies of `docs/agentic/adr/0008-*`, `0009-*` and `0010-*` (they moved to the template repository). Projects spawned from 0.1.0 or 0.2.0 delete their old copies of the moved tests after the first sync (`tests/init`, `check`, `validate`, `vendor`, `telemetry`, `trim-skills`, `protect-paths`, `layers`, `layers-match`, `staleness`, `report` and `run` `.test.mjs`); they are now in `tests/agentic/`. Put your own tests in `tests/`, not in `tests/agentic/`.

## [0.2.0] - 2026-11-24

### Agentic layer
- `protect-paths` hook: path matching is now case-insensitive, `NotebookEdit` is checked (`notebook_path`), and `Bash` commands that write to a protected path are blocked on a best-effort basis. The `settings.json` hook matcher is now `Edit|Write|MultiEdit|NotebookEdit|Bash`. Residual risks (interpreter writes, unprotected `scripts/`) are documented in ADR 0004. Tests in `tests/protect-paths.test.mjs`.
- `claude-dev` no longer hard-codes `master` as the PR base: it runs `gh pr create` without `--base`, so PRs target the repository's default branch (works for `main` and `master`). Guard test in `tests/agents.test.mjs`.
- `qa-tester` no longer depends on a CLAUDE.md section that did not exist: it follows a Tests section if there is one and otherwise matches the existing tests. The seeded `CLAUDE.md` gains a `## Tests` section. A guard test checks that every "X section of CLAUDE.md" an agent mentions exists.
- `init.mjs` now removes every path in the `template-only` layer of `layers.json` (read from there instead of a second list in `placeholders.mjs`): besides `template-ci.yml` that is now `CHANGELOG.md`, `docs/superpowers/**`, `scripts/release.mjs`, `tests/release.test.mjs` and `tests/agents.test.mjs`. A path outside the project is refused. `scripts/release.mjs` is excluded from the synced agentic layer. The template's tests stay in `tests/`; moving them into a synced directory is planned with `sync.mjs` (known gap in [ADR 0009](docs/template/adr/0009-template-files-in-spawned-projects.md)). Tests in `tests/init.test.mjs` and `tests/layers.test.mjs`.
- New `scripts/staleness.mjs`: a read-only check you run when you want to know whether you are behind. It compares the template (with the changelog entries and the agentic-layer files that changed since your version), the pinned BMAD and graphify versions, and the GitHub Actions pinned in your workflows with their latest releases. Exit code 0 current, 1 outdated, 2 a check failed. There is no schedule, workflow or hook ([ADR 0010](docs/template/adr/0010-staleness-is-manual.md)). New `scripts/layers.mjs` (shared glob matching for `layers.json`). Tests in `tests/staleness.test.mjs` and `tests/layers-match.test.mjs`.
- `init.mjs` writes `boilerplate.lock` (`based_on`, `repo`) from the template-only `template.json`, so a project knows which template version it was spawned from. The `CLAUDE.md` "Staying current" text now points at `staleness.mjs` instead of a staleness report issue that nothing creates.
- New `scripts/run.mjs` and `scripts/commands.json`: `node scripts/run.mjs` lists every script grouped by who runs it (you, CI or hooks, template maintainers), `run.mjs help <command>` shows purpose, flags, exit codes and an example, and `run.mjs <command> [flags]` runs `scripts/<command>.mjs` with the same exit code. `commands.json` is the single source of truth; a test fails when a script has no entry. CI and hooks still call the scripts directly. Tests in `tests/run.test.mjs`.
- New `scripts/report.mjs`: a read-only cost and usage report over many runs. It reads `telemetry.jsonl` files (`--from`) and, with `--github [owner/name]`, downloads the `telemetry-*` artifacts of the repository through the GitHub API (token from `GH_TOKEN`, `GITHUB_TOKEN` or `gh auth token`; no `gh` binary needed). Per job (or per week with `--by week`) it shows runs, cost, turns, tokens, cache hit ratio and errors, plus the cost per model; `--since` limits the range and `--json` prints JSON. A run found twice is counted once. Listed in `scripts/commands.json`, so `node scripts/run.mjs report` works. Tests in `tests/report.test.mjs`.

**Action required:** none. The template is not public yet, so no project has been spawned from an earlier version.

## [0.1.0] - 2026-11-24

First release.

### Agentic layer
- Agents: triage, qa-tester, fixer and the `claude-dev` orchestrator.
- Guardrails: `protect-paths` hook, project `settings.json` permission baseline, CODEOWNERS template, issue templates.
- Workflows: agent runner and CI review. `ci.yml` is seeded by `init` (`--check`) and not synced; `template-ci.yml` runs the template's own tests (on Node 22) and is deleted by `init.mjs` in spawned projects. The `check` job is skipped in the template repository itself.
- Review job: fork PRs are skipped, the fix-round count is computed in a step, the model is `vars.REVIEW_MODEL`.
- Actions are pinned to commit SHAs; the skills trim is the shared `scripts/trim-skills.mjs`.
- `dev:deepseek` cannot fall back to `ANTHROPIC_API_KEY` (ADR 0007).
- Scripts: `init` (validates `--check`), `check`, `validate`, `vendor` (list, verify), `telemetry` (tolerates a partial execution file), `release` (requires the repository root).
- ADRs 0001-0008 in `docs/agentic/adr/`.

### Vendored
- `vendor.json` pins BMAD and graphify; `vendor.mjs verify` reports drift.

### Docs
- README with the spawn procedure; design and plan in `docs/superpowers/specs/`.

**Action required:** none (first release).
