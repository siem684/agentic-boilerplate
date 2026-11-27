import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseContext, connectorDisplayName, parseTokens } from "../../scripts/lean-plan.mjs";

const REPORT = readFileSync(new URL("./fixtures/context-report.md", import.meta.url), "utf8");

test("parseContext reads skills with source and tokens", () => {
  const { skills } = parseContext(REPORT);
  assert.deepEqual(skills.find((s) => s.name === "my-skill"), { name: "my-skill", source: "user", tokens: 20 });
  assert.deepEqual(skills.find((s) => s.name === "dataviz"), { name: "dataviz", source: "builtin", tokens: 480 });
  assert.deepEqual(skills.find((s) => s.name === "code-review"), { name: "code-review", source: "builtin", tokens: 1300 });
  assert.deepEqual(skills.find((s) => s.name === "pptx"), { name: "pptx", source: "claudeai", tokens: 330 });
  assert.equal(skills.length, 7);
});

test("parseContext sums MCP tool tokens per server", () => {
  assert.deepEqual(parseContext(REPORT).servers, [
    { name: "claude_ai_Gmail", tokens: 3300 },
    { name: "claude_ai_Google_Calendar", tokens: 470 },
    { name: "local-search", tokens: 130 },
  ]);
});

test("keeps colliding skill names apart", () => {
  const { skills } = parseContext(REPORT);
  assert.deepEqual(skills.filter((s) => s.name.endsWith("handoff")), [
    { name: "handoff", source: "user", tokens: 70 },
    { name: "anthropic-skills:handoff", source: "claudeai", tokens: 80 },
  ]);
});

test("plugin skills carry their plugin name", () => {
  assert.deepEqual(parseContext(REPORT).skills.find((s) => s.name === "helper:plan"), {
    name: "helper:plan",
    source: "plugin",
    plugin: "helper",
    tokens: 50,
  });
});

test("connector display names", () => {
  assert.equal(connectorDisplayName("claude_ai_Google_Calendar"), "claude.ai Google Calendar");
  assert.equal(connectorDisplayName("claude_ai_Gmail"), "claude.ai Gmail");
  assert.equal(connectorDisplayName("local-search"), null);
});

test("parseTokens", () => {
  assert.equal(parseTokens("~130"), 130);
  assert.equal(parseTokens("< 20"), 20);
  assert.equal(parseTokens("1.3k"), 1300);
  assert.equal(parseTokens("2k"), 2000);
  assert.equal(parseTokens("679"), 679);
});

test("parseContext returns null for text without the tables", () => {
  assert.equal(parseContext("Error: not signed in"), null);
  assert.equal(parseContext(""), null);
});
