# 0004. Protected paths

- Status: accepted

## Decision
The agent may not edit `_bmad/`, `_bmad-output/`, `.claude/` or `.github/workflows/`. Projects add their own paths (for example test snapshot baselines) to the list. Enforced twice: `permissions.deny` in `.claude/settings.json` and a PreToolUse hook (`.claude/hooks/protect-paths.mjs`, exit code 2). `CODEOWNERS` requires owner review for `.github/`, `.claude/`, `docs/adr/` and `CLAUDE.md`. Merging is done by a human only.

## Consequences
- Changes to these paths are made by a human, outside issue work.
- The guardrails live in the repository, not in anyone's global `~/.claude/`.

## Known gap
Branch protection and rulesets are unavailable on private repositories on a free GitHub plan, so `CODEOWNERS` is advisory there and nothing on GitHub technically blocks a merge to the default branch. Mitigation: the `--allowedTools` lists in the workflows contain no `gh pr merge`, and CLAUDE.md requires work on `claude/issue-*` branches. Residual risk: `Bash(git push:*)` is allowed, so a direct push to the default branch is not technically blocked. Where the plan allows it, enable 1 required approval, code owner review, no force push, admin bypass for the owner.
