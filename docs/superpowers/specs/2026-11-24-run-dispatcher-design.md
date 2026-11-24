# Command index and dispatcher (`scripts/run.mjs`)

Status: approved (short design, small change).

## Intent
The template has ten scripts and it is easy to lose track of what a user can run, with which flags, and which scripts are never run by hand (CI and hooks). The user wants an npm-style shorthand plus a place that documents commands, flags and exit codes.

## Goals
- `node scripts/run.mjs` prints every command, grouped by who runs it.
- `node scripts/run.mjs help <name>` shows purpose, flags, exit codes and an example.
- `node scripts/run.mjs <name> [flags]` runs `scripts/<name>.mjs`, passes flags through and returns its exit code.

## Non-goals
- No root `package.json`, no new dependencies.
- No auto-discovery by parsing script headers: `commands.json` is the single source of truth.
- No change to how CI or hooks call the scripts; they keep calling them directly.

## Anti-goals
- A command list that drifts from the scripts (guarded by a test).
- Imposing a Node project layout on spawned projects in other languages.

## Approaches
1. Root `package.json`: familiar, but collides with a spawned Node project's own file, cannot hold comments, and `npm run` shows no descriptions. Rejected.
2. Makefile or justfile: needs an extra install, awkward on Windows. Rejected.
3. README table only: drifts silently, no shorthand. Rejected.
4. **`run.mjs` dispatcher plus `commands.json` (chosen):** works wherever Node runs, lives in the synced `scripts/**` layer, documentation and shorthand come from one file.

## Design
- `scripts/commands.json`: one entry per runnable script with `summary`, `audience` (`you`, `automated`, `template-maintainer`), `flags`, `exitCodes` and `example`. Library modules (`layers`, `validate`, `placeholders`) and `run` itself are not commands.
- `scripts/run.mjs`: no arguments prints the overview; `help <name>` prints one entry; `<name> ...` starts `node scripts/<name>.mjs ...` in the current directory with inherited stdio and exits with the child's exit code. An unknown name prints the overview and exits 1. `--root` is not interpreted by the dispatcher; it goes to the script like any other flag.
- `commands.json` also lists `notCommands` (the dispatcher and library modules) so the drift test needs no hard-coded list, and marks entries for scripts that exist only in the template (`release`) with `templateOnly`: they are hidden when the script file is absent, so a spawned project still passes the drift test.
- `-h`/`--help` (alone or after a command name) show help instead of running. No current script has such a flag.
- Automated commands appear in the overview marked "automated, not for manual use" but stay runnable.
- `tests/run.test.mjs`: every non-library script has an entry and every entry points to a real script; the overview lists all commands; flags and exit code pass through; an unknown name fails.
- README gets a short "Commands" section pointing at `run.mjs`. A generated table is a possible later step; for now the section links to the overview instead of duplicating it, so there is nothing to drift.
- Layer files: `run.mjs` and `commands.json` fall under `scripts/**` (agentic, synced). `layers.json` needs no change. `tests/run.test.mjs` is copied to spawned projects at spawn time like the other script tests (`tests/**` is project-owned, so sync does not update it).

## Left to the builder
Output formatting, the exact wording of summaries, and how to keep the test for "every script has an entry" independent of a hard-coded library list (e.g. a `library` flag in the JSON instead of a list in the test).
