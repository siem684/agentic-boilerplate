import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseContext, connectorDisplayName, parseTokens, buildItems } from "../../scripts/lean-plan.mjs";

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

const CATALOG = {
  plugins: { keep: [], off: [], reasons: {} },
  connectors: { keep: [], off: ["claude.ai G*"], reasons: { "claude.ai G*": "not needed for code" } },
  mcp: { keep: ["local-*"], off: [], reasons: { "local-*": "developer tool" } },
  skills: { keep: ["code-review", "pptx"], off: ["pptx"], reasons: { pptx: "documents, not code", "code-review": "reviews code" } },
  tools: [{ name: "Artifact", recommend: "off", reason: "pages, not code" }],
};
const items = (userPlugins = ["helper@market"]) => buildItems({ context: parseContext(REPORT), userPlugins, catalog: CATALOG });
const byKey = (list, key) => list.find((i) => i.key === key);

test("buildItems groups plugins, connectors, mcp, skills, tools in order", () => {
  assert.deepEqual(items().map((i) => i.key), [
    "plugins:helper",
    "connectors:claude.ai Gmail",
    "connectors:claude.ai Google Calendar",
    "mcp:local-search",
    "skills:handoff",
    "skills:my-skill",
    "skills:dataviz",
    "skills:code-review",
    "skills:pptx",
    "skills:anthropic-skills:handoff",
    "tools:Artifact",
  ]);
  assert.deepEqual(byKey(items(), "connectors:claude.ai Gmail"), {
    key: "connectors:claude.ai Gmail", group: "connectors", name: "claude.ai Gmail", tokens: 3300,
    recommend: "off", reason: "not needed for code", switchable: true,
  });
  assert.deepEqual(byKey(items(), "tools:Artifact"), {
    key: "tools:Artifact", group: "tools", name: "Artifact", tokens: null,
    recommend: "off", reason: "pages, not code", switchable: true,
  });
});

test("plugin tokens are the sum of its skills", () => {
  const list = items(["helper@market", "quiet@market"]);
  assert.deepEqual(byKey(list, "plugins:helper"), {
    key: "plugins:helper", group: "plugins", name: "helper", id: "helper@market", tokens: 50,
    recommend: "keep", reason: "unknown, kept by default", switchable: true,
  });
  assert.equal(byKey(list, "plugins:quiet").tokens, null);
});

test("unknown items are kept by default", () => {
  const i = byKey(items(), "skills:dataviz");
  assert.equal(i.recommend, "keep");
  assert.equal(i.reason, "unknown, kept by default");
});

test("catalog off wins over keep", () => {
  assert.equal(byKey(items(), "skills:pptx").recommend, "off");
  assert.equal(byKey(items(), "skills:pptx").reason, "documents, not code");
  assert.equal(byKey(items(), "skills:code-review").reason, "reviews code");
  assert.equal(byKey(items(), "mcp:local-search").reason, "developer tool");
});

test("the developer's own skills are kept, whatever the catalog says", () => {
  const catalog = { ...CATALOG, skills: { keep: [], off: ["handoff", "my-*"], reasons: {} } };
  const list = buildItems({ context: parseContext(REPORT), userPlugins: [], catalog });
  assert.equal(byKey(list, "skills:handoff").recommend, "keep");
  assert.equal(byKey(list, "skills:my-skill").recommend, "keep");
  assert.equal(byKey(list, "skills:anthropic-skills:handoff").recommend, "keep");
});

test("a plugin without an enabledPlugins id is not switchable", () => {
  const i = byKey(items([]), "plugins:helper");
  assert.equal(i.switchable, false);
  assert.equal(i.reason, "loaded outside enabledPlugins; cannot be turned off here");
  assert.equal(i.id, undefined);
});

test("the shipped catalog recommends what the spec says", () => {
  const catalog = JSON.parse(readFileSync(new URL("../../scripts/lean-catalog.json", import.meta.url), "utf8"));
  const context = {
    skills: ["pptx", "docx", "xlsx", "code-review", "security-review"].map((name) => ({ name, source: "claudeai", tokens: 1 })),
    servers: [{ name: "claude_ai_Gmail", tokens: 1 }],
  };
  const list = buildItems({ context, userPlugins: [], catalog });
  for (const k of ["skills:pptx", "skills:docx", "skills:xlsx", "connectors:claude.ai Gmail", "tools:Artifact"]) {
    assert.equal(byKey(list, k)?.recommend, "off", k);
  }
  for (const k of ["skills:code-review", "skills:security-review"]) assert.equal(byKey(list, k)?.recommend, "keep", k);
  for (const i of list) assert.ok(i.reason && i.reason !== "unknown, kept by default", `${i.key} has a catalog reason`);
});
