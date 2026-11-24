# Changelog

All notable changes to this template. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: [SemVer](https://semver.org/), rules in [ADR 0008](docs/agentic/adr/0008-versioning-and-release.md).

Each entry is grouped by layer and ends with an **Action required** line for spawned projects.

## [Unreleased]

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
