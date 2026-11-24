# Documentation Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship milestone 8: architecture, security model, decisions index, proven-vs-pilot register, fork guide, `CONTRIBUTING.md`, `SECURITY.md` and a shorter README, with tests that keep the docs honest.

**Architecture:** Docs split by audience. Synced docs in `docs/agentic/`; template-only docs in `docs/template/` plus `CONTRIBUTING.md` and `SECURITY.md` (all in the `template-only` layer, deleted by `init.mjs`). ADRs 0008-0010 move to `docs/template/adr/`. Two doc tests keep links and the ADR index from drifting.

**Tech Stack:** Markdown, Node 22 `node:test` (ESM `.mjs`), no new dependencies.

**Spec:** [docs/superpowers/specs/2026-11-24-documentation-pass-design.md](../specs/2026-11-24-documentation-pass-design.md). Read it first: it holds the register statuses, the security-model content and the calls already made.

## Global Constraints
- Code, comments, commits, docs in English. Repo files are LF. Keep diffs focused (CLAUDE.md).
- Do not edit `_bmad/`, `_bmad-output/`, `.claude/`, `.github/workflows/`. Never merge, tag, or push without the user. Never edit `CODEOWNERS`.
- No script behaviour changes. The only script edits are comment text in `scripts/staleness.mjs` and `scripts/sync.mjs`.
- Synced docs (`docs/agentic/**`) never link to template-only paths; they name such files in plain text.
- The only provenance claim in any doc is "tested in other projects". The original project's name appears in no doc (a test enforces it).
- Register statuses are exactly those in the spec; never infer a stronger one. Where something is not knowable from the repo write "Not recorded", never invent.
- Run tests with Node 22 in glob form: `node --test "tests/**/*.test.mjs"`. Use relative or `C:/` paths for node on Windows. The Bash tool prints a harmless "claude-...-cwd: No such file" error after commands; judge by the real output.
- Git: keep `git add` and `git commit` as separate calls. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Pushing needs `git -c credential.helper= -c credential.helper='!gh auth git-credential' push ...` and only when the user asks.

## Review Focus
Failure modes the spec implies that no single task's main tests cover; each has a pinning test in the task named.
1. A synced doc links to a template-only file: a dead link in every spawned project (Task 3).
2. The seeded README keeps a link to a file `init.mjs` deletes (Task 4).
3. `init.mjs` leaves part of `docs/template/`, `CONTRIBUTING.md` or `SECURITY.md` behind (Task 2).
4. A link checker that miscounts: links in code spans or fences, `#fragment`, `?query`, URLs, `mailto:` must not produce false failures or hide dead links (Task 3).
5. Docs drift from the ADRs: an ADR missing from `decisions.md`, or a status contradicting the ADR file (ADR 0007 must read "pilot") (Task 7).
6. The original project's name leaks into a doc (Task 10).

---

### Task 1: Branch and baseline

**Files:** none changed yet.

- [ ] **Step 1:** Fetch (`git -c credential.helper= -c credential.helper='!gh auth git-credential' fetch origin`), then create `docs/documentation-pass` from `origin/master`. Cherry-pick `b980177` (the unpushed commit on `docs/sync-built` that records milestone 7) so the PR carries it. Carry over the untracked design and plan files and commit them: `git add docs/superpowers/specs/2026-11-24-documentation-pass-design.md docs/superpowers/plans/2026-11-24-documentation-pass.md`, commit "Add documentation pass design and plan".
- [ ] **Step 2:** Run `node --test "tests/**/*.test.mjs"`. Expected: all pass (about 190 pass, 1 skipped on Windows). Note the counts; later tasks must not reduce them.

### Task 2: Template-only paths for the new docs

**Files:**
- Modify: `layers.json` (`template-only.paths`: add `docs/template/**`, `CONTRIBUTING.md`, `SECURITY.md`, `tests/docs.test.mjs`; `project.exclude`: add `tests/docs.test.mjs`).
- Test: `tests/agentic/layers.test.mjs`, `tests/agentic/init.test.mjs`.

**Interfaces:** Produces the four template-only paths other tasks create files at.

