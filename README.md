# agentic-boilerplate

Template for guardrailed, agentic software projects: Claude Code agents, BMAD, graphify, protected paths, budget-capped CI, and documented decisions.

**Status: under construction (milestones 1-6 of 9 built; v0.2.0 released, not yet public).** The design and plan are in [docs/superpowers/specs/2026-11-23-boilerplate-design.md](docs/superpowers/specs/2026-11-23-boilerplate-design.md). Sync and the full documentation are still to come.

## Spawning a new project

1. Create a repo from this template (`gh repo create <name> --template <owner>/agentic-boilerplate`).
2. Fill in the placeholders:
   `node scripts/init.mjs --name "My App" --description "One line." --owner @your-github-username --check "npm test"`
   (rewrites `CLAUDE.md`, `.github/CODEOWNERS` and `.github/workflows/ci.yml`; safe to re-run).

   | Flag            | What to fill in                                                                                              | Ends up in                                     |
   | --------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
   | `--name`        | Project name, one line, at most 100 characters. Example: `"Invoice Tracker"`.                                | `CLAUDE.md` title                              |
   | `--description` | What the project does, one line, at most 300 characters. The agent reads it as context.                       | `CLAUDE.md`, under the title                   |
   | `--owner`       | Your GitHub handle (`@your-username`) or an org team (`@your-org/team-name`). `@me` does not work.            | `.github/CODEOWNERS`: who must review changes to protected paths and ADRs |
   | `--check`       | The command that proves the project is healthy. Examples: `"npm test"`, `"npm run lint && npm test"`, `"pytest"`, `"dotnet test"`. | `CLAUDE.md` (agent runs it before opening a PR) and `.github/workflows/ci.yml` (CI runs it) |
   | `--offline`     | Optional. Skips the GitHub lookup that checks the owner exists.                                              |                                                |

   All four values are required and validated before anything is written; if one is invalid the script lists every problem and changes no files. The owner is looked up with `gh api` (a warning, not an error, if `gh` is unavailable). Pick `--check` carefully: it is not validated beyond being non-empty, so a wrong command only fails when CI or the agent runs it. To change a value later, edit the three files by hand; re-running `init.mjs` does nothing once the placeholders are gone.

3. Install the pinned components that `node scripts/vendor.mjs verify` reports as missing.
4. Run `node scripts/check.mjs`. It lists leftover placeholders, missing components, and the repository secrets and variables to set (`ANTHROPIC_API_KEY` is required; it queries them with `gh` when available, `--offline` skips that). Exit code 1 means something blocks use.

## Commands

Not every script is meant to be run by hand: some are called by CI or hooks. To see what you can run, and with which flags, ask the dispatcher:

```
node scripts/run.mjs                    # every command, grouped by who runs it
node scripts/run.mjs help staleness     # purpose, flags, exit codes and an example
node scripts/run.mjs staleness          # shorthand for node scripts/staleness.mjs
node scripts/run.mjs check --offline    # flags are passed straight through
```

The exit code of the script is the exit code of `run.mjs`. The list comes from [scripts/commands.json](scripts/commands.json); a test fails when a script has no entry there. CI and hooks keep calling the scripts directly. A Node project can add its own alias, for example `"agentic": "node scripts/run.mjs"` in its `package.json`, to get `npm run agentic -- staleness`.

## Checking for updates

Nothing checks on a schedule ([ADR 0010](docs/agentic/adr/0010-staleness-is-manual.md)). When you want to know whether you are behind, run:

```
node scripts/staleness.mjs
```

It is read-only and reports, per dependency, your version, the latest and where to read the changes: the template itself (changelog entries since the version in `boilerplate.lock`, with their "Action required" lines, and the agentic-layer files that changed), the pinned BMAD and graphify versions, and the GitHub Actions in your workflows. Exit code 0 means current, 1 something is outdated, 2 a check could not run. It uses `GH_TOKEN` (or `gh auth token`) for GitHub when available; without one GitHub allows 60 requests an hour, and a private template cannot be read. Model IDs are not checked.

## Cost and usage report

Every agent run in CI appends one line to `telemetry.jsonl` and uploads it as a `telemetry-*` artifact (30 days). To see what the runs cost over time, run:

```
node scripts/report.mjs --github --since 30d            # download the artifacts of this repository
node scripts/report.mjs --github --since 30d --by week  # one row per week instead of per job
node scripts/report.mjs --from downloads/ --json        # telemetry.jsonl files you already have
```

It is read-only and prints runs, cost (total, average, maximum), turns, tokens, cache hit ratio and errors per job label, a total, and the cost per model. A run that is found twice is counted once. `--github` needs a token (`GH_TOKEN`, `GITHUB_TOKEN` or `gh auth login`; no `gh` binary is required), uses the git remote `origin` unless you pass `owner/name`, and only sees artifacts GitHub has not yet deleted. Exit code 0 means a report was printed, 1 bad input, 2 GitHub could not be read. Details: `node scripts/run.mjs help report`.

## Layout and ownership

Every file belongs to one layer, listed in [layers.json](layers.json):

| Layer                                                                                                | Owner                                                                                                         | Synced to spawned projects             |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| agentic (`.claude/agents`, hooks, `settings.json`, `.github/workflows`, `scripts/`, `docs/agentic/`) | this template                                                                                                 | yes, by a human running `sync.mjs`     |
| vendored (`_bmad/`, `bmad-*` and `graphify` skills)                                                  | upstream, version pinned in `vendor.json`, installed per project (see [vendoring](docs/agentic/vendoring.md)) | no, `vendor.mjs verify` checks the pin |
| project (`src/`, `tests/`, `docs/adr/`, `_bmad/custom`, seeded `CLAUDE.md`/`README.md`)              | the spawned project                                                                                           | never                                  |

`CLAUDE.md` contains `{{PLACEHOLDERS}}` that `init.mjs` fills in. It also deletes the files that are about the template itself (the `template-only` layer in `layers.json`: the template's CI, changelog, design docs and release script). See [ADR 0009](docs/agentic/adr/0009-template-files-in-spawned-projects.md).
