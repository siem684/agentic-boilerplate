# Changelog

All notable changes to this template. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: [SemVer](https://semver.org/), rules in [ADR 0008](docs/agentic/adr/0008-versioning-and-release.md).

Each entry is grouped by layer and ends with an **Action required** line for spawned projects.

## [Unreleased]

### Agentic layer
- `protect-paths` hook: path matching is now case-insensitive, `NotebookEdit` is checked (`notebook_path`), and `Bash` commands that write to a protected path are blocked on a best-effort basis. The `settings.json` hook matcher is now `Edit|Write|MultiEdit|NotebookEdit|Bash`. Residual risks (interpreter writes, unprotected `scripts/`) are documented in ADR 0004. Tests in `tests/protect-paths.test.mjs`.
- `claude-dev` no longer hard-codes `master` as the PR base: it runs `gh pr create` without `--base`, so PRs target the repository's default branch (works for `main` and `master`). Guard test in `tests/agents.test.mjs`.
- `qa-tester` no longer depends on a CLAUDE.md section that did not exist: it follows a Tests section if there is one and otherwise matches the existing tests. The seeded `CLAUDE.md` gains a `## Tests` section. A guard test checks that every "X section of CLAUDE.md" an agent mentions exists.

**Action required:** (1) after sync, review that the hook still lets your own Bash commands through: a command that names `.claude/`, `_bmad/`, `_bmad-output/` or `.github/workflows/` together with a write (for example `cp`, `rm`, `>`) is now blocked, so do those by hand. (2) Add a `## Tests` section to your CLAUDE.md (it is not synced) naming your test directory, file naming and how to run a single test.

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
