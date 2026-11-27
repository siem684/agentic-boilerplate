// Pure logic for the `lean` command (issue #18): no I/O here, so it can be tested
// without a Claude Code install. `lean.mjs` does the reading, prompting and writing.

const SOURCES = { User: "user", "Built-in": "builtin", "claude.ai sync": "claudeai" };

// "~130" → 130, "< 20" → 20, "1.3k" → 1300, "2k" → 2000. Anything else → 0.
export function parseTokens(cell) {
  const m = /^([\d.]+)\s*([km]?)$/i.exec(String(cell).replace(/[~<\s]/g, ""));
  if (!m) return 0;
  const scale = { "": 1, k: 1e3, m: 1e6 }[m[2].toLowerCase()];
  return Math.round(Number(m[1]) * scale);
}

// `claude_ai_Google_Calendar` → `claude.ai Google Calendar`, the name settings use.
export function connectorDisplayName(serverName) {
  const m = /^claude_ai_(.+)$/.exec(serverName);
  return m ? `claude.ai ${m[1].replace(/_/g, " ")}` : null;
}

// Rows of the markdown table under `### <heading>`, as objects keyed by the header cells.
// Returns null when the heading or its table is missing.
function table(lines, heading) {
  const start = lines.findIndex((l) => l.trim() === `### ${heading}`);
  if (start < 0) return null;
  const rows = [];
  for (const line of lines.slice(start + 1)) {
    const t = line.trim();
    if (t.startsWith("#")) break;
    if (!t.startsWith("|")) {
      if (rows.length) break;
      continue;
    }
    rows.push(t.slice(1, -1).split("|").map((c) => c.trim()));
  }
  if (rows.length < 2) return null;
  const [header, , ...body] = rows;
  return body.map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""])));
}

// Skills and MCP servers from a `/context` report; null when neither table is there
// (not signed in, or the format changed). Skills from sources other than User, Plugin,
// Built-in and claude.ai sync are not the developer's own and are left out.
export function parseContext(text) {
  const lines = String(text).split(/\r?\n/);
  const skillRows = table(lines, "Skills");
  const toolRows = table(lines, "MCP Tools");
  if (!skillRows && !toolRows) return null;

  const skills = [];
  for (const row of skillRows ?? []) {
    const plugin = /^Plugin \((.+)\)$/.exec(row.Source);
    const source = plugin ? "plugin" : SOURCES[row.Source];
    if (!source || !row.Skill) continue;
    skills.push({ name: row.Skill, source, ...(plugin && { plugin: plugin[1] }), tokens: parseTokens(row.Tokens) });
  }

  const totals = new Map();
  for (const row of toolRows ?? []) {
    if (row.Server) totals.set(row.Server, (totals.get(row.Server) ?? 0) + parseTokens(row.Tokens));
  }
  const servers = [...totals].map(([name, tokens]) => ({ name, tokens }));
  return { skills, servers };
}

const UNKNOWN = "unknown, kept by default";
const matches = (pattern, name) => (pattern.endsWith("*") ? name.startsWith(pattern.slice(0, -1)) : pattern === name);

// The catalog's advice for one name in one group: `off` patterns first, then `keep`.
function recommend(entry, name) {
  for (const verdict of ["off", "keep"]) {
    const pattern = (entry?.[verdict] ?? []).find((p) => matches(p, name));
    if (pattern) return { recommend: verdict, reason: entry.reasons?.[pattern] ?? UNKNOWN };
  }
  return { recommend: "keep", reason: UNKNOWN };
}

function item(group, name, tokens, advice, extra = {}) {
  return { key: `${group}:${name}`, group, name, ...extra, tokens, ...advice, switchable: true };
}

