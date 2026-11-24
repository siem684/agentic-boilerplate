# 0009. Which template files reach a spawned project

- Status: accepted

## Decision
A spawned project is a copy of the whole template, so anything about the template itself has to be removed at spawn time. The `template-only` layer in `layers.json` is the single list of those paths. `init.mjs` reads it and deletes them (`dir/**` removes the directory); `sync.mjs` never adds them. A test checks that no template-only path is also owned by a synced layer.

Template-only today:
- `.github/workflows/template-ci.yml`: the template's own CI.
- `CHANGELOG.md`: the template's release history. Spawned projects read it in the template repository and in its GitHub Releases, before they sync.
- `docs/superpowers/**`: the template's design spec and plans.
- `scripts/release.mjs` and `tests/release.test.mjs`: they tag template releases ([0008](0008-versioning-and-release.md)).
- `template.json`: the template's own version. `init.mjs` copies it into `boilerplate.lock` (project-owned) and then deletes it ([0010](0010-staleness-is-manual.md)).
- `tests/agents.test.mjs`: it reads the seeded `CLAUDE.md`, which the project owns and rewrites.

The other tests (`init`, `check`, `validate`, `vendor`, `telemetry`, `trim-skills`, `protect-paths`, `layers`) stay in `tests/`. They use temporary directories or the synced hook and settings, and they pass in an initialised project.

## Known gap: template tests are not synced
`tests/**` is project-owned, so the tests that stay are copied once at spawn time and never updated. `scripts/**` and the hook are synced, so after a sync the scripts can be newer than their tests, and a script the template removes leaves a failing test behind.

**To do with milestone 7 (`sync.mjs`):** move the template's tests into a synced directory (for example `tests/agentic/**`, agentic layer) so they follow the scripts they cover, and leave `tests/` to the project. Until then the drift is accepted because nothing syncs yet.

## Consequences
- A new project starts without the template's changelog, design documents or release tooling.
- Adding a template-only file means one line in `layers.json`, not a second list in code.

## Rejected
- Shipping everything and documenting it: the project would carry the template's history and a release script that tags the wrong repository.
- Deleting all template tests at init: it loses the tests that guard the synced scripts and hook.
