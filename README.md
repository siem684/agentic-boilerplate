# agentic-boilerplate

Template for guardrailed, agentic software projects: Claude Code agents, BMAD, graphify, protected paths, budget-capped CI, and documented decisions.

**Status: planning.** The design and plan are in [docs/superpowers/specs/2026-11-23-boilerplate-design.md](docs/superpowers/specs/2026-11-23-boilerplate-design.md). Nothing is usable yet.

## Spawning a new project (planned)
1. Create a repo from this template (`gh repo create <name> --template siem684/agentic-boilerplate`).
2. Run `node scripts/doctor.mjs init` to fill in placeholders and check prerequisites.
3. Set the repository secrets and variables that `doctor` lists.

These steps will be finalised and tested in milestone 4 of the plan.
