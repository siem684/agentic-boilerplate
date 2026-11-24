import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const AGENTS_DIR = new URL("../.claude/agents/", import.meta.url);
const agent = (name) => readFileSync(new URL(`${name}.md`, AGENTS_DIR), "utf8");
const claudeMd = readFileSync(fileURLToPath(new URL("../CLAUDE.md", import.meta.url)), "utf8");
const headings = [...claudeMd.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((m) => m[1].toLowerCase());

test("every 'X section of CLAUDE.md' an agent mentions exists as a heading", () => {
  for (const file of readdirSync(fileURLToPath(AGENTS_DIR)).filter((f) => f.endsWith(".md"))) {
    const text = agent(file.replace(/\.md$/, ""));
    for (const [, name] of text.matchAll(/the ([\w ]+?) section of CLAUDE\.md/gi)) {
      assert.ok(headings.includes(name.toLowerCase()), `${file} refers to a missing CLAUDE.md section: ${name}`);
    }
  }
});

test("CLAUDE.md has a Tests section for qa-tester", () => {
  assert.ok(headings.includes("tests"));
  assert.match(agent("qa-tester"), /Tests section/);
});

test("claude-dev does not hard-code the base branch of the PR", () => {
  const text = agent("claude-dev");
  assert.match(text, /gh pr create/);
  assert.doesNotMatch(text, /base\s+`(master|main)`/i);
  assert.doesNotMatch(text, /--base\b(?!`)/, "an explicit --base would override the default branch");
});

test("CLAUDE.md points at the manual staleness check and does not promise an issue nothing creates", () => {
  assert.match(claudeMd, /scripts\/staleness\.mjs/);
  assert.doesNotMatch(claudeMd, /staleness report issue/i);
});

test("claude-dev tells the agent that gh targets the default branch", () => {
  assert.match(agent("claude-dev"), /default branch/i);
});

// ---- the reviewer agent is the one review standard, for people and for CI -------------------

const ciYml = readFileSync(fileURLToPath(new URL("../.github/workflows/ci.yml", import.meta.url)), "utf8");
const MARKER = "<!-- claude-review -->";

test("the CI review job runs the reviewer agent and keeps the model override", () => {
  assert.match(ciYml, /--agent reviewer\b/);
  assert.match(ciYml, /--model \$\{\{ vars\.REVIEW_MODEL \|\| 'claude-sonnet-5-5' \}\}/);
});

test("the review standard is written once, in reviewer.md, not again in ci.yml", () => {
  const reviewer = agent("reviewer");
  for (const needle of [MARKER, "PREVIOUS_REVIEWS", "@claude please fix the blocking findings above", "## Blocking", "## Suggestions"]) {
    assert.ok(reviewer.includes(needle), `reviewer.md must contain: ${needle}`);
  }
  assert.doesNotMatch(reviewer, /Reply with JSON only/);
  // ci.yml still counts earlier reviews by the marker, so both files must agree on it.
  assert.ok(ciYml.includes(MARKER), "ci.yml counts earlier reviews by the marker");
  assert.doesNotMatch(ciYml, /independent code reviewer/i, "the review rules must not be repeated in the workflow prompt");
  assert.doesNotMatch(ciYml, /"Blocking" and "Suggestions"/);
});

test("reviewer.md says in its frontmatter that --model overrides its model", () => {
  const frontmatter = agent("reviewer").match(/^---\r?\n([\s\S]*?)\r?\n---/)[1];
  assert.match(frontmatter, /^model: claude-opus-5-5$/m);
  assert.match(frontmatter, /^#.*--model.*overrid/im);
});
