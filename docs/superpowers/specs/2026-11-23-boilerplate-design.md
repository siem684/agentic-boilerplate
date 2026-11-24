# Agentic boilerplate: design and plan

Status: approved and built. All 9 milestones are done, v0.3.0 is released and the repository is public under the MIT licence (made public on 2026-11-24). Milestone 7 (sync) is described in [its design](2026-11-24-sync-design.md) and milestone 8 (documentation pass) in [its design](2026-11-24-documentation-pass-design.md). Two additions beyond the original plan shipped in v0.2.0: `run.mjs` (command index and dispatcher, see [its design](2026-11-24-run-dispatcher-design.md)) and `report.mjs` (cost and usage report over many runs).

## Intent
Extract the agentic development setup that has been tested in other projects (Claude Code agents, BMAD, graphify, guardrails, CI) into a reusable template. New projects are spawned from it. Other developers can fork it, and they will only trust it if every choice is explained. The setup will change quickly, so staying current is a first-class feature.

## Goals
- Spawn a new project from the template with one documented procedure.
- Ship the whole agentic layer: agents, hooks, permission baseline, CI workflows, BMAD, graphify, ADR habit.
- Extensive documentation: what each part does, why it exists, what was rejected, what is proven vs. still a pilot.
- A spawned project's owner can ask, at any time, whether the template or a dependency is stale and see the current version, the latest, and the changes in between.
- The template is versioned (SemVer, CHANGELOG, GitHub Releases).

## Non-goals
- No application code or stack opinion. Project-specific rules (static files only, mobile-first, WCAG, personal-data ADR) stay in the project that needs them.
- No automatic upgrades or auto-merged PRs. Merging stays a human decision.
- No packaging of the agentic layer as a plugin (CI workflows cannot be packaged that way).

## Anti-goals
- A setup people copy without understanding it.
- A template whose guardrails silently depend on one person's global `~/.claude/`.
- Staleness warnings that nag, break offline work, or let the agent upgrade things itself.

## Approaches considered
1. GitHub template repo only: simplest, but spawned projects drift. Rejected.
2. **Template plus sync mechanism (chosen):** spawn from the template; a documented script pulls only files marked as the agentic layer. Project files stay untouched.
3. Versioned plugin/skill pack: cleanest, but cannot carry CI workflows or settings. Rejected.

## Design

### Layers and ownership
Every file belongs to one of: **agentic layer** (owned by the template, synced), **vendored** (owned by upstream, pinned), **project** (owned by the spawned project, never synced). A manifest (`layers.json`) lists the agentic-layer paths so sync and docs share one source of truth.

### Contents
- `.claude/` agents (triage, qa-tester, fixer, dev orchestrator), hooks (protect-paths), project `settings.json` with a permission baseline stricter than a personal one. No plugins are declared: superpowers was only used to design this template and is neither shipped nor referenced in spawned projects.
- `.github/` workflows (agent runner, CI review), CODEOWNERS template, issue templates. No scheduled workflows: staleness is checked on request only.
- `_bmad/` and BMAD skills (vendored), graphify skill (vendored, my call), `CLAUDE.md` in English with the `/graphify` trigger moved in from the global file.
- `scripts/`: `init.mjs`, `check.mjs`, `vendor.mjs`, `staleness.mjs`, `sync.mjs`, `release.mjs`, telemetry.
- `docs/`: README, architecture of the agentic setup, per-choice ADRs, how-to guides, fork guide, security model, proven-vs-pilot register.

### Spawning
README documents: click "Use this template" (or `gh repo create --template`), run `node scripts/init.mjs` to rename placeholders, set CODEOWNERS, and set secrets/variables (`ANTHROPIC_API_KEY`, `DEV_MODEL`, `MAX_COST_USD_DEV`). `node scripts/check.mjs` (read-only) verifies prerequisites and reports what is missing.

### Global-config gaps covered
graphify vendored; `/graphify` rule moved into project `CLAUDE.md`; baseline denies/allows shipped in project settings; model/effort set explicitly; personal items (wbso, ssh deploy, credentials) excluded.

