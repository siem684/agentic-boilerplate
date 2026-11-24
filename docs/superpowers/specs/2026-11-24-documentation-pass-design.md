# Documentation pass: design (milestone 8)

Status: awaiting approval. Part of [the boilerplate design](2026-11-23-boilerplate-design.md), milestone 8.

## Intent and why
A developer who finds this template should be able to decide whether to trust it from the docs alone, without reading the scripts or asking the owner. The owner also wants to invite other developers to improve it, so the docs must show where the setup is solid, where it is a guess, and how to help. The anti-goal from the main design stands: a setup people copy without understanding it.

## Goals
- Five pieces that do not exist yet: architecture, per-choice rationale, security model, fork guide, proven-vs-pilot register.
- A contributor entry point (`CONTRIBUTING.md`) and a place to report vulnerabilities (`SECURITY.md`). The owner wants other developers to join; this goes beyond the original milestone text.
- A shorter README that gives an overview and links to the rest.
- An outsider review at the end: someone who has not seen the repo reads the docs and says whether they could decide to trust it.

## Non-goals
- No behaviour change to scripts, agents or workflows. Anything the docs reveal as a gap is recorded as a known gap, not fixed here.
- No edits to protected paths (`.claude/`, `.github/workflows/`, `_bmad/`). A workflow change is the owner's, by hand.
- No LICENSE and no visibility switch: milestone 9, the owner decides.
- No mention of where the setup originated. The only provenance claim allowed is "tested in other projects". The three mentions of the original project in the main design spec are replaced by that wording. Older commits keep the name; that is accepted.
- No rewrite of existing ADRs beyond adding missing information (see Rationale).

## Anti-goals
- Docs that repeat ADR text in a second place and drift from it. The decisions index points at ADRs; it does not copy them.
- Claims of "proven" or "secure" that the owner did not make. Every register entry carries the owner's statement, nothing inflated.
- A register that reads as an apology. Open items are framed as where to contribute.

## Approaches
1. **A. Split by audience (chosen by the owner).** Synced docs in `docs/agentic/` for everything a spawned project's owner needs; template-only docs for forking and contributing; README as overview.
2. B. One handbook: simpler but long, hard to review, mixes audiences. Rejected.
3. C. Expand README and ADRs: ADRs suit single decisions, not an overview; README would bloat. Rejected.

## Design

### File layout
Synced (agentic layer, already covered by `docs/agentic/**`):
- `docs/agentic/README.md`: index of the docs, one line each, in reading order.
- `docs/agentic/architecture.md`: the moving parts and how a run flows. Issue or `@claude` mention, workflow, `claude-dev` and its subagents (triage, qa-tester, fixer, reviewer), the PR, the CI review job, the human merge. Where context comes from (CLAUDE.md, graphify, BMAD skills) and where telemetry goes. Layers and ownership (from `layers.json`). A diagram if it earns its place; otherwise text.
- `docs/agentic/security-model.md`: see below.
- `docs/agentic/decisions.md`: one row per ADR: the choice, what was rejected, the register status, link. Also covers choices that have no ADR yet but need a rationale (see Rationale).
- `docs/agentic/register.md`: see below.

Template-only (new path `docs/template/**` and two root files, all added to the `template-only` layer in `layers.json` so `init.mjs` removes them):
- `docs/template/adr/0008-…`, `0009-…`, `0010-…`: moved here from `docs/agentic/adr/` (see Calls made).
- `docs/template/fork-guide.md`: for someone who forks the template to make their own variant: what to change (`template.json` repo, `layers.json`, models, secrets), what to keep, how a fork stays in sync with upstream, how to rename without breaking `sync.mjs`/`staleness.mjs`.
- `CONTRIBUTING.md`: how to help the template itself (see below).
- `SECURITY.md`: how to report a vulnerability privately (GitHub private vulnerability reporting; the owner must enable it, noted as an owner action), what is in scope, a pointer to the security model.

README: keeps title, status and spawn steps. The "What you get" list stays short and links to architecture. Long per-script sections (Updating, Cost report) shrink to a paragraph plus a link to `run.mjs help`. The stale status line ("milestones 1-7") is updated.

