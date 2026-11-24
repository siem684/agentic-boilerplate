import { test } from "node:test";
import assert from "node:assert/strict";
import { matches, owns } from "../scripts/layers.mjs";

test("an exact path matches only itself", () => {
  assert.ok(matches("CHANGELOG.md", "CHANGELOG.md"));
  assert.ok(!matches("CHANGELOG.md", "docs/CHANGELOG.md"));
});

test("dir/** matches everything below dir, not a sibling with the same prefix", () => {
  assert.ok(matches("scripts/**", "scripts/init.mjs"));
  assert.ok(matches("scripts/**", "scripts/a/b.mjs"));
  assert.ok(!matches("scripts/**", "scripts2/init.mjs"));
  assert.ok(!matches("scripts/**", "scripts"));
});

test("* matches within one path segment", () => {
  assert.ok(matches(".claude/skills/bmad-*/**", ".claude/skills/bmad-help/SKILL.md"));
  assert.ok(!matches(".claude/skills/bmad-*/**", ".claude/skills/other/SKILL.md"));
  assert.ok(!matches("docs/*.md", "docs/a/b.md"));
  assert.ok(matches("docs/*.md", "docs/a.md"));
});

test("regex characters in a pattern are literal", () => {
  assert.ok(matches(".github/ISSUE_TEMPLATE/**", ".github/ISSUE_TEMPLATE/bug.md"));
  assert.ok(!matches(".github/ISSUE_TEMPLATE/**", "xgithub/ISSUE_TEMPLATE/bug.md"));
});

test("owns honours exclude", () => {
  const layer = { paths: ["scripts/**"], exclude: ["scripts/release.mjs"] };
  assert.ok(owns(layer, "scripts/check.mjs"));
  assert.ok(!owns(layer, "scripts/release.mjs"));
  assert.ok(!owns(layer, "docs/a.md"));
  assert.ok(owns({ paths: ["a.txt"] }, "a.txt"), "exclude is optional");
});
