# Security model

What the setup protects, who can make it spend money or change things, which controls exist, and where they stop. Every statement here was checked against the workflows and, for the action's behaviour, against the source of the pinned `claude-code-action` version. The controls are a guard against mistakes and a limit on cost. They are not a sandbox, and the document says where they are weaker than they look.

## Assets

- **`ANTHROPIC_API_KEY`**, the repository secret both workflows use. With the `dev:deepseek` label, `DEEPSEEK_API_KEY` is used for that run instead ([ADR 0007](adr/0007-model-agnostic-base-url.md)); the two keys are never substituted for each other.
- **The repository and its default branch.** The agent pushes branches and opens PRs; a human merges.
- **The CI budget**: Actions minutes and model spend.
- **Personal data** in the repository: none is allowed, in code, tests, fixtures or PR text ([ADR 0005](adr/0005-no-personal-data.md)).

## Who can start the agent

`claude.yml` starts on `@claude` in an issue, comment or review. `claude-code-action` then checks the triggering actor before it does anything:

- A human actor needs **write access** (`write` or `admin`) to the repository. Anyone else is refused and the run fails fast, visibly, without spending model tokens. This was checked in the action source at the SHA pinned in the workflows. The input `allowed_non_write_users`, which can switch the check off, defaults to empty and neither workflow sets it.
- A bot actor is allowed only if it is named in `allowed_bots`: `claude` in `claude.yml`, `claude` and `github-actions` in `ci.yml`. The first is how the review job's single "please fix" mention starts one more development run ([architecture](architecture.md), [ADR 0003](adr/0003-budget-cap-and-loop-limits.md)).
- Pull requests from forks get no repository secrets from GitHub, and the `review` job of `ci.yml` runs only for branches named `claude/...` in the same repository.

So a stranger writing `@claude` on an issue cannot spend your key. A person you gave write access can.

## Anyone with write access spends the owner's key

There is one `ANTHROPIC_API_KEY` per repository. Every collaborator with write access can trigger a run billed to it, and a collaborator can also push a branch with a workflow that reads the secret. The template does not try to prevent this: write access is treated as trust in the key.

Per-run limits keep one run bounded, not the total: `--max-turns` (40 for development, 20 for review) and `timeout-minutes` (45 and 15). Budget caps (`MAX_COST_USD_DEV`, `MAX_COST_USD_REVIEW`) report an overrun after the run has finished. They alert; they cannot stop spending ([ADR 0003](adr/0003-budget-cap-and-loop-limits.md)). Telemetry shows what was spent (`node scripts/report.mjs`).

## Contributors without write access

The supported model for someone outside the maintainers is to work from a **fork** with their **own key**: they add `ANTHROPIC_API_KEY` to the secrets of their fork, and the workflows run there, on their account. They are the owner of that repository, so the write-access rule is satisfied by their own permissions and your key is not involved. Maintainers with write access are trusted with the shared key. `@claude` on the upstream repository is for maintainers and may fail for anyone else. The files `CONTRIBUTING.md` and `SECURITY.md` of the template repository describe the contributor side; they are not copied into spawned projects.

## Controls

| Control | What it does | Limit |
|---|---|---|
| Protected paths: `permissions.deny` plus the `protect-paths` hook | File tools cannot edit `_bmad/`, `_bmad-output/`, `.claude/` or `.github/workflows/` ([ADR 0004](adr/0004-protected-paths.md)). | Bash is checked by pattern only; see known gaps. |
| No merge, no force-push | Not in the `--allowedTools` lists; also denied in `settings.json`. | See residual risk. |
| `CODEOWNERS` | Makes the owner the reviewer of `.github/`, `.claude/`, `docs/adr/` and `CLAUDE.md`. | Advisory without branch protection. |
| Actions pinned by commit SHA | A moved tag cannot change what runs. | Upgrades are manual (`node scripts/staleness.mjs` reports them). |
| Trimmed skills in CI | Only four BMAD skills are loaded: less context, fewer surprises. | Not a security boundary. |
| Turn and time limits | Bound one run. | Do not bound the number of runs. |
| Budget alert | Reports an overrun after the run. | Does not stop anything. |
| Review loop count | The workflow counts earlier reviews, so the model cannot loop itself. | One automated fix round is allowed by design. |
| Independent review | The review job reads the PR without editing files. | A model's opinion, not a gate. |

## Known gaps

- **Write access is trust in the key.** See above. There is no per-user or per-day limit in the template.
- **Budget caps alert after the fact.** A run can cost more than the cap before anyone is told ([ADR 0003](adr/0003-budget-cap-and-loop-limits.md)).
- **The Bash hook is best effort.** It catches the obvious ways to write to a protected path, not writes through an interpreter or a path assembled at run time ([ADR 0004](adr/0004-protected-paths.md)).
- **`scripts/` is not protected.** An agent can edit the scripts that run in CI ([ADR 0004](adr/0004-protected-paths.md)).
- **No branch protection on private repositories on a free plan.** Nothing on GitHub technically blocks a push or merge to the default branch there; `git push` is allowed to the agent ([ADR 0004](adr/0004-protected-paths.md)).
- **Issue and PR text is untrusted input to the agent.** Only people with write access can start a run, but what they paste (a log, a quoted web page) can still carry instructions. The controls above limit the damage; they do not detect it.
- **The `dev:deepseek` path is a pilot.** Whether the base-URL setting is honoured by the action is unverified ([ADR 0007](adr/0007-model-agnostic-base-url.md)).

## Residual risk

If the agent is wrong, confused or manipulated, it can still: read the repository and the issue it was given; push branches and open or comment on PRs and issues; change files outside the protected paths, including `scripts/` and the tests; and run code through `node`, `npm` and `npx` on the job's runner, which also holds the key and a token with `contents: write` and `pull-requests: write`. Because that code is not sandboxed, treat the denial of merge and force-push as a strong default and not as a barrier, and do not assume the key is out of reach of code the agent runs. What it cannot do on its own authority is merge: a human reads the PR first, and that review is the control the rest depends on.

To report a vulnerability in the template, see `SECURITY.md` in the template repository.