### Versioning and staleness
- Template: SemVer, `CHANGELOG.md` (Keep a Changelog) grouped by layer with an **Action required** line, GitHub Releases, git tags. Bump rule recorded in an ADR (major: guardrails/permission/workflow meaning; minor: new agent/skill/script; patch: fixes/docs). `release.mjs` refuses to tag without a changelog entry.
- The template records its own version in `template.json` (`{ version, repo }`, template-only, hand-edited in the release PR; `release.mjs` refuses to tag if it differs from the release). `init.mjs` copies it into `boilerplate.lock` (`{ based_on, repo }`) in the spawned project. "Use this template" copies the branch head with fresh history, so the lock names the last released version, not a commit; a project spawned between releases may be slightly newer than `based_on`. Sync updates the lock. Spawned projects also record `vendor.json` (pinned vendored versions and sources).
- **Staleness is manual** ([ADR 0010](../../template/adr/0010-staleness-is-manual.md)). `node scripts/staleness.mjs` is read-only and runs only when someone invokes it: no schedule, no SessionStart hook, no issue, no cache. It checks every external dependency and reports component, current, latest, and what changed:
  - **Template:** `boilerplate.lock` against the latest GitHub Release of `repo`. Lists the CHANGELOG entries between the two versions with their "Action required" lines, and the agentic-layer files that changed between the two release tags (GitHub compare API filtered through `layers.json`), plus a compare link.
  - **BMAD and graphify:** the pin in `vendor.json` against npm and PyPI; registries have no changelog, so the report links to the upstream releases page.
  - **GitHub Actions** in the project's workflows: the `# vX` comment next to each SHA pin against the action's latest release.
  - **Not checked:** model IDs (no key-free way to ask); a one-line reminder points to ADR 0002.
  - Failures are reported per component, never hidden. Exit code 0 all current, 1 something outdated, 2 a check failed (takes precedence). GitHub calls use `GH_TOKEN` or `gh auth token` when present and say so when rate-limited. The agent may run it when asked and report, but must not upgrade.
- Upgrading is manual: `vendor.mjs update <name>` and `sync.mjs` run by a human, producing a normal PR. `vendor.mjs verify` flags local edits to vendored files; customisations go in `_bmad/custom`.

## Open items for the builder
- Verify how BMAD and graphify publish versions and release notes; fall back to compare links.
- Decide sync mechanism details (script vs. Copier-style) during implementation; must only touch agentic-layer paths.
- ADR 0007 (non-Claude models via base URL) stays marked "pilot" in the register.
- License choice for the template (needs the owner's decision before going public).
- Workflows and hooks live in protected paths: only a human edits them.

## Plan (milestones)
1. **Skeleton:** repo layout, `layers.json`, English `CLAUDE.md`, README stub with spawn instructions. Strip project-specific content from the copy the setup was taken from.
2. **Agentic layer port:** agents, hooks, settings baseline, workflows, telemetry, generalised ADRs.
3. **Vendoring:** `vendor.json`, `vendor.mjs`, BMAD and graphify vendored and pinned.
4. **Init, check and spawn flow:** `init.mjs`, `check.mjs`, secrets checklist, test spawning a throwaway repo end to end.
5. **Versioning and release:** CHANGELOG, `release.mjs`, release ADR, first tag `v0.1.0`.
6. **Staleness:** `template.json`, `boilerplate.lock` and `staleness.mjs` (manual, see above); test with a deliberately outdated pin against a local stub server. No workflow or hook, so nothing in a protected path. Built together with `run.mjs` and `report.mjs` (v0.2.0).
7. **Sync (built and merged, unreleased):** `sync.mjs` with dry-run; tested against a spawned project. The template's tests moved into the synced `tests/agentic/` so they follow the scripts they cover; the gap in [ADR 0009](../../template/adr/0009-template-files-in-spawned-projects.md) is closed. Details and build decisions: [sync design](2026-11-24-sync-design.md).
8. **Documentation pass (built, for review):** architecture, security model, decisions index, proven-vs-pilot register, fork guide, `CONTRIBUTING.md`, `SECURITY.md` and a shorter README, with tests that keep links and the ADR index honest. ADRs 0008-0010 moved to the template-only `docs/template/adr/`. Details: [documentation pass design](2026-11-24-documentation-pass-design.md). An outsider review of the docs is part of the milestone.
9. **Go public (done 2026-11-24):** license, secrets scan, then switch visibility deliberately. MIT licence added; the full history was scanned (a regex pass and gitleaks, both clean); the owner chose to keep the git history as it was; private vulnerability reporting was enabled after the switch, because GitHub offers it only on public repositories.