// Everything the developer can choose about, in screen order: plugins, connectors,
// other MCP servers, skills, tools. `userPlugins` are the enabledPlugins ids set to true.
export function buildItems({ context, userPlugins, catalog }) {
  const { skills = [], servers = [] } = context ?? {};
  const pluginTokens = new Map();
  for (const s of skills.filter((s) => s.source === "plugin")) {
    pluginTokens.set(s.plugin, (pluginTokens.get(s.plugin) ?? 0) + s.tokens);
  }

  const plugins = userPlugins.map((id) => {
    const name = id.split("@")[0];
    return item("plugins", name, pluginTokens.get(name) ?? null, recommend(catalog.plugins, name), { id });
  });
  const known = new Set(plugins.map((p) => p.name));
  for (const [name, tokens] of pluginTokens) {
    if (known.has(name)) continue;
    plugins.push({
      ...item("plugins", name, tokens, { recommend: "keep", reason: "loaded outside enabledPlugins; cannot be turned off here" }),
      switchable: false,
    });
  }

  const connectors = [];
  const mcp = [];
  for (const s of servers) {
    const display = connectorDisplayName(s.name);
    if (display) connectors.push(item("connectors", display, s.tokens, recommend(catalog.connectors, display)));
    else mcp.push(item("mcp", s.name, s.tokens, recommend(catalog.mcp, s.name)));
  }

  const own = { recommend: "keep", reason: "your own skill" };
  const skillItems = skills
    .filter((s) => s.source !== "plugin")
    .map((s) => item("skills", s.name, s.tokens, s.source === "user" ? own : recommend(catalog.skills, s.name)));

  const tools = (catalog.tools ?? []).map((t) => item("tools", t.name, null, { recommend: t.recommend, reason: t.reason }));
  return [...plugins, ...connectors, ...mcp, ...skillItems, ...tools];
}

// Whether `item` is turned off in `settings` (only the entries this command writes count).
function isOff(settings, item) {
  const denied = (settings.deniedMcpServers ?? []).some((d) => d?.serverName === item.name);
  switch (item.group) {
    case "plugins":
      return settings.enabledPlugins?.[item.id] === false;
    case "connectors":
      return settings.disableClaudeAiConnectors === true || denied;
    case "mcp":
      return denied;
    case "skills":
      return settings.skillOverrides?.[item.name] === "off";
    default:
      return item.name === "Artifact"
        ? settings.enableArtifact === false
        : (settings.permissions?.deny ?? []).includes(item.name);
  }
}

// `settings` with the managed entries rewritten so exactly the `off` keys are off.
// A new object; the input is untouched. Entries that belong to no item are kept as they are,
// and the containers this command writes into are removed when they end up empty (an empty
// container means nothing to Claude Code, and a previous run may have created it).
export function applyChoices(settings, items, off) {
  const s = structuredClone(settings ?? {});
  const live = items.filter((i) => i.switchable);
  const isOn = (i) => !off.has(i.key);

  const plugins = live.filter((i) => i.group === "plugins");
  if (plugins.length) {
    s.enabledPlugins ??= {};
    for (const p of plugins) {
      if (isOn(p)) delete s.enabledPlugins[p.id];
      else s.enabledPlugins[p.id] = false;
    }
  }

  const connectors = live.filter((i) => i.group === "connectors");
  const servers = live.filter((i) => i.group === "connectors" || i.group === "mcp");
  const allConnectorsOff = connectors.length > 0 && connectors.every((c) => !isOn(c));
  if (connectors.length) {
    if (allConnectorsOff) s.disableClaudeAiConnectors = true;
    else delete s.disableClaudeAiConnectors;
  }
  if (servers.length) {
    const names = new Set(servers.map((i) => i.name));
    const wanted = servers.filter((i) => !isOn(i) && !(i.group === "connectors" && allConnectorsOff));
    s.deniedMcpServers = [
      ...(s.deniedMcpServers ?? []).filter((d) => !names.has(d?.serverName)),
      ...wanted.map((i) => ({ serverName: i.name })),
    ];
  }

  const skills = live.filter((i) => i.group === "skills");
  if (skills.length) {
    s.skillOverrides ??= {};
    for (const k of skills) {
      if (isOn(k)) delete s.skillOverrides[k.name];
      else s.skillOverrides[k.name] = "off";
    }
  }

  for (const t of live.filter((i) => i.group === "tools")) {
    if (t.name === "Artifact") {
      if (isOn(t)) delete s.enableArtifact;
      else s.enableArtifact = false;
      continue;
    }
    s.permissions ??= {};
    s.permissions.deny = (s.permissions.deny ?? []).filter((d) => d !== t.name);
    if (!isOn(t)) s.permissions.deny.push(t.name);
  }

  const empty = (v) => v != null && (Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0);
  for (const key of ["enabledPlugins", "deniedMcpServers", "skillOverrides"]) {
    if (empty(s[key])) delete s[key];
  }
  if (s.permissions) {
    if (empty(s.permissions.deny)) delete s.permissions.deny;
    if (empty(s.permissions)) delete s.permissions;
  }
  return s;
}

