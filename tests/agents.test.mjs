import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const agent = (name) =>
  readFileSync(fileURLToPath(new URL(`../.claude/agents/${name}.md`, import.meta.url)), "utf8");

test("claude-dev does not hard-code the base branch of the PR", () => {
  const text = agent("claude-dev");
  assert.match(text, /gh pr create/);
  assert.doesNotMatch(text, /base\s+`(master|main)`/i);
  assert.doesNotMatch(text, /--base\b(?!`)/, "an explicit --base would override the default branch");
});

test("claude-dev tells the agent that gh targets the default branch", () => {
  assert.match(agent("claude-dev"), /default branch/i);
});
