# Lean per-project Claude settings (issue #18): design

Status: approved by the owner, 2026-11-26.

## Intent

A fresh Claude Code session in a spawned project starts with tens of thousands of context tokens that do not come from the project. They come from whatever the developer has set up at user or account level: plugins, claude.ai connectors, other MCP servers, account-synced skills, the skills and tools that ship with Claude Code. A spawned project usually belongs to a developer other than the template's owner, so the template cannot know their setup in advance.

`init` gets a step, also available as a standalone command, that lists everything that would load into this developer's sessions. Each item comes with a recommendation (needed for a software development project or not), grouped so the developer can accept the recommendations or change them per item. The choices go into the developer's own `.claude/settings.local.json` for this project. The result: a leaner context window for the issue being worked on, cheaper sessions and a more focused agent.

## Measurements (spike, 2026-11-26, Claude Code 2.1.332, headless)

Real API input tokens for a one-line prompt in a freshly spawned project, on the owner's setup:

| Settings override | Input tokens | Saving |
|---|---|---|
| none | 28,982 | |
| user plugins off (superpowers, wbso) | 26,722 | 2.3k |
| claude.ai connectors off | 25,289 | 3.7k |
| skills that ship with Claude Code off | 26,500 | 2.5k |
| account-synced (claude.ai) skills off | 25,479 | 3.5k |
| all of the above, plus `enableArtifact: false` | 17,030 | 12.0k (41%) |

The remaining ~17k is Claude Code's own system prompt and tools. The project's own share (agents, CLAUDE.md) is under 500 tokens. Interactive sessions load more (the Artifact tool, Claude in Chrome, deferred-tool names), so the interactive saving is expected to be larger; headless mode cannot show it.

What the spike established (all from `.claude/settings.local.json`, none touching user-level settings):

| What | Switch, per item | Verified |
|---|---|---|
| A user-enabled plugin, including its skills and SessionStart hooks | `enabledPlugins: { "<name>@<marketplace>": false }` | yes |
| One claude.ai connector | `deniedMcpServers: [{ "serverName": "claude.ai Gmail" }]` (display name, with space) | yes |
| All claude.ai connectors, including ones added later | `disableClaudeAiConnectors: true` (any source true wins; a project can opt out, not back in) | yes |
| Another MCP server (user, local or `.mcp.json`) | `deniedMcpServers: [{ "serverName": "<name>" }]` | yes |
| One skill of any source | `skillOverrides: { "<name as /context shows it>": "off" }` | yes |
| All skills that ship with Claude Code | `disableBundledSkills: true` | yes |
| Artifacts | `enableArtifact: false` (project and local can only turn it off) | setting exists; effect not visible headless |
| A built-in tool | `permissions.deny: ["<ToolName>"]` | documented behaviour, not measured |

Two traps found:
- A bare skill name in `skillOverrides` hits every skill with that name: `"handoff": "off"` also turned off the developer's own `handoff` skill. Always use the name exactly as `/context` lists it (`anthropic-skills:handoff`).
- On Windows Git Bash, `/context` passed as an argument is rewritten to a path unless `MSYS_NO_PATHCONV=1` is set. Spawning without a shell avoids it.

## Goals

