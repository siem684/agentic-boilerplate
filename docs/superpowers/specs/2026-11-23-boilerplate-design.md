# Agentic boilerplate: design and plan

Status: draft, awaiting approval. Nothing beyond this document and a README stub is built yet.

## Intent
Extract the agentic development setup proven in the nissimo.nl repo (Claude Code agents, BMAD, graphify, guardrails, CI) into a reusable template. New projects are spawned from it. Other developers can fork it, and they will only trust it if every choice is explained. The setup will change quickly, so staying current is a first-class feature.

## Goals
- Spawn a new project from the template with one documented procedure.
- Ship the whole agentic layer: agents, hooks, permission baseline, CI workflows, BMAD, graphify, ADR habit.
- Extensive documentation: what each part does, why it exists, what was rejected, what is proven vs. still a pilot.
- Spawned projects learn when the template or a vendored part is stale, see what version they are on, the latest version, and the changes in between.
- The template is versioned (SemVer, CHANGELOG, GitHub Releases).

## Non-goals
- No application code or stack opinion. Project-specific rules (static files only, mobile-first, WCAG, personal-data ADR) stay in nissimo.nl.
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
- `.claude/` agents (triage, qa-tester, fixer, dev orchestrator), hooks (protect-paths), project `settings.json` with a permission baseline stricter than a personal one, declared plugins (superpowers) and marketplaces.
- `.github/` workflows (agent runner, CI review, snapshot update, weekly staleness), CODEOWNERS template, issue templates.
- `_bmad/` and BMAD skills (vendored), graphify skill (vendored, my call), `CLAUDE.md` in English with the `/graphify` trigger moved in from the global file.
- `scripts/`: `init.mjs`, `check.mjs`, `vendor.mjs`, `staleness.mjs`, `sync.mjs`, `release.mjs`, telemetry.
- `docs/`: README, architecture of the agentic setup, per-choice ADRs, how-to guides, fork guide, security model, proven-vs-pilot register.

### Spawning
README documents: click "Use this template" (or `gh repo create --template`), run `node scripts/init.mjs` to rename placeholders, set CODEOWNERS, and set secrets/variables (`ANTHROPIC_API_KEY`, `DEV_MODEL`, `MAX_COST_USD_DEV`). `node scripts/check.mjs` (read-only) verifies prerequisites and reports what is missing.

### Global-config gaps covered
graphify vendored; `/graphify` rule moved into project `CLAUDE.md`; baseline denies/allows shipped in project settings; superpowers declared in `enabledPlugins` + `extraKnownMarketplaces`; model/effort set explicitly; personal items (wbso, ssh deploy, credentials) excluded.

### Versioning and staleness
- Template: SemVer, `CHANGELOG.md` (Keep a Changelog) grouped by layer with an **Action required** line, GitHub Releases, git tags. Bump rule recorded in an ADR (major: guardrails/permission/workflow meaning; minor: new agent/skill/script; patch: fixes/docs). `release.mjs` refuses to tag without a changelog entry.
- Spawned projects record `boilerplate.lock` (template version + commit) and `vendor.json` (pinned vendored versions, sources, owned paths, checksums).
- `staleness.mjs` is read-only: compares pinned vs. latest for BMAD, graphify, superpowers pin and the template; prints component, current, latest, and the changes between (release notes, or a compare link when upstream has none). Cached, fails silently offline, uses Node fetch.
- Surfaces: weekly scheduled workflow maintaining one deduplicated "Staleness report" issue (closes when current, never opens PRs); Claude Code SessionStart hook at most once a week; `check.mjs` on demand. The agent reports staleness but must not upgrade.
- Upgrading is manual: `vendor.mjs update <name>` and `sync.mjs` run by a human, producing a normal PR. `vendor.mjs verify` flags local edits to vendored files; customisations go in `_bmad/custom`.

## Open items for the builder
- Verify how BMAD and graphify publish versions and release notes; fall back to compare links.
- Decide sync mechanism details (script vs. Copier-style) during implementation; must only touch agentic-layer paths.
- ADR 0008 (non-Claude models via base URL) stays marked "pilot" in the register.
- License choice for the template (needs the owner's decision before going public).
- Workflows and hooks live in protected paths: only a human edits them.

## Plan (milestones)
1. **Skeleton:** repo layout, `layers.json`, English `CLAUDE.md`, README stub with spawn instructions. Strip project-specific content from the nissimo.nl copy.
2. **Agentic layer port:** agents, hooks, settings baseline, workflows, telemetry, generalised ADRs.
3. **Vendoring:** `vendor.json`, `vendor.mjs`, BMAD and graphify vendored and pinned.
4. **Init, check and spawn flow:** `init.mjs`, `check.mjs`, secrets checklist, test spawning a throwaway repo end to end.
5. **Versioning and release:** CHANGELOG, `release.mjs`, release ADR, first tag `v0.1.0`.
6. **Staleness:** `staleness.mjs`, weekly workflow, SessionStart hook; test with a deliberately outdated pin.
7. **Sync:** `sync.mjs` with dry-run; test against a spawned project.
8. **Documentation pass:** architecture, per-choice rationale, security model, fork guide, proven-vs-pilot register. Review as an outsider: can a new developer decide to trust it from the docs alone?
9. **Go public:** license, secrets scan, then switch visibility deliberately.
