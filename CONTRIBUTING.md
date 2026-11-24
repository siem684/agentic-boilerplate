# Contributing

This is a template for software projects in which AI coding agents (Claude Code, run from GitHub Actions) work on issues, with guardrails around them and documented limits. A "spawned project" is a repository created from this template. The "owner" is the person who maintains the template and decides what is merged. The template improves when people try it and report what happened. Start with the [register](docs/agentic/register.md), which says for each part whether it is *proven* (used in other projects), *prescribed, not exercised* (set out but never tried) or *open for improvement*: the last two are where help is most useful.

## What is wanted

- **Pilot reports**: you ran the template on a real issue. Say what ran, on what, and what it cost (the numbers from `node scripts/report.mjs`).
- **Experiments with loops and context cost**: other ways to organise the dev, test, review and fix loop, or other ways to keep the context an agent spends small. Report the result and the cost, including when it did not help.
- **New agents** and other additions that do not change existing behaviour. Agent files are in a protected path (see Rules), so propose one in an issue or PR and the owner adds it.
- **Fixes to the docs**: wrong, unclear or missing explanations.

## Before you start

1. **Open an issue first** for anything beyond a small doc fix, so the idea can be discussed before you spend time on it.
2. **Work from a fork.** Run the agents with your own key: add `ANTHROPIC_API_KEY` to the secrets of your fork. `@claude` on the upstream repository is for the maintainers and may not work for you, because the agent only starts for people with write access and bills the repository's key ([security model](docs/agentic/security-model.md)).
3. Clone your fork. There is nothing to install: the scripts and tests need only Node 22, no packages.
4. Keep the diff small and focused on the issue. In the PR, say what changed and why, and which tests you added.

## Rules

- **Tests.** Node 22. Run `node --test "tests/**/*.test.mjs"` and keep it green. New behaviour gets a test that failed before the change; put it next to the existing ones.
- **Protected paths** (`_bmad/`, `_bmad-output/`, `.claude/`, `.github/workflows/`) are changed by the owner only, because an agent must not be able to rewrite its own rules. A PR that touches them needs the owner to make or approve the change.
- **Changelog.** User-visible changes get an entry under `Unreleased` in `CHANGELOG.md`, grouped by layer, with an **Action required** line ("none" if spawned projects need to do nothing). The version is chosen by the owner at release time, by the bump rule in ADR 0008. The three ADRs about the template itself (0008 to 0010) are in `docs/template/adr/`; the ADRs every project gets are in `docs/agentic/adr/`.
- **No personal data**, real or realistic, in code, tests, fixtures or PR text.
- **No secrets** in any file.
- **Language.** Code, comments, commits, PR text and docs are in English.
- **Synced docs never link to template-only files.** A document under `docs/agentic/` is copied into spawned projects, where `CONTRIBUTING.md`, `SECURITY.md` and `docs/template/` do not exist; `tests/agentic/docs-agentic.test.mjs` enforces this, and it runs with the rest of the tests.

## What moves a row in the register to "proven"

A short report in an issue: what ran, on what kind of project, how many runs, what went wrong, and the cost per run from `node scripts/report.mjs`. One careful report with numbers is worth more than a claim that it works.

## Merging

Merging is the owner's decision. Nobody, including an agent, merges their own PR.

To report a vulnerability, see [SECURITY.md](SECURITY.md).