- One grouped, per-item choice for: plugins, claude.ai connectors, other MCP servers, skills (developer's own, plugin, account-synced, shipped with Claude Code), built-in tools including Artifacts and Claude in Chrome.
- Each item shows its token cost where known, a recommendation (keep or off) and a one-line reason.
- Runs inside `init.mjs` and on its own, so a developer who joins later can run it for their own checkout.
- Re-running shows the current state and can turn things back on.

## Non-goals

- Changing user-level settings (`~/.claude/settings.json`, `~/.claude.json`). Out of scope by the issue.
- Uninstalling anything. Turning off is per project and reversible.
- Tailoring recommendations to one person's setup. They are general: "is this needed for a software development project".
- Trimming Claude Code's own system prompt.

## Anti-goals (a failure even if it works)

- Turning anything off that the developer has not seen. Every change is shown before it is written, and printed after.
- Removing or weakening the template's own deny rules, hooks or agents.
- Breaking non-interactive use: CI, tests and scripted spawns must run `init` without prompts.
- Losing what the developer already has in `settings.local.json` (their own permission rules, env, other keys).

## Constraints

- `.claude/settings.json` is agentic-layer and overwritten by `sync.mjs`; it cannot hold per-developer choices. `.claude/settings.local.json` matches no layer, so it is project-owned and sync never touches it (`sync-plan.mjs` only plans agentic paths). It is already gitignored.
- Agents cannot write `.claude/**` (deny rules plus `protect-paths.mjs`). The command is run by a human, as `init.mjs` is.
- Claude Code settings merge across scopes: arrays such as `permissions.deny` and `deniedMcpServers` concatenate, so a local file adds to the template's rules and cannot remove them.
- claude.ai connectors and account-synced skills are not on disk. Only a running Claude Code knows them.

## Approaches

1. **Fixed baseline file** seeded by `init.mjs`. Simple, but it cannot know the developer's plugins or connectors, and a fixed skill list goes stale. Rejected.
2. **Automatic script** that reads the setup and turns off everything not needed, printing what it did, with `--keep-all`. Earlier recommendation. Rejected by the owner: the developer should decide per item.
3. **Launch wrapper** with `--setting-sources project --strict-mcp-config`. Drops the developer's own permissions, hooks and status line too. Rejected.
4. **Interactive per-item chooser with recommendations**, part of `init` and standalone. **Chosen by the owner** (2026-11-26), grouped as sketched below.

## Design

### Pieces

- `scripts/lean.mjs`: the command (I/O, prompts). Agentic layer, synced.
- `scripts/lean-plan.mjs`: pure logic, no I/O, like `sync-plan.mjs`: parse an inventory, attach recommendations, compute the new settings object from choices, compute the diff to show.
- `scripts/lean-catalog.json`: the recommendations. Agentic layer, synced, so improved recommendations reach spawned projects.
- `init.mjs` calls `lean.mjs` as its last step.
- `scripts/commands.json` gets a `lean` entry (`run.test.mjs` keeps the two in step).

### Inventory: what would load

Primary source: `claude -p /context --setting-sources user`, spawned without a shell, cwd = project root, with inherited `CLAUDE*` session variables removed. `/context` makes no API call. `--setting-sources user` keeps the existing local and project settings out, so items that are currently turned off still appear and can be turned back on. It lists skills with their source (User, Plugin (name), Built-in, claude.ai sync) and tokens, and MCP tools with their server, from which the per-server token total is summed.

Fallback when `claude` is missing, not signed in, or the output does not parse: read what is on disk (user `enabledPlugins`, MCP servers from `~/.claude.json` and `.mcp.json`, `~/.claude/skills/`) plus the catalog's built-in tools, and say plainly that connectors and account-synced skills could not be listed.

Plugin skills are shown under their plugin, not as separate items. A plugin's full id (`name@marketplace`) comes from the user's `enabledPlugins`. Plugins loaded another way (for example `CLAUDE_CODE_PLUGIN_DIRS`) are shown as "cannot be turned off here".

Built-in tools are not listed by `/context`; they come from the catalog.

`--inventory <file>` reads a saved `/context` output instead of running `claude`, for tests.

### Groups and how each is switched off

| Group | Item | Written as |
|---|---|---|
| Plugins | one plugin | `enabledPlugins["<id>"] = false` |
| claude.ai connectors | one connector | `deniedMcpServers` entry `{ serverName: "claude.ai <Name>" }`; when every connector is off, `disableClaudeAiConnectors: true` instead, which also covers connectors added later |
| Other MCP servers | one server | `deniedMcpServers` entry `{ serverName }` |
| Skills | one skill | `skillOverrides["<name as listed>"] = "off"` |
| Built-in tools | Artifacts | `enableArtifact: false` |
| Built-in tools | another tool | `permissions.deny` entry `"<ToolName>"` |

### Recommendations

`lean-catalog.json` maps names or patterns to `keep` or `off` with a short reason, per group. The guiding question is "does an agent working on a software issue need this". Initial direction, for the builder to complete:
- off: office and personal connectors (Gmail, Calendar, Drive, Docs, Sheets, Slides, Notion), document skills (pptx, docx, xlsx, pdf), Artifacts, Claude in Chrome, browser and computer-use skills, morning brief, scheduling of cloud tasks.
- keep: code-review, security-review, simplify, run, init, claude-api, update-config; developer-tool connectors and MCP servers (GitHub, issue trackers, error monitoring); the developer's own skills.
- Anything not in the catalog: keep, reason "unknown, kept by default".

### Interaction

One screen per group, recommendations pre-filled (on a re-run: the current state instead), tokens per item and for the group:

```
claude.ai connectors (7, ~3.7k tokens)    recommended: all off
  [x] 1 Gmail          off   not needed for code
  [x] 2 Google Drive   off   not needed for code
  ...
Enter = accept, numbers to toggle (e.g. 2 5), a = all on, n = all off
```

After the last group: a summary of what changes (turned off, turned back on, estimated tokens saved) and `Write .claude/settings.local.json? [Y/n]`. After writing, it prints what is off and how to undo it: run `node scripts/run.mjs lean` again, or delete the file.

Non-interactive modes, also used by `init.mjs`:
- `--lean recommended`: apply the recommendations, print the summary, no prompts.
- `--lean off`: skip the step; nothing written. This is the "keep everything" option.
- No flag and no TTY (CI): skip with a one-line message.

### Writing the file

The command manages only entries that match an item in the current inventory or catalog: those plugin ids, those server names in `deniedMcpServers`, those skill names in `skillOverrides`, those bare tool names in `permissions.deny`, `enableArtifact`, `disableClaudeAiConnectors`. Everything else in `settings.local.json` is kept as is. Turning an item back on removes its entry, and empty containers it created are removed. The same inventory and choices always produce the same file (idempotent). It never writes hooks, `permissions.allow` or any user-level file.

### Documentation and decision record

- README: a short section on what the step does, why, and how to change choices later.
- A page under `docs/agentic/` with the switch table above and how to re-enable each item by hand.
- An ADR in `docs/agentic/adr/` (next free number is 0011, since 0008-0010 are in `docs/template/adr/`): per-developer local file, discovery through `/context`, a catalog of recommendations, nothing written unseen.
- CHANGELOG `Unreleased` entry.

## Tests (acceptance criteria mapping)

- `lean-plan`: parsing a saved `/context` fixture into groups; recommendations from a small catalog; settings output per group; merging keeps unrelated keys; turning an item back on removes only its entry; same input twice gives the same file.
- Template safety: merge the generated file with `.claude/settings.json` as Claude Code does (arrays concatenated) and assert the template's deny rules and `PreToolUse` hook are all present.
- Sync: `sync-spawn` test asserting a project's `.claude/settings.local.json` is neither overwritten nor deleted by `sync.mjs --apply`.
- `--lean off` writes nothing; `--lean recommended` with `--inventory` writes the expected file and prints what it turned off.
- `init.mjs` with `--lean recommended --inventory <fixture>` runs the step; without a TTY and without the flag it skips.
- Interactive prompt parsing (toggle numbers, `a`, `n`, Enter) is tested through the pure module.

Measurement for the PR (acceptance criterion): `/context` in an interactive session of a spawned project, before and after `--lean recommended`. A human runs this; the headless real-token figures above go next to it.

## Left to the builder

- The full catalog contents, within the direction above.
- How to detect Claude in Chrome's server name and whether `deniedMcpServers` turns it off; if not, a deny rule on its tools. Verify in an interactive session and record the result in the ADR.
- Whether `--setting-sources user` keeps `/context` complete (project agents and skills still listed); if not, temporarily ignore the local file another way, without moving or rewriting it.
- Exact wording of prompts and messages.
- Prompt implementation with `node:readline` only (no dependencies).

## Separate finding (not part of this issue)

Claude Code warns that the template's `Write(./...)` deny rules in `.claude/settings.json` match nothing: only `Edit(...)` rules cover file-writing tools. `.claude/settings.json` is a protected path, so this goes into its own issue for a human to change.
