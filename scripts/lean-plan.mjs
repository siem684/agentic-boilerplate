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
