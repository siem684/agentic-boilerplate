# agentic-boilerplate

Template for guardrailed, agentic software projects: Claude Code agents, BMAD, graphify, protected paths, budget-capped CI, and documented decisions.

**Status: under construction (milestones 1-5 of 9 built; not yet tagged or public).** The design and plan are in [docs/superpowers/specs/2026-11-23-boilerplate-design.md](docs/superpowers/specs/2026-11-23-boilerplate-design.md). Staleness checks, sync and the full documentation are still to come.

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

## Layout and ownership

Every file belongs to one layer, listed in [layers.json](layers.json):

| Layer                                                                                                | Owner                                                                                                         | Synced to spawned projects             |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| agentic (`.claude/agents`, hooks, `settings.json`, `.github/workflows`, `scripts/`, `docs/agentic/`) | this template                                                                                                 | yes, by a human running `sync.mjs`     |
| vendored (`_bmad/`, `bmad-*` and `graphify` skills)                                                  | upstream, version pinned in `vendor.json`, installed per project (see [vendoring](docs/agentic/vendoring.md)) | no, `vendor.mjs verify` checks the pin |
| project (`src/`, `tests/`, `docs/adr/`, `_bmad/custom`, seeded `CLAUDE.md`/`README.md`)              | the spawned project                                                                                           | never                                  |

`CLAUDE.md` contains `{{PLACEHOLDERS}}` that `init.mjs` fills in.