### Security model (`security-model.md`)
Structure: assets, who can do what, controls, known gaps. Content comes from the repo, not from memory:
- **Assets:** the API key(s), the repository and default branch, the CI budget, personal data (ADR 0005).
- **Who can trigger the agent.** `claude-code-action` refuses a triggering actor without write access (checked in the action source at the pinned SHA; `allowed_non_write_users` is not set). So a stranger's `@claude` on an issue fails fast, with a visible failed run. Fork PRs get no secrets, and the `ci.yml` review job only runs for `claude/` branches in the same repository.
- **Anyone with write access spends the owner's key.** `ANTHROPIC_API_KEY` is one repository secret; every collaborator's `@claude` is billed to it, and a collaborator can also push a workflow that reads the secret. Budget caps alert after the fact and do not stop a run (ADR 0003). Recorded as a known gap.
- **Supported model for outside contributors (option 1, per the owner):** contributors work from forks and put their own key in their fork's repository secrets; the template workflows run there on their own account. Maintainers with write access are trusted with the shared key; the doc says so plainly and does not recommend other mitigations. (A spend-limited key and an actor allow-list were discussed and are deliberately not documented.)
- **Controls:** protected paths (hook plus deny, ADR 0004), no merge or force-push in `--allowedTools`, CODEOWNERS, SHA-pinned actions, `protect-paths` Bash best-effort, trimmed skills in CI, budget alert, turn limits.
- **Known gaps** copied by reference from ADR 0004 (Bash hook is best effort, `scripts/` unprotected, branch protection unavailable on private free plans) plus the write-access gap above.
- **Residual risk statement:** what a malicious or confused agent can still do.

### Register (`register.md`)
Three groups, each row: component, status, what is claimed, evidence, and (for open rows) "how to help". Statuses as stated by the owner:
- **Proven (used in other projects):** agents, telemetry, guardrails, ADR checking. The register records the owner's statement and does not invent numbers. Assumption to confirm: budget caps count as part of telemetry and guardrails.
- **Prescribed, not exercised:** model allocation (ADR 0002: models are set in agents, inference choices are not tuned) and non-Claude models via base URL (ADR 0007: pilot, `env:` handling in the action unverified).
- **Open for improvement:** loops between dev, test, review and fix (ADR 0003 limits; room to optimise Ralph-style loops); context and cost management (graphify, ADR 0006 helps, not known to be optimal).
- **Built here, tested here only (my addition, owner to confirm):** `init`, `check`, `vendor`, `staleness`, `sync`, `release`, `run`, `report`: covered by this repository's tests and a throwaway-spawn test, not yet run on a real spawned project.

### Rationale (`decisions.md`)
One table, one row per synced ADR (0001-0007), columns: decision, alternatives rejected, status, link. Where an ADR lacks "alternatives rejected", the row says so and the builder adds a short "Alternatives" section to the ADR from what is known in the repo and the main design spec; anything not knowable from the repo is marked "not recorded" rather than invented. Choices without an ADR that need one line of rationale: GitHub Actions pinned by SHA, no scheduled workflows (ADR 0010 covers), `claude-dev` as orchestrator over subagents, trimmed skills in CI. Whether any of these deserves a full ADR is left to the builder; a new ADR goes in `docs/agentic/adr/`.

### Contributing (`CONTRIBUTING.md`)
For the template itself: what kinds of contribution are wanted (pilot reports with numbers, loop and context-cost experiments, new agents, doc fixes), how to run the tests (`node --test "tests/**/*.test.mjs"`, Node 22), the issue-first rule, the protected paths and why a PR touching them needs the owner, the changelog and "Action required" rule (ADR 0008), the no-personal-data rule, and the agent-spend rule: use your own fork and your own key; do not expect `@claude` on the upstream repository to work. Evidence expected to move a register row from "open" or "prescribed" to "proven": a short report in an issue with what ran, on what, and the cost from `report.mjs`. Merging stays the owner's.