- [ ] **Step 1: Write failing tests.** In `layers.test.mjs`, add the four new paths to the list in "template-only layer lists everything that must not reach a spawned project". In `init.test.mjs` add `init removes everything the real layers.json lists as template-only`: copy the repository's real `layers.json` into the `spawned()` root, create one file for every `template-only` pattern (below a `/**` pattern create `<dir>/x/y.md`), run init, assert none of those files exist and a file under `docs/adr/` and `scripts/init.mjs` survive (use the `spawned`, `run`, `read` helpers already in that file).
- [ ] **Step 2:** Run `node --test tests/agentic/layers.test.mjs tests/agentic/init.test.mjs`. Expected: the layers test and the new init test FAIL (paths missing from `layers.json`).
- [ ] **Step 3:** Edit `layers.json` as above.
- [ ] **Step 4:** Re-run the two files. Expected: PASS, including the existing "never also owned by another layer" test.
- [ ] **Step 5:** `git add layers.json tests/agentic/layers.test.mjs tests/agentic/init.test.mjs`; commit "Add documentation paths to the template-only layer".

### Task 3: Move ADRs 0008-0010 and guard synced docs

**Files:**
- Create: `tests/agentic/helpers/doc-links.mjs`, `tests/agentic/docs-agentic.test.mjs`.
- Move (`git mv`): `docs/agentic/adr/0008-versioning-and-release.md`, `0009-template-files-in-spawned-projects.md`, `0010-staleness-is-manual.md` to `docs/template/adr/` (same names).
- Modify: `docs/agentic/vendoring.md:12`, comments in `scripts/staleness.mjs:3` and `scripts/sync.mjs:4` (drop the "(ADR 0010)" reference; keep the sentence otherwise intact).

**Interfaces:**
- Produces in `doc-links.mjs`: `relativeLinks(markdown: string): string[]` (link targets of `[text](target)` that are relative: drops fenced code blocks and inline code first, skips `http:`, `https:`, `mailto:` and pure `#anchor` targets, strips `#fragment` and `?query`) and `markdownFiles(root: string, dir: string): string[]` (repo-relative POSIX paths of every `.md` below `dir`, recursive).
- Consumed by Task 4 and later additions to `docs-agentic.test.mjs`.

- [ ] **Step 1: Write failing tests.** In `docs-agentic.test.mjs` (root = `new URL("../../", import.meta.url)`):
  - `relativeLinks ignores code, URLs, anchors and fragments`: pins the helper rules above with a small inline markdown string (a link inside a fenced block and inside backticks is ignored; `a.md#x` yields `a.md`).
  - `every relative link in docs/agentic resolves`: for each `markdownFiles(root, "docs/agentic")` file, each link resolved against the file's directory exists.
  - `docs/agentic never links to a template-only path`: each resolved target, as a repo-relative path, is not `owns(layers["template-only"], path)` (import `owns` from `scripts/layers.mjs`; directory patterns: also test the path with a trailing `/x`).
- [ ] **Step 2:** Run `node --test tests/agentic/docs-agentic.test.mjs`. Expected: FAIL (helper missing). Implement the helper and re-run. Expected: all three tests PASS (nothing is broken yet).
- [ ] **Step 3:** Create `docs/template/adr/` and `git mv` the three ADRs there. Re-run the file. Expected: FAIL, "does not resolve" for `docs/agentic/vendoring.md` (it links `adr/0010-...`). This is the red state the fix turns green.
- [ ] **Step 4:** In `vendoring.md` remove the ADR 0010 link and its clause. Edit the two script comments. Run `node --test tests/agentic/docs-agentic.test.mjs tests/agentic/staleness.test.mjs tests/agentic/sync.test.mjs`. Expected: PASS. The moved ADRs may link to sibling ADRs (`0004-...md`) that no longer resolve: they are outside `docs/agentic`, so Task 4 fixes them.
- [ ] **Step 5:** `git add docs/ scripts/staleness.mjs scripts/sync.mjs tests/agentic/`; commit "Move template-only ADRs to docs/template and guard synced docs".

### Task 4: Template-only link test, README and CHANGELOG links

