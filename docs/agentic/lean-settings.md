# Lean settings: choosing what loads in a project

Every Claude Code session loads your own setup as well as the project: plugins, claude.ai connectors, MCP servers, skills and built-in tools. Most of it is not needed to work on a software issue, and it costs context on every request. The `lean` command lets you turn it off for one project, per item, without changing your settings anywhere else. The decision and its reasoning are in [ADR 0011](adr/0011-lean-per-project-settings.md).

## Running it

`init.mjs` runs it as its last step. Run it again at any time, for example after installing a plugin or when you join a project someone else spawned:

```
node scripts/run.mjs lean                       # choose per item
node scripts/run.mjs lean --lean recommended    # apply the recommendations without asking
```

One screen per group: plugins, claude.ai connectors, other MCP servers, skills, built-in tools. `[x]` means off (not loaded), `[ ]` means on. The recommendations are pre-ticked on the first run; after that the screens show what is off now. Press Enter to accept a screen, type numbers to toggle (`2 5`), `a` for all on, `n` for all off. Nothing is written until you confirm.

Your choices go into `.claude/settings.local.json`. That file is yours: it is gitignored, `sync.mjs` never touches it, and the command keeps anything else you put in it. Deleting it turns everything back on.

Without a terminal (CI, scripts) and without `--lean`, the step is skipped. `--lean off` skips it too.

## How each item is switched off

| Group | Item | Written as |
|---|---|---|
| Plugins | one plugin, with its skills and hooks | `enabledPlugins: { "<name>@<marketplace>": false }` |
| claude.ai connectors | one connector | `deniedMcpServers: [{ "serverName": "claude.ai <Name>" }]` |
| claude.ai connectors | all of them, including ones added later | `disableClaudeAiConnectors: true` (written when every connector is off) |
| Other MCP servers | one server | `deniedMcpServers: [{ "serverName": "<name>" }]` |
| Skills | one skill | `skillOverrides: { "<name as /context lists it>": "off" }` |
| Built-in tools | Artifacts | `enableArtifact: false` |
| Built-in tools | another tool | `permissions: { "deny": ["<ToolName>"] }` |

## Turning something back on by hand

Run the command again and untick the item, or edit the file:

- **Plugin:** remove its entry from `enabledPlugins`.
- **One connector or MCP server:** remove its entry from `deniedMcpServers`.
- **All connectors:** remove `disableClaudeAiConnectors`. Settings from other scopes can turn connectors off but not back on, so this only helps if nothing else sets it.
- **Skill:** remove its entry from `skillOverrides`.
- **Artifacts:** remove `enableArtifact`.
- **Another tool:** remove its name from `permissions.deny`.

Use skill names exactly as `/context` lists them. A short name such as `"handoff"` turns off every skill with that name, including your own.

## What it saves

Measured on one developer's setup with Claude Code 2.1.332: a one-line prompt in a freshly spawned project used 39,972 input tokens, and 22,568 after the recommended choices, about 17.4k (44%) less on every request. Your numbers depend on what you have installed.

The token counts on the screens come from `/context`. It counts the full schema of every MCP tool, while most of them load only when used, so the screens show more than a request actually saves.
