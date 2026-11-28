# Lean per-project Claude settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `lean` command, also run as the last step of `init.mjs`, that lists what loads into a developer's Claude Code sessions, recommends per item whether a software project needs it, lets the developer choose per item in grouped screens, and writes the choices to their own `.claude/settings.local.json`.

**Architecture:** A pure module (`scripts/lean-plan.mjs`) parses a `/context` report, attaches recommendations from `scripts/lean-catalog.json`, and turns choices into a settings object, the way `sync-plan.mjs` keeps `sync.mjs` testable. A thin CLI (`scripts/lean.mjs`) gets the inventory (runs `claude -p /context`, or reads a file, or falls back to disk), prompts with `node:readline`, and writes the file. `init.mjs` calls it last.

**Tech Stack:** Node ESM, built-ins only (`node:fs`, `node:path`, `node:os`, `node:child_process`, `node:readline/promises`), tests with `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-26-lean-settings-design.md` (read it first: the switch table, the two traps, the anti-goals).

## Global Constraints

- No new dependencies. Node built-ins only.
- Never write anything except `<root>/.claude/settings.local.json`. Never read-modify-write a user-level file (`~/.claude/settings.json`, `~/.claude.json`); reading them is allowed.
- Never write hooks or `permissions.allow`; never remove an entry the command does not manage (see Task 3).
- Nothing is written unseen: interactive mode asks `Write .claude/settings.local.json? [Y/n]`; every mode prints what it turned off and how to undo it.
- Non-interactive: `--lean off` writes nothing; no flag and no TTY → skip with one line and exit 0.
- Spawn `claude` with constant arguments only (nothing from user input), first without a shell; on `win32`, when that fails with ENOENT or EINVAL (the npm `.cmd` shim cannot be spawned without a shell), retry with `shell: true`, which is safe because every argument is a constant. Remove every `CLAUDE*` variable from `env` and set `MSYS_NO_PATHCONV=1`.
- Skill names in `skillOverrides` are written exactly as `/context` lists them (never shortened: `"handoff"` would also hit the developer's own `handoff` skill).
- Connector server names are written as display names: `claude_ai_Google_Calendar` → `"claude.ai Google Calendar"`.
- English everywhere. No real personal data in fixtures (fictional plugin and server names are fine).
- Agents cannot write `.claude/**` in this repo (hook plus deny rules). Tests write it only inside temp dirs. When a Bash command mentions `.claude` together with a redirect or a mutating command, the hook blocks it; put commit messages in a file and use `git commit -F`.
- Self-check before each commit: `node --test "tests/**/*.test.mjs"`.

## Review Focus

1. **The `/context` format changes or `claude` is not signed in.** Expect: a warning, the on-disk fallback, and still a working chooser, not a crash or an empty write. Test in Task 4 (`unparseable /context output falls back to disk with a warning`).
2. **An existing `settings.local.json` with the developer's own keys or invalid JSON.** Expect: own keys kept byte-for-byte in value; invalid JSON aborts with a message and writes nothing. Tests in Task 3 (`keeps unrelated keys`) and Task 4 (`invalid JSON in settings.local.json exits 2 and writes nothing`).
3. **A skill name that collides across sources** (`handoff` from User and `anthropic-skills:handoff` from claude.ai sync). Expect: two separate items; turning one off writes only that exact name. Test in Task 1 (`keeps colliding skill names apart`) and Task 3.
4. **A connector name with several words.** Expect: `claude_ai_Google_Calendar` becomes `claude.ai Google Calendar`. Test in Task 1 (`connector display names`).
5. **Re-run after choosing.** Expect: the screens show the current state, and turning an item back on removes only its entry. Test in Task 3 (`turning an item back on removes only its entry`) and Task 4 (`second run with the same answers gives the same file`).

---

### Task 1: Parse a `/context` report into an inventory

**Files:**
- Create: `scripts/lean-plan.mjs`
- Create: `tests/agentic/fixtures/context-report.md` (trimmed copy of a real report: the category table, 4 MCP tool rows across `claude_ai_Gmail`, `claude_ai_Google_Calendar`, `local-search`; skills rows with sources `User` (`handoff`, `my-skill`), `Plugin (helper)` (`helper:plan`), `Built-in` (`dataviz`, `code-review`), `claude.ai sync` (`pptx`, `anthropic-skills:handoff`), token cells `~130`, `< 20`, `1.3k`, `2k`)
- Test: `tests/agentic/lean-plan.test.mjs`

**Interfaces:**
- Produces: `parseContext(text: string) → { skills: {name, source: "user"|"plugin"|"builtin"|"claudeai", plugin?: string, tokens: number}[], servers: {name: string, tokens: number}[] } | null` (null when neither table is found).
- Produces: `connectorDisplayName(serverName: string) → string | null` (null when not a `claude_ai_` server).
- Produces: `parseTokens(cell: string) → number` (`"~130"`→130, `"< 20"`→20, `"1.3k"`→1300, `"2k"`→2000).

- [ ] **Step 1: Write the failing tests**: `parseContext reads skills with source and tokens`, `parseContext sums MCP tool tokens per server`, `keeps colliding skill names apart` (`handoff`/user and `anthropic-skills:handoff`/claudeai both present), `plugin skills carry their plugin name` (`helper:plan` → `plugin: "helper"`), `connector display names` (`claude_ai_Google_Calendar` → `"claude.ai Google Calendar"`, `local-search` → null), `parseTokens` cases above, `parseContext returns null for text without the tables`.
- [ ] **Step 2: Run** `node --test tests/agentic/lean-plan.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the three functions. Table rows are `| a | b | c |`; skills come from the table under `### Skills` (columns Skill, Source, Tokens); servers from the table under `### MCP Tools` (columns Tool, Server, Tokens).
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Commit** `lean-plan: parse /context into an inventory (#18)`.

### Task 2: Catalog and recommended items

**Files:**
- Create: `scripts/lean-catalog.json`
- Modify: `scripts/lean-plan.mjs`
- Test: `tests/agentic/lean-plan.test.mjs`

**Interfaces:**
- Consumes: `parseContext` output (Task 1).
- Produces: `buildItems({ context, userPlugins, catalog }) → Item[]`, where `Item = { key: string, group: "plugins"|"connectors"|"mcp"|"skills"|"tools", name: string, id?: string, tokens: number|null, recommend: "keep"|"off", reason: string, switchable: boolean }` and `key = "<group>:<name>"`. Order: groups in the order plugins, connectors, mcp, skills, tools; within a group as listed.
  - `userPlugins: string[]` are the keys of the user's `enabledPlugins` whose value is `true` (ids like `helper@market`).
  - Plugins: one item per enabled plugin id, `name` = part before `@`, `tokens` = sum of its skills from `/context` (null if none listed). A `Plugin (x)` source with no matching id → item with `switchable: false`, reason `"loaded outside enabledPlugins; cannot be turned off here"`.
  - Plugin skills are not separate items.
  - Connectors: servers with a display name; `name` = display name. Other servers → `mcp`.
  - Tools: one item per `catalog.tools` entry, `tokens: null`.
- Produces: `catalog` shape `{ "plugins"|"connectors"|"mcp"|"skills": { "keep": [pattern...], "off": [pattern...], "reasons": { pattern: string } }, "tools": [{ "name", "recommend", "reason" }] }`. A pattern is an exact name or ends in `*` (prefix). First match in `off`, then `keep`; no match → `keep`, reason `"unknown, kept by default"`.

- [ ] **Step 1: Write the failing tests**: `buildItems groups plugins, connectors, mcp, skills, tools in order`, `plugin tokens are the sum of its skills`, `unknown items are kept by default`, `catalog off wins over keep`, `a plugin without an enabledPlugins id is not switchable`, plus one test that loads the real `scripts/lean-catalog.json` and asserts: `pptx`, `docx`, `xlsx`, `claude.ai Gmail` and tool `Artifact` are `off`; `code-review`, `security-review` are `keep`.
- [ ] **Step 2: Run** the test file. Expected: FAIL.
- [ ] **Step 3: Write `scripts/lean-catalog.json`** following the spec's "Recommendations" direction, every pattern with a reason. Tools list: `Artifact` (off, written as `enableArtifact`), `NotebookEdit` (keep), `WebFetch` (keep), `WebSearch` (keep), `CronCreate` (off), `RemoteTrigger` (off). Claude in Chrome goes under `mcp.off` as `claude-in-chrome*` with a reason (verified in Task 6).
- [ ] **Step 4: Implement `buildItems`.**
- [ ] **Step 5: Run** the test file. Expected: PASS.
- [ ] **Step 6: Commit** `lean-plan: catalog and recommendations (#18)`.

### Task 3: Choices to settings, current state, answers

**Files:**
- Modify: `scripts/lean-plan.mjs`
- Test: `tests/agentic/lean-plan.test.mjs`

**Interfaces:**
- Consumes: `Item` (Task 2).
- Produces: `applyChoices(settings: object, items: Item[], off: Set<string /*key*/>) → object` (new object, input untouched). Per item, per the spec's switch table:
  - plugin → `enabledPlugins[id] = false` when off, entry deleted when on.
  - connector → `deniedMcpServers` entry `{ serverName: name }`; if every connector item is off: no connector entries, `disableClaudeAiConnectors: true`; otherwise `disableClaudeAiConnectors` deleted.
  - mcp → `deniedMcpServers` entry `{ serverName: name }`.
  - skill → `skillOverrides[name] = "off"` / deleted.
  - tool `Artifact` → `enableArtifact: false` / deleted; other tools → bare name in `permissions.deny` / removed.
  - Entries not belonging to an item are kept. Containers left empty that were absent before are removed. Non-switchable items are ignored.
- Produces: `currentOff(settings: object, items: Item[]) → Set<string> | null` (null when the file holds no managed entry, meaning "use recommendations").
- Produces: `parseAnswer(input: string, count: number) → { action: "accept" } | { action: "toggle", numbers: number[] } | { action: "all-on" } | { action: "all-off" } | { action: "invalid" }` (`""`→accept, `"2 5"`/`"2,5"`→toggle, `"a"`→all-on, `"n"`→all-off, out-of-range or other text → invalid).
- Produces: `summarize(before: Set<string>, after: Set<string>, items: Item[]) → { turnedOff: Item[], turnedOn: Item[], tokensSaved: number }`.

- [ ] **Step 1: Write the failing tests**: one per switch kind (`applyChoices: plugin`, `…: connector`, `…: all connectors off uses disableClaudeAiConnectors`, `…: mcp server`, `…: skill keeps the exact name`, `…: Artifact`, `…: other tool`), `keeps unrelated keys` (input has `permissions.allow`, `env`, a foreign `skillOverrides` entry; all survive), `turning an item back on removes only its entry`, `applyChoices is idempotent` (`applyChoices(applyChoices(s, i, o), i, o)` deep-equals one application), `currentOff reads back what applyChoices wrote`, `currentOff is null without managed entries`, `parseAnswer` cases, `summarize counts tokens of items turned off`.
- [ ] **Step 2: Add the template-safety test** `merged with .claude/settings.json the template's deny rules and hooks remain`: read the repo's `.claude/settings.json`, apply all-off choices to `{}`, merge as Claude Code does (arrays concatenated, objects merged, local last), and assert every template `permissions.deny` entry and the `PreToolUse` hook command are present.
- [ ] **Step 3: Run** the test file. Expected: new tests FAIL.
- [ ] **Step 4: Implement** the four functions.
- [ ] **Step 5: Run** the test file. Expected: PASS.
- [ ] **Step 6: Commit** `lean-plan: apply choices, read current state, parse answers (#18)`.

### Task 4: The `lean` command

**Files:**
- Create: `scripts/lean.mjs`
- Modify: `scripts/commands.json` (entry `lean`, audience `you`)
- Test: `tests/agentic/lean.test.mjs`

**Interfaces:**
- Consumes: everything in `lean-plan.mjs`.
- Produces (CLI): `node scripts/lean.mjs [--lean recommended|off] [--inventory <file>] [--home <dir>] [--root <dir>]`.
  - `--home` (default `os.homedir()`) is where `.claude/settings.json` (user plugins) and `.claude.json` (fallback MCP servers) are read.
  - `--inventory <file>` reads a saved `/context` report instead of running `claude`.
  - Otherwise runs `claude -p /context --setting-sources user` with cwd = root (constraints above).
  - When parsing fails or `claude` is missing: warning `could not read /context; claude.ai connectors and account skills are not listed`, inventory from disk (user plugins; `mcpServers` keys of `<home>/.claude.json` and `<root>/.mcp.json`; skill dirs in `<home>/.claude/skills/`).
  - Exit codes: 0 done or skipped; 2 failure (invalid JSON in the existing file, bad flag).
- Interactive (TTY, no `--lean`): one screen per non-empty group, exactly as the spec sketch, pre-filled from `currentOff` or the recommendations; invalid input repeats the screen; then the summary and `Write .claude/settings.local.json? [Y/n]`.
- After writing (any mode): print each item turned off and on, the estimated tokens saved, and `To change this, run: node scripts/run.mjs lean (or delete .claude/settings.local.json)`.
- `commands.json` `lean`: summary `Choose which plugins, connectors, MCP servers, skills and tools load in this project`, the four flags, exit codes 0/2, example `node scripts/run.mjs lean`.

- [ ] **Step 1: Write the failing tests** (spawn the script with `--root` a temp dir, `--home` a temp dir with a fictional `.claude/settings.json`, `--inventory` the Task 1 fixture): `--lean recommended writes the recommended file and prints what it turned off`, `--lean off writes nothing`, `without a TTY and without --lean it skips and writes nothing`, `second run with the same answers gives the same file`, `invalid JSON in settings.local.json exits 2 and writes nothing`, `unparseable /context output falls back to disk with a warning` (inventory file with plain text; `.claude.json` in home lists a server, which appears in the output).
- [ ] **Step 2: Run** `node --test tests/agentic/lean.test.mjs tests/agentic/run.test.mjs`. Expected: lean tests FAIL; `commands.json matches the scripts directory` still passes until the script exists, then needs the entry.
- [ ] **Step 3: Implement `scripts/lean.mjs`** and the `commands.json` entry. Interactive I/O through `readline/promises` on `process.stdin`/`stdout`; keep all decisions in `lean-plan.mjs`.
- [ ] **Step 4: Run** the full suite `node --test "tests/**/*.test.mjs"`. Expected: PASS.
- [ ] **Step 5: Commit** `lean: choose what loads per project (#18)`.

### Task 5: Run it from `init.mjs`; prove sync leaves the file alone

**Files:**
- Modify: `scripts/init.mjs` (new flags `--lean`, `--inventory`, `--home`, passed through; usage text and header comment)
- Modify: `scripts/commands.json` (`init` flags)
- Test: `tests/agentic/init.test.mjs`, `tests/agentic/sync-spawn.test.mjs`

**Interfaces:**
- Consumes: the `lean.mjs` CLI (Task 4).
- Produces: `init.mjs` runs `node <scripts>/lean.mjs --root <root> [passed flags]` with `stdio: "inherit"` after all its own writes, only when `scripts/lean.mjs` exists next to it. A lean failure prints a warning and init still exits 0 (the project is initialised; the step can be rerun).

- [ ] **Step 1: Write the failing tests**: in `init.test.mjs`, `init runs the lean step with --lean recommended` (copy `lean.mjs`, `lean-plan.mjs`, `lean-catalog.json` into the temp project's `scripts/`; pass `--lean recommended --inventory <fixture> --home <tmp>`; assert `.claude/settings.local.json` exists) and `init without a TTY skips the lean step` (existing invocation; assert no `.claude/settings.local.json`). In `sync-spawn.test.mjs`, extend the existing test: write `.claude/settings.local.json` in the project before `gitInit`, and after sync assert it is byte-identical.
- [ ] **Step 2: Run** `node --test tests/agentic/init.test.mjs tests/agentic/sync-spawn.test.mjs`. Expected: the init lean test FAILS; the sync assertion PASSES already (it pins existing behaviour, as the issue asks).
- [ ] **Step 3: Implement** the init step and flags.
- [ ] **Step 4: Run** the full suite. Expected: PASS.
- [ ] **Step 5: Commit** `init: run the lean step last (#18)`.

### Task 6: Verify on a real setup and document

**Files:**
- Create: `docs/agentic/adr/0011-lean-per-project-settings.md` (Context, Decision, an `## Alternatives` section with the spec's four approaches, Consequences, and the verification results of this task)
- Create: `docs/agentic/lean-settings.md` (the switch table, how to re-enable each item by hand, the measurements)
- Modify: `docs/agentic/README.md` (link the new page), `docs/agentic/decisions.md` (row for 0011, status "Built here, tested here only"), `docs/agentic/register.md` (row in "Built here, tested here only"), `README.md` (short section after spawning: what the step does, why, `node scripts/run.mjs lean`), `CHANGELOG.md` (`Unreleased`, "Agentic layer": new `lean` command and init step; `Action required: none`, optional: run `node scripts/run.mjs lean`)
- Possibly modify: `scripts/lean-catalog.json`, `scripts/lean.mjs` (only for findings below)

- [ ] **Step 1: Spawn a scratch project** (clone the branch into the session scratchpad, `node scripts/init.mjs --offline --lean off …`) and run `node scripts/lean.mjs --lean recommended` there with the real `claude`. Expected: groups listed from the real `/context`, a file written, no warning.
- [ ] **Step 2: Check `--setting-sources user`**: with the file from step 1 in place, rerun interactively and confirm the turned-off items still appear (pre-ticked off). If they do not, fix discovery per the spec's "left to the builder" note.
- [ ] **Step 3: Measure** real input tokens before and after with `claude -p "Reply with only: OK" --output-format json --max-turns 1` (sum `input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`), and ask the owner to run `/context` in an interactive session there, before and after, for the PR.
- [ ] **Step 4: Ask the owner to check in an interactive session** whether Claude in Chrome and the Artifact tool are gone after the recommended choices; adjust the catalog entry for Chrome if its server name differs. Record both results in the ADR.
- [ ] **Step 5: Write the docs** listed above.
- [ ] **Step 6: Run** the full suite. Expected: PASS (including `decisions.md lists every ADR`, `every synced ADR has an Alternatives section`, the README index test).
- [ ] **Step 7: Commit** `docs: lean settings ADR 0011, guide, README and changelog (#18)`.
- [ ] **Step 8: Open the PR** from `claude/issue-18-lean-settings` with `Closes #18`, the measurements (headless real tokens and the owner's interactive `/context`), the tests added, and a note on the separate `Write(...)` deny-rule finding. Do not include the unrelated staged change to `docs/template/fork-guide.md`.
