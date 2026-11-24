# Agentic layer documentation

These documents ship with the template and are kept up to date by `sync.mjs`. Read them in this order if you want to decide whether to trust the setup.

1. [architecture.md](architecture.md): the moving parts and how one run flows from issue to PR.
2. [security-model.md](security-model.md): who can start the agent, who spends the key, the controls and their known gaps.
3. [vendoring.md](vendoring.md): how BMAD and graphify are pinned, installed and checked.

The template's own decisions are in [adr/](adr/); your project's decisions go in `docs/adr/`.
