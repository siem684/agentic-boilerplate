# Sync (`scripts/sync.mjs`) and synced tests

Status: built (unreleased). Milestone 7 of the [boilerplate design](2026-11-23-boilerplate-design.md).

## Intent
A spawned project is a copy of the template at one moment. The template changes quickly (agents, hooks, workflows, scripts), and the owner needs a safe way to take those changes without overwriting what the project did on top of them. `sync.mjs` brings a project's **agentic layer** (see `layers.json`) up to a template release. A human runs it and reviews the result as a normal PR ([ADR 0010](../../agentic/adr/0010-staleness-is-manual.md): nothing runs on a schedule, and Claude cannot write the protected `.claude/` and `.github/workflows/` paths anyway).

## Goals
- Update only paths the agentic layer owns, from a released template version, with a dry-run first.
- Never lose a local edit silently: a file the project changed is reported as a conflict and skipped.
- Know which files the template removed, so they can be deleted safely.
- Record the new version in `boilerplate.lock` so `staleness.mjs` agrees.
- Move the template's tests into a synced directory so they follow the scripts they cover (known gap in [ADR 0009](../../agentic/adr/0009-template-files-in-spawned-projects.md)).

## Non-goals
- No merge of conflicting edits (no three-way text merge, no `.orig` or `.template-new` files). The owner resolves a conflict by hand or with `--force`.
- No sync of seeded files (`CLAUDE.md`, `README.md`, `ci.yml`, ...), template-only files, vendored files (that is `vendor.mjs`) or project files.
- No scheduling, hook or workflow. No dependencies beyond Node.

## Anti-goals
- A sync that "works" by overwriting a customised `settings.json` or hook without saying so.
- A sync that deletes a script the project added itself.
- A half-synced project that `staleness.mjs` reports as current.

## Approaches
How to get the template's files:
- **A. Release tarballs from the GitHub API (chosen).** Download the tarball for the project's `based_on` tag and for the target tag, compare three trees (old template, new template, project). Reuses the fetch and stub-server pattern of `staleness.mjs`, so tests need no network. Cost: needs network and, for a private template, a token.
- B. Shallow `git clone` at the two tags. No archive code, but needs credentials and a `git` remote, and is harder to stub in tests. Rejected.
- C. Per-file GitHub compare API. Lightest download, but no file contents for the three-way check without one request per file and rate limits. Rejected.

Chosen by the owner: A.

## Design

### Inputs
`node scripts/sync.mjs [--to <x.y.z>] [--apply] [--force] [--diff] [--from <dir>] [--base <dir>] [--root <dir>]`
- Default is a **dry-run**: it plans and prints, writes nothing. `--apply` writes.
- Target version: the latest GitHub Release of `repo` (from `boilerplate.lock`), or `--to`. Tags are `v<version>`.
- `--from <dir>` uses a local template checkout as the new tree (its `template.json` gives the version) and `--base <dir>` a local tree as the old tree. Each one replaces the matching tarball, for forks and offline use and for tests.
- A missing or unreadable `boilerplate.lock` is an error that points at `init.mjs`.
- GitHub token and API base URL come from the same env vars as `staleness.mjs` (`GH_TOKEN`, `GITHUB_TOKEN`, `gh auth token`; `STALENESS_GITHUB_API` for tests).

### The three trees
`old` = template at `based_on`, `new` = template at the target, `project` = the working directory. A path is **in scope** when the agentic layer owns it (`owns()` from `layers.mjs`) according to the `layers.json` of the tree it exists in: the new tree for paths in `new`, the old tree for paths only in `old`. Paths owned by no layer, or by another layer, are never read or written.

### Decision per in-scope path
First match wins. `eq(a, b)` is byte equality.

| Case | Action |
|---|---|
| in `new`, project equals `new` | nothing (already current, including a project spawned after `based_on`) |
| in `new`, `old` equals `new` (template did not change it) | nothing; local edits stay, not reported |
| in `new`, absent from project, absent from `old` | **add** |
| in `new`, project equals `old` | **update** |
| in `new`, project differs from `old` (or project deleted a file `old` had, or the file exists in the project but not in `old`) | **conflict** |
| in `old` only, project equals `old` | **delete** |
| in `old` only, project differs from `old` | **conflict** (template removed it, project edited it) |
| in `old` only, absent from project | nothing |

