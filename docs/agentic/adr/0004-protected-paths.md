# 0004. Protected paths

- Status: accepted

## Decision
The agent may not edit `_bmad/`, `_bmad-output/`, `.claude/` or `.github/workflows/`. Projects add their own paths (for example test snapshot baselines) to the list. Enforced twice: `permissions.deny` in `.claude/settings.json` and a PreToolUse hook (`.claude/hooks/protect-paths.mjs`, exit code 2). `CODEOWNERS` requires owner review for `.github/`, `.claude/`, `docs/adr/` and `CLAUDE.md`. Merging is done by a human only.

## Consequences
- Changes to these paths are made by a human, outside issue work.
- The guardrails live in the repository, not in anyone's global `~/.claude/`.

## Known gaps
**The hook is exact for file tools, best-effort for Bash.** `Edit`, `Write`, `MultiEdit` and `NotebookEdit` are checked by resolved path, case-insensitively (Windows and macOS file systems are). `Bash` is checked by pattern: a command that names a protected directory and also contains a redirect or a mutating command (`rm`, `mv`, `cp`, `tee`, `sed -i`, `git checkout`, `Set-Content`, ...) is blocked. This stops the obvious cases only. Writes through an interpreter (`node -e`, `python -c`), a script that was edited earlier, or a path assembled at run time are not caught. `permissions.deny` has no Bash path rules for the same reason. Treat the hook as a guard against mistakes, not against a determined agent.

**`scripts/` is not protected.** It is template-owned (see `layers.json`), but a project may legitimately add its own scripts there, and `sync.mjs` and review catch unintended changes. Add `/^scripts\//` to the hook's list to protect it.

**Branch protection** and rulesets are unavailable on private repositories on a free GitHub plan, so `CODEOWNERS` is advisory there and nothing on GitHub technically blocks a merge to the default branch. Mitigation: the `--allowedTools` lists in the workflows contain no `gh pr merge`, and CLAUDE.md requires work on `claude/issue-*` branches. Residual risk: `Bash(git push:*)` is allowed, so a direct push to the default branch is not technically blocked. Where the plan allows it, enable 1 required approval, code owner review, no force push, admin bypass for the owner.

## Alternatives
- `permissions.deny` alone, or the hook alone: not chosen: the decision is to enforce both. Why one was not enough is not recorded.
- Protecting `scripts/` as well: not done, see Known gaps.
- Branch protection and rulesets instead of CODEOWNERS advice: not available on private repositories on a free plan, see Known gaps.
