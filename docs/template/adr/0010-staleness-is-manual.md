# 0010. Staleness is checked on request, not on a schedule

- Status: accepted

## Decision
`node scripts/staleness.mjs` reports what is behind: the template, the pinned BMAD and graphify versions, and the GitHub Actions pinned in the workflows. It is read-only and runs only when a person (or the agent, when asked) invokes it. Nothing schedules it: no weekly workflow, no "Staleness report" issue, no SessionStart hook, no cache.

The exit code is 0 when everything is current, 1 when something is outdated and 2 when a check failed (2 wins, because an incomplete answer is not "current"). A failed lookup is reported on its own line instead of hidden: someone who asked for the check wants to know it did not run.

## How the template version is known
The template records its version in `template.json` (template-only, hand-edited in the release commit; `release.mjs` refuses to tag if it differs). `init.mjs` copies it into `boilerplate.lock` in the spawned project, which sync (milestone 7) will update. "Use this template" copies the branch head with fresh history, so the lock names the last released version, not a commit. A project spawned between releases may be slightly newer than it says; the report only compares versions and lists changes after `based_on`.

## Why
- A spawned project's owner decides when to spend attention on upgrades. A weekly issue or a start-of-session message is noise for the next owner, and `npm` does not poll either.
- No scheduled workflow and no hook means no extra file in a protected path, no extra permissions and no background network use.
- It keeps the anti-goal of the design: warnings must not nag, must not break offline work, and must not let the agent upgrade anything.

## Consequences
- A project that never runs the check never learns it is behind. The README and `check.mjs` output point at the command; a team that wants a schedule can add its own workflow around it.
- Model IDs are not checked (no key-free way to ask). The report prints a reminder instead.
- GitHub calls use `GH_TOKEN`, `GITHUB_TOKEN` or `gh auth token` when available, because anonymous calls are limited to 60 an hour and a private template needs one. The token is sent to the GitHub API only.

## Rejected
- Weekly workflow keeping one deduplicated issue, and a weekly SessionStart hook (the original plan): too intrusive for a new owner, and both live in protected paths.
- Silent failure offline: right for a background check, wrong for one somebody asked for.
