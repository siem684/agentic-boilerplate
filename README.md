# agentic-boilerplate

Template for guardrailed, agentic software projects: Claude Code agents, BMAD, graphify, protected paths, budget-capped CI, and documented decisions.

**Status: planning.** The design and plan are in [docs/superpowers/specs/2026-11-23-boilerplate-design.md](docs/superpowers/specs/2026-11-23-boilerplate-design.md). Nothing is usable yet.

## Spawning a new project (planned)
1. Create a repo from this template (`gh repo create <name> --template siem684/agentic-boilerplate`).
2. Run `node scripts/doctor.mjs init` to fill in placeholders and check prerequisites.
3. Set the repository secrets and variables that `doctor` lists.

## Layout and ownership
Every file belongs to one layer, listed in [layers.json](layers.json):

| Layer | Owner | Synced to spawned projects |
|---|---|---|
| agentic (`.claude/agents`, hooks, `settings.json`, `.github/workflows`, `scripts/`, `docs/agentic/`) | this template | yes, by a human running `sync.mjs` |
| vendored (`_bmad/`, `bmad-*` and `graphify` skills) | upstream, pinned in `vendor.json` | no, updated with `vendor.mjs` |
| project (`src/`, `tests/`, `docs/adr/`, `_bmad/custom`, seeded `CLAUDE.md`/`README.md`) | the spawned project | never |

`CLAUDE.md` contains `{{PLACEHOLDERS}}` that `doctor.mjs init` will fill in.

These steps will be finalised and tested in milestone 4 of the plan.
