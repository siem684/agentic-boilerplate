# Changelog

All notable changes to this template. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: [SemVer](https://semver.org/), rules in [ADR 0008](docs/agentic/adr/0008-versioning-and-release.md).

Each entry is grouped by layer and ends with an **Action required** line for spawned projects.

## [Unreleased]

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
