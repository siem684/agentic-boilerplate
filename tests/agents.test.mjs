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

test("claude-dev tells the agent that gh targets the default branch", () => {
  assert.match(agent("claude-dev"), /default branch/i);
});