**Files:**
- Create: `tests/docs.test.mjs` (template-only; imports `../tests/agentic/helpers/doc-links.mjs` as `./agentic/helpers/doc-links.mjs`).
- Modify: `README.md` (lines 5, 50, 93, 105 links), `CHANGELOG.md` (the four `docs/agentic/adr/0008|0009|0010-` links to `docs/template/adr/`), the moved ADRs' own relative links (to `../../agentic/adr/...` where they point at ADRs 0001-0007).

- [ ] **Step 1: Write failing tests.** `tests/docs.test.mjs`: (a) every relative link in `README.md`, `CHANGELOG.md`, and every file in `docs/template/` resolves (skip `CONTRIBUTING.md`/`SECURITY.md` until they exist, using `existsSync`); (b) `README.md` links to no template-only path (the README is seeded into projects, where `init.mjs` deletes those files).
- [ ] **Step 2:** Run `node --test tests/docs.test.mjs`. Expected: FAIL on README line 5 (design spec in `docs/superpowers`), the three ADR links, and CHANGELOG ADR links.
- [ ] **Step 3:** Fix the links. In README, a reference to a template-only file becomes plain text in backticks, for example "the design is in `docs/superpowers/specs/2026-11-23-boilerplate-design.md`" and "ADR 0010 in `docs/template/adr/`" (no link). CHANGELOG keeps links, now to `docs/template/adr/`. Fix sibling links inside the moved ADRs.
- [ ] **Step 4:** Run `node --test "tests/**/*.test.mjs"`. Expected: PASS, counts not below Task 1.
- [ ] **Step 5:** `git add README.md CHANGELOG.md docs/template tests/docs.test.mjs`; commit "Fix links broken by moving template-only ADRs".

### Task 5: Architecture and the docs index

**Files:** Create `docs/agentic/architecture.md`, `docs/agentic/README.md`. Test: `tests/agentic/docs-agentic.test.mjs`.

- [ ] **Step 1: Write failing tests.** `docs/agentic/README.md exists and links every other top-level doc in docs/agentic/` (every `docs/agentic/*.md` except `README.md` is among its link targets; also links `adr/` entries via `decisions.md`, not individually). `architecture.md names every agent and workflow`: for each file in `.claude/agents/*.md` (basename) and `.github/workflows/{claude,ci}.yml`, the text of `architecture.md` contains the name (skip nothing: `template-ci.yml` is not required).
- [ ] **Step 2:** Run the file; expect FAIL (docs missing).
- [ ] **Step 3: Write `architecture.md`** per the spec ("File layout" bullet). Read first: `.claude/agents/*.md`, `.github/workflows/claude.yml` and `ci.yml`, `.claude/settings.json`, `layers.json`, `CLAUDE.md`. Sections: overview of one run end to end; the agents and who calls whom; workflows and triggers; where context comes from (CLAUDE.md, graphify, BMAD); telemetry and budget; layers and ownership. Cite ADRs by relative link to ADRs 0001-0007 only. Write the `README.md` index in reading order, one line per doc, listing the docs of Tasks 5-7 (security-model, decisions, register, vendoring) with links that exist by the end of Task 7; create it now with only the existing targets, and extend the index in Tasks 6 and 7.
- [ ] **Step 4:** Run the file; expect PASS. Run the whole suite.
- [ ] **Step 5:** `git add docs/agentic tests/agentic`; commit "Add architecture doc and docs index".

### Task 6: Security model

**Files:** Create `docs/agentic/security-model.md`; extend `docs/agentic/README.md`; test in `docs-agentic.test.mjs`.

