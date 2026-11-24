# agentic-boilerplate

Template for agentic software projects: Claude Code agents, BMAD, graphify, protected paths, cost alerts in CI, and documented decisions. The guardrails reduce mistakes and cost; they are not a sandbox, and the [security model](docs/agentic/security-model.md) lists where they stop.

**Status: under construction (milestones 1-8 of 9 built; v0.3.0 released, not yet public).** The design is in `docs/superpowers/specs/2026-11-23-boilerplate-design.md` (template repository only). Going public is still to come, and no licence has been chosen yet.

## What you get

- **Agents** in `.claude/agents/`: `claude-dev` runs a GitHub issue end to end and opens the PR; it calls `triage` (acceptance criteria), `qa-tester` (tests and self-check) and `fixer` (one failing check per fresh instance). `reviewer` reviews a PR, in a lighter mode when CI runs it.
- **Workflows** in `.github/workflows/`: `claude.yml` starts the dev agent when an issue, comment or review mentions `@claude`. `ci.yml` runs your `--check` command and posts an independent review on each PR. Add the label `dev:deepseek` to an issue to run it on DeepSeek instead (a pilot, not yet verified; [ADR 0007](docs/agentic/adr/0007-model-agnostic-base-url.md)).
- **Guardrails**: a `protect-paths` hook and permission denies stop agents from editing `_bmad/`, `_bmad-output/`, `.claude/` and `.github/workflows/` (exact for file tools, best effort for Bash); merge is not allowed and the common forms of force-push are denied (other spellings are not caught); CODEOWNERS makes you the reviewer for `.github/`, `.claude/`, `CLAUDE.md` and `docs/adr/` ([ADR 0004](docs/agentic/adr/0004-protected-paths.md)).
- **Cost alerts**: each run reports its cost and flags an overrun after the run; this alerts, it does not stop spending (turn and time limits do). Defaults are $5 for the dev agent and $1 for the review; override them with the repository variables `MAX_COST_USD_DEV` and `MAX_COST_USD_REVIEW` ([ADR 0003](docs/agentic/adr/0003-budget-cap-and-loop-limits.md)). Models are set with `DEV_MODEL` and `REVIEW_MODEL` ([ADR 0002](docs/agentic/adr/0002-model-allocation.md)).
- **Decisions**: the template's own ADRs are in [docs/agentic/adr/](docs/agentic/adr/) and indexed in [docs/agentic/decisions.md](docs/agentic/decisions.md); your project's go in `docs/adr/`.

Agent runs started by `@claude` use your repository's own `ANTHROPIC_API_KEY`, and anyone with write access can start one. Read the [security model](docs/agentic/security-model.md) before you give someone access.

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

Not every script is meant to be run by hand. Ask the dispatcher what you can run, and with which flags:

```
node scripts/run.mjs                    # every command, grouped by who runs it
node scripts/run.mjs help staleness     # purpose, flags, exit codes and an example
node scripts/run.mjs staleness          # shorthand for node scripts/staleness.mjs
node scripts/run.mjs check --offline    # flags are passed straight through
```

The list comes from [scripts/commands.json](scripts/commands.json). Use `node scripts/run.mjs help <command>` for the details of any command below.

## Checking for updates

Nothing checks on a schedule (ADR 0010, in `docs/template/adr/` of the template repository). When you want to know whether you are behind, run `node scripts/staleness.mjs`. It is read-only and reports the template, the pinned BMAD and graphify versions and the GitHub Actions in your workflows, with the changes since your version. Exit code 0 means current, 1 something is outdated, 2 a check could not run.

## Updating a project

When `staleness.mjs` says the template is ahead, a human brings the agentic layer up to date with `sync.mjs`. It never runs on its own and touches only the paths the agentic layer owns ([layers.json](layers.json)); a file you changed that the template also changed is reported as a conflict and left alone.

```
node scripts/sync.mjs                 # dry-run: what would be added, updated, deleted, or conflicts
node scripts/sync.mjs --diff          # the same, with a unified diff per update and conflict
node scripts/sync.mjs --apply         # write it (commit or stash your own changes first)
node scripts/sync.mjs --apply --force # also take the template's version for conflicts
```

Afterwards review `git diff`, run your check and open a pull request. Read the changelog entry's **Action required** line first. Keep your own tests in `tests/`, not in `tests/agentic/`: that directory holds the template's tests and is synced.

## Cost and usage report

Every agent run in CI appends one line to `telemetry.jsonl` and uploads it as a `telemetry-*` artifact (30 days). To see what the runs cost over time:

```
node scripts/report.mjs --github --since 30d            # download the artifacts of this repository
node scripts/report.mjs --github --since 30d --by week  # one row per week instead of per job
node scripts/report.mjs --from downloads/ --json        # telemetry.jsonl files you already have
```

## Documentation

Start at [docs/agentic/README.md](docs/agentic/README.md), which lists the documents in reading order:

- [Architecture](docs/agentic/architecture.md): the moving parts and how a run flows from issue to PR.
- [Security model](docs/agentic/security-model.md): who can start the agent, who spends the key, the controls and their known gaps.
- [Decisions](docs/agentic/decisions.md): what was chosen, what was rejected, how well tested.
- [Register](docs/agentic/register.md): what is proven, what is only prescribed, and where help is wanted.
- [Vendoring](docs/agentic/vendoring.md): how BMAD and graphify are pinned and checked.

In the template repository there are also `CONTRIBUTING.md` (how to help the template, including how to run the agents from a fork with your own key), `SECURITY.md` (how to report a vulnerability) and `docs/template/fork-guide.md` (for making your own variant). `init.mjs` removes them from a spawned project.

## Working on the template itself

The template's scripts have tests in `tests/agentic/` (the synced ones) and `tests/`. Run them with Node 22 or later, using the glob form (the same as `template-ci.yml`):

```
node --test "tests/**/*.test.mjs"
```

A release is cut with `node scripts/release.mjs <x.y.z>` after bumping `template.json` and `CHANGELOG.md` (ADR 0008, in `docs/template/adr/` of the template repository); it only creates the tag and never pushes. `init.mjs` deletes the template-only files in a spawned project, so these instructions apply to the template repository.

## Layout and ownership

Every file belongs to one layer, listed in [layers.json](layers.json):

| Layer                                                                                                | Owner                                                                                                         | Synced to spawned projects             |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| agentic (`.claude/agents`, hooks, `settings.json`, `.github/workflows`, `scripts/`, `tests/agentic/`, `docs/agentic/`) | this template                                                                                                 | yes, by a human running `sync.mjs`     |
| vendored (`_bmad/`, `bmad-*` and `graphify` skills)                                                  | upstream, version pinned in `vendor.json`, installed per project (see [vendoring](docs/agentic/vendoring.md)) | no, `vendor.mjs verify` checks the pin |
| project (`src/`, `tests/` except `tests/agentic/`, `docs/adr/`, `_bmad/custom`, seeded `CLAUDE.md`/`README.md`)              | the spawned project                                                                                           | never                                  |

`CLAUDE.md` contains `{{PLACEHOLDERS}}` that `init.mjs` fills in. It also deletes the files that are about the template itself (the `template-only` layer in `layers.json`: the template's CI, changelog, design docs and release script). See ADR 0009 in `docs/template/adr/` of the template repository. The table leaves out the seeded files (copied once, then yours) and the template-only files; [architecture](docs/agentic/architecture.md#layers-and-ownership) lists all five groups.