`--force` turns every conflict into the template's version (update, add, or delete). Files that exist only in the project are never touched.

### Output
Grouped lists (add, update, delete, conflict with the reason), a one-line summary and the release notes link. `--diff` adds a unified diff per update and conflict (`git diff --no-index`). Paths are printed repo-relative with forward slashes.

### Apply
1. Refuse unless the project is a git repository. Refuse if any file the plan would write or delete, or `boilerplate.lock`, has uncommitted changes (`git status --porcelain -- <paths>`). Unrelated dirty files do not block. There is no override flag: commit or stash first. This keeps a bad run one `git checkout` away.
2. Plan completely first, then write: no partial plan on an error. Create parent directories, delete files and prune directories left empty.
3. Set `based_on` in `boilerplate.lock` to the target version **only if there are no conflicts** (or `--force` resolved them), so a partly synced project still shows as behind. A target equal to `based_on` is a no-op; a target older than `based_on` is refused.
4. Print what was written and what to do next (review the diff, run the project check, open a PR).
`sync.mjs` replaces itself like any other synced script; Node has already loaded it.

### Exit codes
0 nothing to do (or applied cleanly), 1 changes pending in a dry-run or conflicts remain, 2 the run failed (network, bad lock, dirty paths, not a git repository). Same meaning as `staleness.mjs`.

### Archive handling
Node has no tar reader, so `sync.mjs` includes a minimal one over `zlib.gunzipSync` (ustar headers, regular files, GNU long names and the pax `path` record GitHub uses), in the style of the zip reader in `report.mjs`. The top-level directory of a GitHub tarball (`<owner>-<repo>-<sha>/`) is stripped. Symlinks and any path that escapes the extraction root are ignored. Entries are held in memory as a map of path to bytes; no extraction to disk.

### Registration
Entry in `scripts/commands.json` (audience `you`, flags, exit codes, example); the existing test then keeps it honest. `layers.json` descriptions that say "sync.mjs will" are updated. `staleness.mjs` needs no change.

## The tests move
The template's tests that guard synced scripts move to `tests/agentic/**`, a new agentic-layer path in `layers.json`: `init`, `check`, `validate`, `vendor`, `telemetry`, `trim-skills`, `protect-paths`, `layers`, `layers-match`, `staleness`, `report`, `run`, and the new `sync` tests. `tests/release.test.mjs` and `tests/agents.test.mjs` stay in `tests/` and stay template-only. `tests/**` stays project-owned, with `tests/agentic/**` added to that layer's `exclude` so the two layers do not overlap. Relative paths and fixtures inside the moved tests are adjusted, the CI glob (`tests/**/*.test.mjs`) already covers the new directory, and `ADR 0009` is rewritten (gap closed, new layout). A separate commit from `sync.mjs`.

Consequence for a project spawned **before** the move: its old `tests/*.test.mjs` copies are project-owned and stay behind as duplicates after the first sync that adds `tests/agentic/`. The changelog entry says to delete them. No such project exists yet (the template is not public), so the entry is short.

## Testing
Tests use temp directories and `--from`/`--base` trees for the decision table (every row, including `--force`, deletions and the added-file case), plus a stub HTTP server serving tarballs and the release API for the fetch path, the tar reader (long names, pax records, stripped top dir, escaping paths) and the dirty-path and lock rules. Async `execFile`, not `spawnSync`, where a stub server is involved. One test spawns a fixture project via `init`, syncs it from a template tree one version ahead, and checks that the project's own `scripts/` file and `CLAUDE.md` are untouched.

## Left to the builder
- Output wording and layout, as long as the four groups and the summary are there.
- Whether the tar reader lives in `sync.mjs` or a small shared module (`report.mjs` keeps its own zip reader, so no shared module is required).
- Exact handling of line endings: compare bytes as they are; the repo is LF, and a CRLF checkout shows as a conflict. If that turns out to bite on Windows, normalise on compare only, never on write.
- Pruning of empty directories after deletes.
