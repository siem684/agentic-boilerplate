# Spike: Sonnet executor with an Opus advisor (November 2026)

Part of issue #10 (model choice per task). Run on 2026-11-26. Total spend: $9.92, against a $50 budget.

## Question
Can **B**, a Sonnet `claude-dev` that consults Opus through the advisor tool (`--advisor opus`), replace **A**, the fixed allocation of [ADR 0002](../adr/0002-model-allocation.md) (Opus for `claude-dev` and `fixer`)? B has to reach the same outcome at clearly lower cost.

**Decision rule** (fixed before any run): adopt B as the default if its pass rate is at least A's and its mean cost is at most 75% of A's. If B is cheaper but fails, look at where it fails. If it fails only on the large issue, that points to per-issue model choice.

## Method
- **Test set:** three solved issues from a static portfolio site that uses this template, one small, one medium and one large. The merged PRs touched 2, 5 and 9 files.
- **A:** the historical CI run of each issue, read from its telemetry. A merged all three. A was not rerun, and has one sample per issue.
- **Local control:** one A-configuration run on the small issue, to check that the local harness does not distort the outcome.
- **B:** `claude -p --agent claude-dev --model claude-sonnet-5-5 --advisor opus`, with every subagent forced to Sonnet (`CLAUDE_CODE_SUBAGENT_MODEL` plus `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`). Two runs per issue.
- **B'** (B-prime): B, plus two lines in the prompt. One says to use the subagents as `claude-dev.md` describes. The other says to consult the advisor before writing code and whenever blocked. Two runs each on the medium and large issues.
- **Isolation:** each run had its own sandbox built from the issue's base commit, with a single commit and no later history. The issue text was pasted into the prompt. `gh`, push and web access were blocked, and the sandbox used project settings only, without user plugins or MCP. Limits were 40 turns and $6 per run.
- **Scoring:**
  - **Green:** the project's own self-check passes (HTML validation, asset check, Playwright suite).
  - **Oracle:** the tests from A's merged PR, run against the result. Every oracle failure was read by hand.

## Results

| Issue | A (CI, Opus) | B run 1 | B run 2 | B' run 1 | B' run 2 |
|---|---|---|---|---|---|
| Small | $0.49, merged | $0.16, pass | $0.14, pass | – | – |
| Medium | $1.82, merged | $0.64, pass | $0.83, pass | $1.77, pass | $1.47, pass |
| Large | $1.92, merged | $0.45, **fail** | $0.20, **fail** | $0.73, **fail** | $1.54, **partial** |

The local control on the small issue cost $0.70 and passed. It followed the loop: triage once, `qa-tester` twice.

How the runs behaved:

| | B (6 runs) | B' (4 runs) |
|---|---|---|
| Advisor calls by `claude-dev` | 0 | exactly 1 in every run |
| Opus share of cost | 0% | 18–45%, mean 31% |
| Followed the loop (triage, then `qa-tester` for the failing test) | 0 of 6 | 3 of 4 |

**Large-issue failures.** The issue asked for two images that sat in a folder the agent could not read or copy. A built the effect in CSS instead.
- **B run 1** kept trying to convert the images with blocked tools and gave up.
- **B run 2** stopped and asked a human for the images.
- **B' run 1** consulted the advisor and settled a detailed plan with it. It then stopped and asked for the images without consulting the advisor again, although the prompt told it to.
- **B' run 2** found the images, converted them and shipped a working, green change.
  - The oracle fails partly on A's own naming choices (a class name and the button's label), which the issue does not ask for.
  - It also fails on one real defect: the lamp is not clickable in the copies the page shows while it scrolls endlessly. A handled that case.

## Against the decision rule
- **B:** passed 4 of 6, where A passed 3 of 3. Mean cost was $0.40, about 28% of A's $1.41. **Not adopted.** Every failure was on the large issue.
- **B':** passed 2 of 4 strictly, 3 of 4 counting the partial run, where A passed 2 of 2 on the same issues. Mean cost was $1.38, about 74% of A's $1.87. **Not adopted.** It just meets the cost bar, but it fails on outcome, again only on the large issue.

## Findings
1. **Sonnet does not consult the advisor unprompted.** In 6 B runs it never called it, so B was in practice plain Sonnet. When told to, it calls the advisor once, then not again when it gets stuck. That second, "when blocked" call is the one that would have mattered on the large issue.
2. **Sonnet skips the subagent loop that Opus follows.** Under the same `claude-dev.md`, Sonnet wrote tests and code inline in all 6 B runs, while Opus delegated to triage and `qa-tester`. An explicit instruction in the prompt fixes this. If a Sonnet `claude-dev` is ever used, `claude-dev.md` needs that instruction in its own text.
3. **The advisor did not change any outcome.** Plain Sonnet already passed the small and medium issues. On the large issue the advisor helped plan but did not change the decision to stop. Its advice is encrypted in the transcript, so we cannot see what it said.
4. **The advisor is expensive per call.** Each call reads the whole context, about 35–44k tokens, uncached. That is at least $0.16–0.18 per call, and it was about a third of B' cost.
5. **What separated A from B on the large issue was judgement under blocked tools, not coding.** A routed around the blocked asset. Sonnet either held on to the route the issue described or stopped.

## Recommendation for issue #10
- **Keep ADR 0002 as the default.** Do not turn on the advisor by default: it adds cost without changing an outcome here.
- **Per-issue model choice is worth pursuing, but the saving is not proven yet.** Plain Sonnet passed the small and medium issues at about 30–45% of A's cost. Opus was needed only where the work called for judgement. That favours a step that routes issues that are clearly small or medium to Sonnet and keeps Opus for the rest.
  - Prerequisite: the loop instruction from finding 2 goes into `claude-dev.md`, so that a Sonnet run still uses the separate test agent.
  - Caveat: the cheap passes skipped that loop. With the loop and the advisor, the medium issue cost 81–97% of A, partly because of the harness flaw below.
  - Next measurement: Sonnet runs that follow the loop, without the advisor.

## Limits of this spike
- **The samples are small.** There were three issues, two runs per configuration, and one historical A sample per issue. Treat the percentages as indicative.
- **A ran in CI with `gh` and the PR steps; B ran locally without them.** A's figures include a little extra cost for that.
- **The oracle encodes A's own implementation choices.** That is why each oracle failure was read by hand.
- **A harness flaw inflated some B' figures.** A leftover test server on a fixed port served one sandbox's site to later runs, because the Playwright config reuses an existing server outside CI.
  - All runs were rescored one at a time on a clean port. Every pass and fail verdict above comes from that rescore.
  - All four B' runs, both B runs on the large issue and B run 2 on the medium issue ran while the leftover server was up. The three B' runs that wrote code noticed it and worked around it, which added turns and cost to them.
  - Their B' cost figures above are therefore upper bounds.
