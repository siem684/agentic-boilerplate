# agentic-boilerplate

Template for guardrailed, agentic software projects: Claude Code agents, BMAD, graphify, protected paths, budget-capped CI, and documented decisions.

**Status: planning.** The design and plan are in [docs/superpowers/specs/2026-11-23-boilerplate-design.md](docs/superpowers/specs/2026-11-23-boilerplate-design.md). Nothing is usable yet.

## Spawning a new project
1. Create a repo from this template (`gh repo create <name> --template siem684/agentic-boilerplate`).
2. Fill in the placeholders:
   `node scripts/init.mjs --name "My App" --description "One line." --owner @me --check "npm test"`
   (rewrites `CLAUDE.md`, `.github/CODEOWNERS` and `.github/workflows/ci.yml`; safe to re-run).
3. Install the pinned components that `node scripts/vendor.mjs verify` reports as missing.
4. Run `node scripts/check.mjs`. It lists leftover placeholders, missing components, and the repository secrets and variables to set (`ANTHROPIC_API_KEY` is required; it queries them with `gh` when available, `--offline` skips that). Exit code 1 means something blocks use.

## Layout and ownership
Every file belongs to one layer, listed in [layers.json](layers.json):

| Layer | Owner | Synced to spawned projects |
|---|---|---|
| agentic (`.claude/agents`, hooks, `settings.json`, `.github/workflows`, `scripts/`, `docs/agentic/`) | this template | yes, by a human running `sync.mjs` |
| vendored (`_bmad/`, `bmad-*` and `graphify` skills) | upstream, version pinned in `vendor.json`, installed per project (see [vendoring](docs/agentic/vendoring.md)) | no, `vendor.mjs verify` checks the pin |
| project (`src/`, `tests/`, `docs/adr/`, `_bmad/custom`, seeded `CLAUDE.md`/`README.md`) | the spawned project | never |

`CLAUDE.md` contains `{{PLACEHOLDERS}}` that `init.mjs` fills in.
