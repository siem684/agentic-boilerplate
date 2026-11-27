import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseContext, connectorDisplayName, parseTokens, buildItems, applyChoices, currentOff, parseAnswer, summarize } from "../../scripts/lean-plan.mjs";

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

// ---- Task 3: choices to settings, current state, answers ----

const ITEMS = buildItems({
  context: parseContext(REPORT),
  userPlugins: ["helper@market"],
  catalog: { ...CATALOG, tools: [{ name: "Artifact", recommend: "off", reason: "r" }, { name: "CronCreate", recommend: "off", reason: "r" }] },
});
const offSet = (...keys) => new Set(keys);

test("applyChoices: plugin", () => {
  assert.deepEqual(applyChoices({}, ITEMS, offSet("plugins:helper")), { enabledPlugins: { "helper@market": false } });
});

test("applyChoices: connector", () => {
  assert.deepEqual(applyChoices({}, ITEMS, offSet("connectors:claude.ai Gmail")), {
    deniedMcpServers: [{ serverName: "claude.ai Gmail" }],
  });
});

test("applyChoices: all connectors off uses disableClaudeAiConnectors", () => {
  const s = applyChoices({}, ITEMS, offSet("connectors:claude.ai Gmail", "connectors:claude.ai Google Calendar"));
  assert.deepEqual(s, { disableClaudeAiConnectors: true });
  assert.deepEqual(applyChoices(s, ITEMS, offSet("connectors:claude.ai Gmail")), {
    deniedMcpServers: [{ serverName: "claude.ai Gmail" }],
  });
});

test("applyChoices: mcp server", () => {
  assert.deepEqual(applyChoices({}, ITEMS, offSet("mcp:local-search")), { deniedMcpServers: [{ serverName: "local-search" }] });
});

test("applyChoices: skill keeps the exact name", () => {
  assert.deepEqual(applyChoices({}, ITEMS, offSet("skills:anthropic-skills:handoff")), {
    skillOverrides: { "anthropic-skills:handoff": "off" },
  });
});

test("applyChoices: Artifact", () => {
  assert.deepEqual(applyChoices({}, ITEMS, offSet("tools:Artifact")), { enableArtifact: false });
});

test("applyChoices: other tool", () => {
  assert.deepEqual(applyChoices({}, ITEMS, offSet("tools:CronCreate")), { permissions: { deny: ["CronCreate"] } });
});

test("keeps unrelated keys", () => {
  const mine = {
    env: { FOO: "1" },
    permissions: { allow: ["Bash(npm test)"], deny: ["Read(./secret)"] },
    skillOverrides: { "someone-else": "off" },
    deniedMcpServers: [{ serverName: "other" }],
  };
  const before = structuredClone(mine);
  const s = applyChoices(mine, ITEMS, offSet("skills:pptx", "tools:CronCreate", "mcp:local-search"));
  assert.deepEqual(mine, before, "input untouched");
  assert.deepEqual(s, {
    env: { FOO: "1" },
    permissions: { allow: ["Bash(npm test)"], deny: ["Read(./secret)", "CronCreate"] },
    skillOverrides: { "someone-else": "off", pptx: "off" },
    deniedMcpServers: [{ serverName: "other" }, { serverName: "local-search" }],
  });
});

test("turning an item back on removes only its entry", () => {
  const all = offSet("plugins:helper", "connectors:claude.ai Gmail", "mcp:local-search", "skills:pptx", "tools:Artifact", "tools:CronCreate");
  const s = applyChoices({ env: { A: "1" }, skillOverrides: { mine: "off" } }, ITEMS, all);
  assert.deepEqual(applyChoices(s, ITEMS, offSet("skills:pptx")), { env: { A: "1" }, skillOverrides: { mine: "off", pptx: "off" } });
  assert.deepEqual(applyChoices(s, ITEMS, offSet()), { env: { A: "1" }, skillOverrides: { mine: "off" } });
});

test("applyChoices is idempotent", () => {
  const off = offSet("plugins:helper", "connectors:claude.ai Gmail", "mcp:local-search", "skills:pptx", "tools:CronCreate");
  const once = applyChoices({ deniedMcpServers: [{ serverName: "x" }] }, ITEMS, off);
  assert.deepEqual(applyChoices(once, ITEMS, off), once);
});

test("currentOff reads back what applyChoices wrote", () => {
  for (const off of [
    offSet("plugins:helper", "connectors:claude.ai Gmail", "mcp:local-search", "skills:anthropic-skills:handoff", "tools:Artifact", "tools:CronCreate"),
    offSet("connectors:claude.ai Gmail", "connectors:claude.ai Google Calendar"),
  ]) {
    assert.deepEqual(currentOff(applyChoices({}, ITEMS, off), ITEMS), off);
  }
});

test("currentOff is null without managed entries", () => {
  assert.equal(currentOff({}, ITEMS), null);
  assert.equal(currentOff({ env: { A: "1" }, skillOverrides: { mine: "off" }, enabledPlugins: { "helper@market": true } }, ITEMS), null);
});

test("parseAnswer", () => {
  assert.deepEqual(parseAnswer("", 5), { action: "accept" });
  assert.deepEqual(parseAnswer("  ", 5), { action: "accept" });
  assert.deepEqual(parseAnswer("2 5", 5), { action: "toggle", numbers: [2, 5] });
  assert.deepEqual(parseAnswer("2,5", 5), { action: "toggle", numbers: [2, 5] });
  assert.deepEqual(parseAnswer("a", 5), { action: "all-on" });
  assert.deepEqual(parseAnswer("N", 5), { action: "all-off" });
  assert.deepEqual(parseAnswer("6", 5), { action: "invalid" });
  assert.deepEqual(parseAnswer("0", 5), { action: "invalid" });
  assert.deepEqual(parseAnswer("2 x", 5), { action: "invalid" });
  assert.deepEqual(parseAnswer("yes", 5), { action: "invalid" });
});

test("summarize counts tokens of items turned off", () => {
  const r = summarize(offSet("skills:pptx"), offSet("connectors:claude.ai Gmail", "tools:Artifact"), ITEMS);
  assert.deepEqual(r.turnedOff.map((i) => i.key), ["connectors:claude.ai Gmail", "tools:Artifact"]);
  assert.deepEqual(r.turnedOn.map((i) => i.key), ["skills:pptx"]);
  assert.equal(r.tokensSaved, 3300);
});

test("merged with .claude/settings.json the template's deny rules and hooks remain", () => {
  const template = JSON.parse(readFileSync(new URL("../../.claude/settings.json", import.meta.url), "utf8"));
  const real = JSON.parse(readFileSync(new URL("../../scripts/lean-catalog.json", import.meta.url), "utf8"));
  const items = buildItems({ context: parseContext(REPORT), userPlugins: ["helper@market"], catalog: real });
  const local = applyChoices({}, items, new Set(items.filter((i) => i.switchable).map((i) => i.key)));
  const merge = (a, b) => {
    if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
    if (a && b && typeof a === "object" && typeof b === "object") {
      const out = { ...a };
      for (const [k, v] of Object.entries(b)) out[k] = k in a ? merge(a[k], v) : v;
      return out;
    }
    return b === undefined ? a : b;
  };
  const merged = merge(template, local);
  for (const rule of template.permissions.deny) assert.ok(merged.permissions.deny.includes(rule), rule);
  const commands = merged.hooks.PreToolUse.flatMap((h) => h.hooks.map((x) => x.command));
  assert.ok(commands.some((c) => c.includes("protect-paths.mjs")));
  assert.equal(local.hooks, undefined);
  assert.equal(local.permissions.allow, undefined);
});
