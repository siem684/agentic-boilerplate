# Changelog

All notable changes to this template. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: [SemVer](https://semver.org/), rules in [ADR 0008](docs/agentic/adr/0008-versioning-and-release.md).

Each entry is grouped by layer and ends with an **Action required** line for spawned projects.

## [Unreleased]

### Agentic layer
- `protect-paths` hook: path matching is now case-insensitive, `NotebookEdit` is checked (`notebook_path`), and `Bash` commands that write to a protected path are blocked on a best-effort basis. The `settings.json` hook matcher is now `Edit|Write|MultiEdit|NotebookEdit|Bash`. Residual risks (interpreter writes, unprotected `scripts/`) are documented in ADR 0004. Tests in `tests/protect-paths.test.mjs`.
- `claude-dev` no longer hard-codes `master` as the PR base: it runs `gh pr create` without `--base`, so PRs target the repository's default branch (works for `main` and `master`). Guard test in `tests/agents.test.mjs`.
- `qa-tester` no longer depends on a CLAUDE.md section that did not exist: it follows a Tests section if there is one and otherwise matches the existing tests. The seeded `CLAUDE.md` gains a `## Tests` section. A guard test checks that every "X section of CLAUDE.md" an agent mentions exists.
- `init.mjs` now removes every path in the `template-only` layer of `layers.json` (read from there instead of a second list in `placeholders.mjs`): besides `template-ci.yml` that is now `CHANGELOG.md`, `docs/superpowers/**`, `scripts/release.mjs`, `tests/release.test.mjs` and `tests/agents.test.mjs`. A path outside the project is refused. `scripts/release.mjs` is excluded from the synced agentic layer. The template's tests stay in `tests/`; moving them into a synced directory is planned with `sync.mjs` (known gap in [ADR 0009](docs/agentic/adr/0009-template-files-in-spawned-projects.md)). Tests in `tests/init.test.mjs` and `tests/layers.test.mjs`.
- New `scripts/staleness.mjs`: a read-only check you run when you want to know whether you are behind. It compares the template (with the changelog entries and the agentic-layer files that changed since your version), the pinned BMAD and graphify versions, and the GitHub Actions pinned in your workflows with their latest releases. Exit code 0 current, 1 outdated, 2 a check failed. There is no schedule, workflow or hook ([ADR 0010](docs/agentic/adr/0010-staleness-is-manual.md)). New `scripts/layers.mjs` (shared glob matching for `layers.json`). Tests in `tests/staleness.test.mjs` and `tests/layers-match.test.mjs`.
- `init.mjs` writes `boilerplate.lock` (`based_on`, `repo`) from the template-only `template.json`, so a project knows which template version it was spawned from. The `CLAUDE.md` "Staying current" text now points at `staleness.mjs` instead of a staleness report issue that nothing creates.
- New `scripts/run.mjs` and `scripts/commands.json`: `node scripts/run.mjs` lists every script grouped by who runs it (you, CI or hooks, template maintainers), `run.mjs help <command>` shows purpose, flags, exit codes and an example, and `run.mjs <command> [flags]` runs `scripts/<command>.mjs` with the same exit code. `commands.json` is the single source of truth; a test fails when a script has no entry. CI and hooks still call the scripts directly. Tests in `tests/run.test.mjs`.

**Action required:** (1) after sync, review that the hook still lets your own Bash commands through: a command that names `.claude/`, `_bmad/`, `_bmad-output/` or `.github/workflows/` together with a write (for example `cp`, `rm`, `>`) is now blocked, so do those by hand. (2) Add a `## Tests` section to your CLAUDE.md (it is not synced) naming your test directory, file naming and how to run a single test. (3) Create `boilerplate.lock` in a project spawned from 0.1.0: `{ "based_on": "0.1.0", "repo": "siem684/agentic-boilerplate" }`, so `staleness.mjs` can check the template. (4) Update the "Staying current" paragraph of your CLAUDE.md (it is not synced) to mention `node scripts/staleness.mjs`. (5) Projects spawned before this change can delete `CHANGELOG.md`, `docs/superpowers/`, `scripts/release.mjs`, `tests/release.test.mjs` and `tests/agents.test.mjs` if they carry them. (6) Optional: copy `tests/run.test.mjs` into your tests if you want the guard that every script has an entry in `scripts/commands.json`; `run.mjs` itself needs no action.

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
