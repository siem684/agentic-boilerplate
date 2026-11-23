# Changelog

All notable changes to this template. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: [SemVer](https://semver.org/), rules in [ADR 0008](docs/agentic/adr/0008-versioning-and-release.md).

Each entry is grouped by layer and ends with an **Action required** line for spawned projects.

## [Unreleased]

### Agentic layer
- `ci.yml` is now seeded (init fills in `--check`) and no longer synced; `template-ci.yml` runs the template's own tests and is deleted by `init.mjs` in spawned projects.
- Review job: fork PRs are skipped, the fix-round count is computed in a step, the model is `vars.REVIEW_MODEL`.
- Actions pinned to commit SHAs; the skills trim is the shared `scripts/trim-skills.mjs`.
- `dev:deepseek` can no longer fall back to `ANTHROPIC_API_KEY` (ADR 0007).
- `init.mjs` validates `--check`; `release.mjs` requires the repository root; `telemetry.mjs` tolerates a partial execution file.

**Action required:** replace your `.github/workflows/` files with the template's, then re-apply your check command to `ci.yml`.

## [0.1.0] - 2026-11-23

First release.

### Agentic layer
- Agents: triage, qa-tester, fixer and the `claude-dev` orchestrator.
- Guardrails: `protect-paths` hook, project `settings.json` permission baseline, CODEOWNERS template, issue templates.
- Workflows: agent runner and CI review.
- Scripts: `init`, `check`, `validate`, `vendor` (list, verify), `telemetry`, `release`.
- ADRs 0001-0008 in `docs/agentic/adr/`.

### Vendored
- `vendor.json` pins BMAD and graphify; `vendor.mjs verify` reports drift.

### Docs
- README with the spawn procedure; design and plan in `docs/superpowers/specs/`.

**Action required:** none (first release).
