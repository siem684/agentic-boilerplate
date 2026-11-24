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

## The template's tests live in `tests/agentic/`
The tests that guard the synced scripts and hook (`init`, `check`, `validate`, `vendor`, `telemetry`, `trim-skills`, `protect-paths`, `layers`, `staleness`, `report`, `run`, `sync` and their helpers) live in `tests/agentic/`. That directory is in the agentic layer, so `sync.mjs` updates the tests together with the scripts they cover: a script and its test never drift apart, and a script the template removes takes its test with it. The rest of `tests/` belongs to the project (`tests/agentic/**` is excluded from the project layer so the two do not overlap). CI runs both with `node --test "tests/**/*.test.mjs"`.

Consequence for a project spawned before the move: its old `tests/*.test.mjs` copies are project-owned, so they stay behind as duplicates after the first sync that adds `tests/agentic/`. The changelog entry that introduced the directory tells the owner to delete them.

## Consequences
- A new project starts without the template's changelog, design documents or release tooling.
- Adding a template-only file means one line in `layers.json`, not a second list in code.
- A project's own tests go in `tests/`, never in `tests/agentic/`, because sync owns that directory and would report an edit there as a conflict.

## Rejected
- Shipping everything and documenting it: the project would carry the template's history and a release script that tags the wrong repository.
- Deleting all template tests at init: it loses the tests that guard the synced scripts and hook.
- Leaving the tests in project-owned `tests/`: copied once and never updated, they drift from the synced scripts after the first sync.
