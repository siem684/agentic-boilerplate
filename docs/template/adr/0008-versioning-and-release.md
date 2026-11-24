# 0008. Versioning and release

- Status: accepted

## Decision
The template is versioned with SemVer. Every release has a `CHANGELOG.md` entry (Keep a Changelog), grouped by layer (agentic layer, vendored, docs), and each entry carries an **Action required** line for spawned projects ("none" if there is nothing to do). A release is a git tag `vX.Y.Z` plus a GitHub Release whose notes are the changelog entry.

Bump rule:
- **Major:** the meaning of a guardrail, permission or workflow changes (for example a newly protected path, a stricter deny, a changed trigger or budget cap). Spawned projects must review.
- **Minor:** a new agent, skill, script or workflow that does not change existing behaviour.
- **Patch:** fixes and documentation.

`scripts/release.mjs <x.y.z>` creates the annotated tag and refuses unless the version is SemVer, the changelog has a non-empty entry for it with an Action required line, the working tree is clean and the tag does not exist. It never pushes and never publishes the GitHub Release: a human does both.

## Consequences
- Spawned projects can read what changed and what they must do before upgrading.
- A release cannot be tagged by accident or without release notes.
- Pushing the tag and publishing the Release stay human decisions, consistent with [0004](0004-protected-paths.md).

## Rejected
- Tagging from CI on merge: it makes releases implicit and removes the human decision.
- Calendar versioning: it says nothing about whether an upgrade is safe.
