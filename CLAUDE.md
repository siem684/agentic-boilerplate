# {{PROJECT_NAME}}

{{PROJECT_DESCRIPTION}}

<!-- Seeded from agentic-boilerplate. After spawning, this file belongs to the project: edit freely. -->

## Language
Code, comments, commits, PR text and docs are in English.

## Hard rules
- Keep diffs small and focused on the issue.
- Do not edit `_bmad/`, `_bmad-output/`, `.claude/` or `.github/workflows/`. These are protected paths; only a human changes them.
- No real personal data in code, tests, fixtures or PR text.
- Never commit secrets. Keys live in repository secrets, not in files.
- Architecture decisions are recorded in `docs/adr/`. The template's own decisions (agent setup, guardrails) are in `docs/agentic/adr/`; "ADR 000x" in agent and workflow files refers to those.
- Merging is a human decision. Never merge your own PR.

<!-- Project-specific rules go here: stack, browser/device targets, accessibility level, scope limits. -->

## Workflow per issue
1. **Read the issue.** If it lacks testable acceptance criteria, propose them in a comment and continue on the basis of your proposal.
2. **Tests first for behaviour.** Write a failing test, run it, and confirm it fails for the right reason.
3. **Implement the minimal change.**
4. **Self-check.** Everything must be green before opening a PR: {{CHECK_COMMANDS}}
5. **Open a PR** from a branch `claude/issue-<nr>-...` with `Closes #<nr>`. Describe what and why, which tests were added, and any intentional behaviour change.
6. **Independent review.** The CI `review` job posts a review. Fix blocking points once (at most one automatic round); if unsure, ask in the PR.
7. **A human merges.**

## Tests
The self-check commands are in step 4 above. New tests go next to the existing ones.
<!-- Project-specific: the test directory, file naming, and how to run a single test. -->

## Knowledge graph
When the user types `/graphify`, invoke the Skill tool with `skill: "graphify"` before doing anything else. If `graphify-out/` exists, treat questions about the codebase's architecture or file relationships as a graphify query first.

## Staying current
Nothing checks for updates on a schedule. When asked whether the template or a dependency is stale, run `node scripts/staleness.mjs` and report its output, but never upgrade anything yourself. Upgrades are run by a human with `vendor.mjs` and `sync.mjs`.