- [ ] **Step 1: Write failing test** `security-model.md states the spend model`: the text contains `allowed_non_write_users`, `write access`, `ANTHROPIC_API_KEY`, `fork` and a heading matching `/known gaps/i`.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Verify the facts before writing them.** (a) The action refuses actors without write access: `gh api "repos/anthropics/claude-code-action/contents/src/github/validation/permissions.ts?ref=<SHA pinned in .github/workflows/claude.yml>" --jq .content | base64 -d` and confirm `allowed_non_write_users` defaults to empty and `claude.yml` does not set it. (b) `ci.yml` review job runs only for `claude/` branches of the same repository (read its `if:`). (c) `--allowedTools` in both workflows contain no merge or force-push command. If a fact differs from the spec, write the true behaviour and note the discrepancy for the PR body (spec, "Calls made"). Then write the doc: assets, who can trigger the agent, anyone with write access spends the owner's key, the supported model for outside contributors (forks with their own key; do not mention a spend-limited key or an actor allow-list), controls (ADR 0004 list), known gaps (reference ADR 0004's, plus the write-access gap and that budget caps alert after the fact, ADR 0003), residual risk. Plain-text mention of `SECURITY.md` and `CONTRIBUTING.md` (no links).
- [ ] **Step 4:** Add the doc to the `docs/agentic/README.md` index. Run the suite; expect PASS.
- [ ] **Step 5:** `git add docs/agentic tests/agentic`; commit "Add security model".

### Task 7: Decisions index and register

**Files:** Create `docs/agentic/decisions.md`, `docs/agentic/register.md`. Modify `docs/agentic/adr/0001..0007-*.md` (an `## Alternatives` section each). Extend the index. Test in `docs-agentic.test.mjs`.