### Mechanics
- `layers.json`: add `docs/template/**`, `CONTRIBUTING.md`, `SECURITY.md` to `template-only`. Existing layer tests (`tests/agentic/layers*.test.mjs`) and `init` tests must still pass; add a test that `init` removes the new paths.
- **Link rule (my call):** synced docs (`docs/agentic/**`) never link to template-only files, because those links would be dead in a spawned project. Where a synced doc needs to point to `CONTRIBUTING.md`, `SECURITY.md` or the fork guide, it names them in plain text as files of the template repository, without a link.
- New synced test in `tests/agentic/`: every relative link in `docs/agentic/**/*.md` resolves to a file and does not point at a path of the `template-only` layer; every `docs/agentic/adr/*.md` appears in `decisions.md`. It only reads `docs/agentic/**`, so it cannot fail on project-owned content (README, `docs/adr/`) in a spawned project.
- New template-only test (listed in the `template-only` layer, like `tests/release.test.mjs`): relative links in `README.md`, `CONTRIBUTING.md`, `SECURITY.md` and `docs/template/**` resolve.
- Changelog: an `Unreleased` entry under "Agentic layer" (new synced docs, with `Action required: none`) and one under template-only items. Version is the owner's call (ADR 0008); docs-only is a patch by the rule unless the owner decides otherwise.
- Branch: from `docs/sync-built` (unpushed doc commit) or from master, then PR `Closes` an issue if one exists; the builder asks for or creates the issue per CLAUDE.md. Never merged by the builder.

### Outsider review
After drafting, a fresh subagent that has seen no repo context, given only the README and `docs/agentic/` (and separately `CONTRIBUTING.md`), is asked: could you decide to trust this, what would you still need to know, what looks like marketing. Findings are fixed or listed as known gaps.

## Calls made while writing this (marked as mine, check them)
- **ADR status mapping in `decisions.md`** (0005 is the owner's statement, the rest are my mapping): 0001 runtime: proven (agents); 0002 models: prescribed, not exercised; 0003 budget and loop limits: proven as far as telemetry and guardrails are (assumption), loop optimisation open; 0004 protected paths: proven (guardrails); 0005 no personal data: proven (owner: good practice); 0006 knowledge graph: open for improvement; 0007 base URL: pilot.
- **ADRs 0008, 0009 and 0010 are about the template itself (owner's decision), so they stop being spawned.** They move with `git mv` to `docs/template/adr/` (numbers kept, because the changelog and history cite them), which is in the `template-only` layer, so `init.mjs` deletes them and `sync.mjs` never ships them. `decisions.md` therefore has rows for 0001-0007 only, and the fork guide indexes the three template ADRs. Their register status is covered by the "built here, tested here only" group. Nothing has been spawned yet (changelog 0.2.0), so no project holds copies that would need removing. References to them have to be fixed (11 found): `README.md` (3), `docs/agentic/vendoring.md` (1), `scripts/staleness.mjs` (1), `scripts/sync.mjs` (1) and the old `CHANGELOG.md` links (4) and `scripts/release.mjs` (1). In the synced files the reference becomes plain text or is dropped, because a link would be dead in a spawned project; this is a text-only change to two scripts and needs the existing tests to stay green. Changelog: the move goes in the `Unreleased` entry, with `Action required: none`.
- **Owner confirmations do not block the PR.** The register and `SECURITY.md` ship as drafted, with the open confirmations (budget-caps assumption, "tested here only" group, enabling private vulnerability reporting) listed in the PR body. The owner reviews and merges, which is the confirmation. The repository is still private, so nothing is published unconfirmed.
- **If a fact this doc asserts turns out false** (for example the action's write-permission check or the `ci.yml` same-repo condition): the docs record the true behaviour, the discrepancy is stated in the PR body, and no code is changed.
- **Original-project mentions** in the main design spec: plain substitution with rewording where the sentence needs it; the only provenance claim is that the setup is tested in other projects.

## Left to the builder
- Wording, ordering inside each doc, whether a diagram is worth it.
- How the spawned project's README handles links to template-only docs, which `init.mjs` deletes (the README is seeded and project-owned; links to deleted files must not survive in a spawned project). The builder picks between keeping those links out of the seeded README or having `init.mjs` strip them, and covers it with a test. (The link rule above already covers synced docs.)
- Whether any no-ADR choice earns a full ADR.
- Exact diagram or table forms.

## Owner actions (not done by the builder)
- Enable GitHub private vulnerability reporting before `SECURITY.md` points to it.
- Choose the release version and cut the release.
- Confirm the "Built here, tested here only" group and the budget-caps assumption during PR review.
