# 0006. Knowledge graph

- Status: accepted

## Decision
`graphify-out/` is committed. Input is limited to source, tests, scripts, docs and `CLAUDE.md`; `.claude/skills` and `_bmad*` are excluded. Agents read `graphify-out/GRAPH_REPORT.md` first, then read files selectively. The graph is refreshed with `graphify --update` after merges, in commits separate from feature PRs.

## Consequences
- Less context spent on exploration.
- Graph commits add diff noise, hence the separate PRs.

## Alternatives
Not recorded. The ADR records how the graph is used, not the other ways to give agents context.