- [ ] **Step 1: Write failing tests.**
  - `every synced ADR has an Alternatives section` (each `docs/agentic/adr/*.md` matches `/^##\s+Alternatives/m`).
  - `decisions.md lists every ADR in docs/agentic/adr`: for each file, the text contains `adr/<file name>`; and no row links `docs/template`.
  - `decisions.md and register.md agree with ADR 0007`: the decisions row for 0007 contains `pilot` (case-insensitive) and the register row mentioning base URL sits under the "Prescribed, not exercised" heading; `register.md` has exactly the four headings `## Proven (used in other projects)`, `## Prescribed, not exercised`, `## Open for improvement`, `## Built here, tested here only`.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Add `## Alternatives` to ADRs 0001-0007: from what the ADR and the main design spec already say; a missing fact is written "Not recorded." (0001 already has the text; give it the heading). Write `decisions.md` (columns: decision, alternatives rejected, status, link; statuses from the spec's "ADR status mapping", 0001-0007) plus a short section for the no-ADR choices (SHA-pinned actions, `claude-dev` orchestrating subagents, trimmed skills in CI, no scheduled workflows) with one-line rationale taken from the repo; do not invent. Write `register.md` per the spec: columns component, status, claim, evidence, how to help (open rows only); "Proven" rows quote the owner's statement (agents, telemetry, guardrails, ADR checking); the budget-caps assumption is marked "to confirm" in the text. The "Built here, tested here only" group lists init, check, vendor, staleness, sync, release, run, report (no links to template-only files; name `release` in plain text). Mention that the template-only ADRs 0008-0010 exist in the template repository, in plain text.
- [ ] **Step 4:** Extend the index; run the suite; expect PASS.
- [ ] **Step 5:** `git add docs/agentic tests/agentic`; commit "Add decisions index and proven-vs-pilot register".

### Task 8: Template-only docs

**Files:** Create `docs/template/fork-guide.md`, `CONTRIBUTING.md`, `SECURITY.md`. Test: `tests/docs.test.mjs` (its link test already covers them).

- [ ] **Step 1: Write failing test** in `tests/docs.test.mjs`: the three files exist; `CONTRIBUTING.md` contains `node --test "tests/**/*.test.mjs"`, `fork` and `own key`; `fork-guide.md` links all three files in `docs/template/adr/`; `SECURITY.md` contains `private vulnerability reporting` and links `docs/agentic/security-model.md`.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Write the three docs per the spec ("File layout", "Contributing"). Fork guide: what to change (`template.json` repo, `layers.json`, models in `.claude/agents` and the `DEV_MODEL`/`REVIEW_MODEL` variables, secrets), what to keep, how a fork stays in sync with upstream, and an index of ADRs 0008-0010. CONTRIBUTING: wanted contributions (pilot reports with `report.mjs` numbers, loop and context-cost experiments, new agents, doc fixes), tests, issue-first, protected paths need the owner, changelog and "Action required" rule (ADR 0008), no personal data, agent-spend rule (fork + own key; `@claude` on the upstream repository is for maintainers and may not work for you), what evidence moves a register row to "proven". SECURITY: how to report privately; scope; pointer to the security model. Plain text for anything not in the template.
- [ ] **Step 4:** Run the suite; expect PASS.
- [ ] **Step 5:** `git add CONTRIBUTING.md SECURITY.md docs/template tests/docs.test.mjs`; commit "Add fork guide, contributing guide and security policy".

### Task 9: README

**Files:** Modify `README.md`; test in `tests/docs.test.mjs`.

- [ ] **Step 1: Write failing test:** `README.md links the synced docs index`: contains a link to `docs/agentic/README.md`, `docs/agentic/security-model.md` and `docs/agentic/register.md`; the status line does not contain `milestones 1-7`.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Update the status line (milestones 1-8 built; v0.2.0 released, not public). Keep spawn steps. Shorten "Commands", "Checking for updates", "Updating a project" and "Cost and usage report" to a short paragraph each plus a pointer to `node scripts/run.mjs help <command>`; keep every command example that exists today for `run`, `staleness`, `sync`, `report`. Add a "Documentation" section linking the synced docs, and plain-text pointers to `CONTRIBUTING.md`, `SECURITY.md` and the fork guide (no links, per Task 4). Mention that agent runs started by `@claude` use the repository's own key and point to the security model.
- [ ] **Step 4:** Run the suite; expect PASS. Check `git diff --stat README.md` is a net shortening.
- [ ] **Step 5:** commit "Shorten README and link the new docs".

### Task 10: Spec, changelog, provenance test

**Files:** Modify `docs/superpowers/specs/2026-11-23-boilerplate-design.md`, `CHANGELOG.md`. Test: `tests/docs.test.mjs`.

- [ ] **Step 1: Write failing test** `no document names the original project`: every `.md` below `docs/` plus `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md` and `CLAUDE.md` does not match `/nissimo/i`. (This test file is outside the scanned set.)
- [ ] **Step 2:** Run; expect FAIL on the main spec (three mentions).
- [ ] **Step 3:** Reword the three mentions in the main spec: the setup is "proven in other projects", with the sentence rewritten where needed. Update its status (milestones 1-8 built, 9 to do) and the milestone 8 line. Add a CHANGELOG `Unreleased` entry under "Agentic layer": new synced docs (architecture, security model, decisions, register), ADRs 0008-0010 moved to the template-only `docs/template/adr/` and no longer synced, README links; and a template-only line for `CONTRIBUTING.md`, `SECURITY.md`, `docs/template/`. **Action required:** projects spawned earlier delete their copies of `docs/agentic/adr/0008-*`, `0009-*`, `0010-*`.
- [ ] **Step 4:** Run the suite; expect PASS.
- [ ] **Step 5:** commit "Record milestone 8 in the design, changelog and provenance test".

### Task 11: Outsider review and final verification

- [ ] **Step 1:** Dispatch a fresh general-purpose agent with only this brief: read `README.md` and everything in `docs/agentic/` (nothing else), then answer: could you decide to trust this template from the docs alone; what do you still need to know; what reads as marketing; which claims lack evidence. Dispatch a second fresh agent for `CONTRIBUTING.md` and `SECURITY.md` only, asking whether it could start contributing without help. Neither may read other files.
- [ ] **Step 2:** Fix what is a real gap or an overclaim; record what is left as a known gap in the relevant doc. Keep fixes small.
- [ ] **Step 3:** Run `node --test "tests/**/*.test.mjs"` (Node 22 glob form). Expected: all pass, counts at or above Task 1. Run `node scripts/check.mjs --offline` and `node scripts/staleness.mjs` only if they ran cleanly in Task 1; otherwise skip. Run `git status` (clean) and `git log --oneline origin/master..HEAD`.
- [ ] **Step 4:** Do not push. Report to the user: summary, the test counts, the review findings and what was fixed, the discrepancies found in Task 6 (if any), and the owner actions (enable private vulnerability reporting, confirm budget caps and the "tested here only" group, choose the version and release). Ask whether to push the branch and open the PR (`gh pr create --body-file`, body ending with the attribution line).