// The keys of the items `settings` turns off, or null when it holds none of the
// entries this command writes (a first run: show the recommendations instead).
export function currentOff(settings, items) {
  const off = new Set(items.filter((i) => i.switchable && isOff(settings ?? {}, i)).map((i) => i.key));
  return off.size || settings?.disableClaudeAiConnectors === true ? off : null;
}

// One answer on a group screen with `count` numbered items.
export function parseAnswer(input, count) {
  const t = String(input ?? "").trim().toLowerCase();
  if (t === "") return { action: "accept" };
  if (t === "a") return { action: "all-on" };
  if (t === "n") return { action: "all-off" };
  const parts = t.split(/[\s,]+/).filter(Boolean);
  if (!parts.every((p) => /^\d+$/.test(p))) return { action: "invalid" };
  const numbers = [...new Set(parts.map(Number))];
  if (numbers.some((n) => n < 1 || n > count)) return { action: "invalid" };
  return { action: "toggle", numbers };
}

// What changes between two off-sets, and the tokens the newly turned-off items cost.
export function summarize(before, after, items) {
  const turnedOff = items.filter((i) => after.has(i.key) && !before.has(i.key));
  const turnedOn = items.filter((i) => before.has(i.key) && !after.has(i.key));
  const tokensSaved = turnedOff.reduce((sum, i) => sum + (i.tokens ?? 0), 0);
  return { turnedOff, turnedOn, tokensSaved };
}

export const GROUP_LABELS = {
  plugins: "Plugins",
  connectors: "claude.ai connectors",
  mcp: "Other MCP servers",
  skills: "Skills",
  tools: "Built-in tools",
};

// 3300 → "~3.3k", 480 → "~480".
export const formatTokens = (n) => (n >= 1000 ? `~${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : `~${n}`);

// The keys a first run starts from.
export function recommendedOff(items) {
  return new Set(items.filter((i) => i.switchable && i.recommend === "off").map((i) => i.key));
}

const shortName = (i) => (i.group === "connectors" ? i.name.replace(/^claude\.ai /, "") : i.name);

// One group screen: header with count, tokens and the recommendation; one line per item
// ([x] = off); switchable items are numbered from 1 in screen order.
export function renderGroup(group, items, off) {
  const list = items.filter((i) => i.group === group);
  const switchable = list.filter((i) => i.switchable);
  const known = list.filter((i) => i.tokens != null);
  const tokens = known.length ? `, ${formatTokens(known.reduce((s, i) => s + i.tokens, 0))} tokens` : "";
  const recOff = switchable.filter((i) => i.recommend === "off").length;
  const rec = recOff === 0 ? "all on" : recOff === switchable.length ? "all off" : `${recOff} of ${switchable.length} off`;
  const width = Math.max(...list.map((i) => shortName(i).length));
  let n = 0;
  const lines = list.map((i) => {
    const isOff = off.has(i.key);
    const mark = !i.switchable ? "[-]  " : `${isOff ? "[x]" : "[ ]"} ${++n}`;
    return `  ${mark} ${shortName(i).padEnd(width)}  ${isOff ? "off" : "on "}   ${i.reason}`;
  });
  return [`${GROUP_LABELS[group]} (${list.length}${tokens})    recommended: ${rec}`, ...lines, "Enter = accept, numbers to toggle (e.g. 2 5), a = all on, n = all off"].join("\n");
}

// The off-set after one parsed answer on `group`'s screen; the input set is untouched.
export function answerGroup(answer, group, items, off) {
  if (answer.action === "accept" || answer.action === "invalid") return off;
  const switchable = items.filter((i) => i.group === group && i.switchable);
  const next = new Set(off);
  if (answer.action === "all-on") for (const i of switchable) next.delete(i.key);
  if (answer.action === "all-off") for (const i of switchable) next.add(i.key);
  if (answer.action === "toggle") {
    for (const n of answer.numbers) {
      const key = switchable[n - 1]?.key;
      if (key && !next.delete(key)) next.add(key);
    }
  }
  return next;
}
