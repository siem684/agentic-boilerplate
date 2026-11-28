# 0011. Lean per-project Claude settings

- Status: accepted

## Context
A fresh Claude Code session in a spawned project starts with tens of thousands of context tokens that do not come from the project. They come from the developer's own setup: plugins, claude.ai connectors, other MCP servers, skills synced from their account or shipped with Claude Code, and built-in tools such as Artifacts. A spawned project usually belongs to someone other than the template's owner, so the template cannot know that setup in advance. `.claude/settings.json` is synced and shared, so it cannot hold one developer's choices.

## Decision
A `lean` command, also run as the last step of `init.mjs`, lists everything that would load into this developer's sessions and lets them choose per item. Each item has a keep or off recommendation with a one-line reason. The choices go into the developer's own `.claude/settings.local.json`.

- **Per developer, per project.** `.claude/settings.local.json` is gitignored and matches no layer, so `sync.mjs` never touches it. Nothing at user level (`~/.claude/settings.json`, `~/.claude.json`) is changed.
- **Discovery through `/context`.** The command runs `claude -p /context --setting-sources user`, which lists connectors and account-synced skills that are not on disk. Leaving out the project and local settings keeps items that are already off in the list, so they can be turned back on. If `claude` is missing or its output does not parse, it falls back to what is on disk and says so.
- **Recommendations in a catalog.** `scripts/lean-catalog.json` is synced, so better recommendations reach spawned projects. The guiding question is "does an agent working on a software issue need this". The developer's own skills and anything not in the catalog are kept.
- **Nothing is written unseen.** The chooser shows one screen per group with the recommendations pre-ticked (`[x]` = off), then a summary and a confirmation. `--lean recommended` applies the recommendations without asking and prints what it turned off. `--lean off`, or no terminal, writes nothing.
- **Only its own entries.** The command manages only entries that match a listed item. Everything else in the file is kept, and turning an item back on removes its entry. Claude Code concatenates arrays across settings files, so the local file cannot remove the template's deny rules or hooks.

How each item is switched off is in [lean-settings.md](../lean-settings.md).

## Verification
On the owner's setup, Claude Code 2.1.332, in a project spawned from this branch:

- Headless, real API input tokens for a one-line prompt (`claude -p "Reply with only: OK" --output-format json --max-turns 1`, input plus cache read plus cache creation): 39,972 before, 22,568 after `--lean recommended`, about 17.4k (44%) less per request. The recommended choices turned off 7 claude.ai connectors, 13 skills, Artifacts, `CronCreate` and `RemoteTrigger`.
- A second run with the file in place listed the same items, already off, so `--setting-sources user` keeps turned-off items visible.
- Interactive (the owner, 2026-11-28): the chooser screens worked, items already off were pre-ticked, and after the recommended choices Claude in Chrome and the Artifact tool were gone.
- Claude in Chrome does not appear in headless `/context`, so the chooser never lists it there and the catalog's `claude-in-chrome*` entry was not exercised. That it disappeared in the interactive check does not show which setting removed it.

## Consequences
- Each developer runs the step once per checkout; someone who joins later runs `node scripts/run.mjs lean`.
- The token numbers on the screens are `/context`'s, which count deferred MCP tool schemas in full. They are larger than the measured saving per request, and the summary says so.
- New connectors are covered when every connector is off, because that is written as `disableClaudeAiConnectors: true`. New skills or plugins load until the developer runs the command again.
- The catalog can go stale as Claude Code ships new skills and tools; unknown items default to keep.

## Alternatives
- A fixed baseline file seeded by `init.mjs`: rejected. It cannot know the developer's plugins or connectors, and a fixed skill list goes stale.
- An automatic script that turns off everything not needed and prints what it did: rejected by the owner, because the developer should decide per item.
- A launch wrapper with `--setting-sources project --strict-mcp-config`: rejected. It also drops the developer's own permissions, hooks and status line.
- An interactive per-item chooser with recommendations, in `init` and standalone: chosen.
