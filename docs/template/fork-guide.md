# Fork guide

For someone who forks this template to make their own variant, for example with other agents or other defaults. If you only want a project that uses the template, you do not need this: follow the README and spawn one.

This file is template-only: `init.mjs` deletes it in a spawned project.

## What to change

| What | Where | Why |
|---|---|---|
| The repository the template calls home | `repo` in `template.json` | `init.mjs` copies it into `boilerplate.lock` of every project spawned from your fork, and `staleness.mjs` and `sync.mjs` read it to find your releases. Projects spawned from the fork then follow the fork, not this template. |
| Which paths are yours to ship | `layers.json` | The single source of truth for ownership. Add a path to the `agentic` layer when `sync.mjs` should deliver it; add it to `template-only` when it is about the fork itself, so `init.mjs` removes it in a spawned project. A test fails when a `template-only` path is also owned by another layer. |
| Models | `model:` in the files of `.claude/agents/`, and the repository variables `DEV_MODEL` and `REVIEW_MODEL` | The rationale is [ADR 0002](../agentic/adr/0002-model-allocation.md). Agent files are protected paths: you edit them, an agent does not. |
| Secrets | `ANTHROPIC_API_KEY`, and `DEEPSEEK_API_KEY` if you keep the `dev:deepseek` pilot | Set them in the settings of the fork and of every project. |
| The changelog and version | `CHANGELOG.md`, `template.json` | Your releases have their own history. Follow the bump rule in ADR 0008 below, or write your own. |

## What to keep

- **`layers.json` and the tests that guard it.** Everything that updates or removes files reads it.
- **The protected paths and the human merge** ([ADR 0004](../agentic/adr/0004-protected-paths.md)). If you relax them, say so loudly in the changelog: they are what spawned projects trust.
- **The link rule**: documents in `docs/agentic/` never link to template-only files, because they are copied into projects where those files do not exist. A test enforces it.
- **The register** ([register](../agentic/register.md)). Change its statuses only when you have the evidence; the statuses of a fork are the fork owner's to state.

## Staying in sync with the upstream template

A fork is a normal git fork. To take upstream changes, add the template as a remote and merge or cherry-pick a release tag, then read the changelog for each version you take, in particular its **Action required** lines. Conflicts will be in the files you changed on purpose: the models, `layers.json`, `template.json`. `sync.mjs` is for projects spawned from a template, not for the fork itself.

## Renaming without breaking `sync.mjs` and `staleness.mjs`

Both read the owner and name from `boilerplate.lock` in the spawned project, copied from `repo` in `template.json`. Change `repo` in the fork and tag a release there. A project spawned before the change keeps the old value in its lock until someone edits it; releases are looked up by that name.

## The template's own decisions

These are about the template itself and are not copied to spawned projects:

- [0008: Versioning and release](adr/0008-versioning-and-release.md): SemVer, the changelog with an Action required line, how a release is tagged.
- [0009: Template files in spawned projects](adr/0009-template-files-in-spawned-projects.md): which files a spawned project keeps and which `init.mjs` removes.
- [0010: Staleness is checked on request](adr/0010-staleness-is-manual.md): why nothing is scheduled.

The decisions every spawned project also gets are in [decisions](../agentic/decisions.md).
