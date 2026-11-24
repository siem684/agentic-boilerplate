#!/usr/bin/env node
// report.mjs: cost and usage report over many agent runs. Read-only; run it when you want it.
//
//   node scripts/report.mjs                          # ./telemetry.jsonl
//   node scripts/report.mjs --from <file|dir> ...    # telemetry.jsonl files, or directories searched for *.jsonl
//   node scripts/report.mjs --github [owner/name]    # also download the `telemetry-*` artifacts of the repository
//   node scripts/report.mjs --github --since 30d --by week
//
// The input is the one-line-per-run records that scripts/telemetry.mjs writes in CI.
// Options: --since <YYYY-MM-DD | Nd>   only runs from then on
//          --by job|week               rows of the table (default job; week = the Monday, UTC)
//          --json                      print the report as JSON
// A run that appears twice (same run_id and job) is counted once.
//
// --github needs no `gh` binary, only a token: GH_TOKEN, GITHUB_TOKEN or `gh auth token`. The token is sent
// to the GitHub API only. Without a repository name it uses the git remote `origin`. At most 2000 artifacts
// are listed (newest first), and GitHub deletes artifacts after their retention period (30 days in the workflows here).
// Tests point the API elsewhere with REPORT_GITHUB_API.
//
// Exit code: 0 report printed (also when there are no records), 1 bad input, 2 GitHub could not be read.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";

const API = process.env.REPORT_GITHUB_API ?? "https://api.github.com";
const PER_PAGE = 100;
const MAX_PAGES = 20;
const DAY = 86_400_000;

class UsageError extends Error {}
class GitHubError extends Error {}

// ---- arguments -------------------------------------------------------------------------

function parseArgs(argv) {
  const o = { from: [], github: null, since: null, by: "job", json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new UsageError(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--from") o.from.push(value());
    else if (a === "--since") o.since = parseSince(value());
    else if (a === "--by") {
      o.by = value();
      if (!["job", "week"].includes(o.by)) throw new UsageError(`--by must be job or week, not "${o.by}"`);
    } else if (a === "--json") o.json = true;
    else if (a === "--github") {
      const next = argv[i + 1];
      o.github = next !== undefined && !next.startsWith("-") ? argv[++i] : "";
    } else throw new UsageError(`unknown flag ${a}`);
  }
  return o;
}

function parseSince(v) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))) return Date.parse(v);
  const days = v.match(/^(\d+)d$/);
  if (days) return Date.now() - Number(days[1]) * DAY;
  throw new UsageError(`--since must be a date like 2026-11-01 or a number of days like 30d, not "${v}"`);
}

// ---- reading local files ---------------------------------------------------------------

function parseLines(text, bad) {
  const records = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r && typeof r === "object" && !Array.isArray(r)) records.push(r);
      else bad.count++;
    } catch {
      bad.count++;
    }
  }
  return records;
}

function readLocal(paths, bad) {
  const records = [];
  for (const p of paths) {
    if (!existsSync(p)) throw new UsageError(`--from ${p}: no such file or directory`);
    const files = statSync(p).isDirectory()
      ? readdirSync(p, { recursive: true }).filter((f) => f.endsWith(".jsonl")).map((f) => join(p, f))
      : [p];
    for (const f of files) if (statSync(f).isFile()) records.push(...parseLines(readFileSync(f, "utf8"), bad));
  }
  return records;
}

// ---- GitHub artifacts ------------------------------------------------------------------

function token() {
  const t = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (t) return t;
  const r = spawnSync("gh", ["auth", "token"], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : null;
}

function repoFromRemote() {
  const r = spawnSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" });
  const m = r.status === 0 && r.stdout.trim().match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/);
  if (!m) throw new UsageError("could not tell the repository from the git remote 'origin'; pass it as --github owner/name");
  return m[1];
}

async function api(url, auth, what) {
  let res;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "agentic-boilerplate-report", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new GitHubError(`${what}: could not reach ${new URL(url).host} (${e.cause?.code ?? e.cause?.message ?? "network error"})`);
  }
  if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") {
    throw new GitHubError("GitHub rate limit reached; set GH_TOKEN or run `gh auth login` to raise it");
  }
  if (!res.ok) {
    const hint = res.status === 401 || res.status === 403 || res.status === 404 ? " (artifacts need a token with read access to the repository: set GH_TOKEN or run `gh auth login`)" : "";
    throw new GitHubError(`${what}: ${new URL(url).host}${new URL(url).pathname} answered ${res.status}${hint}`);
  }
  return res;
}

async function listArtifacts(repo, auth, since) {
  const found = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await (await api(`${API}/repos/${repo}/actions/artifacts?per_page=${PER_PAGE}&page=${page}`, auth, "listing artifacts")).json();
    for (const a of body.artifacts ?? []) {
      // Newest first: from the first artifact older than --since on, nothing relevant is left.
      if (since !== null && Date.parse(a.created_at) < since) return found;
      if (!a.expired && a.name?.startsWith("telemetry-")) found.push(a);
    }
    if (page * PER_PAGE >= (body.total_count ?? 0) || !(body.artifacts ?? []).length) return found;
  }
  console.error(`report: only the newest ${MAX_PAGES * PER_PAGE} artifacts were listed; narrow the range with --since`);
  return found;
}

// Entries of a zip as upload-artifact writes it (stored or deflated, no zip64).
function zipEntries(buf) {
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end === -1) throw new Error("not a zip archive");
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("damaged zip archive");
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    if (method !== 0 && method !== 8) throw new Error(`unsupported compression method ${method}`);
    entries.push({ name, read: () => (method === 0 ? data : inflateRawSync(data)) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readArtifact(repo, a, auth, bad) {
  const res = await api(`${API}/repos/${repo}/actions/artifacts/${a.id}/zip`, auth, `artifact ${a.name}`);
  try {
    return zipEntries(Buffer.from(await res.arrayBuffer()))
      .filter((e) => basename(e.name) === "telemetry.jsonl")
      .flatMap((e) => parseLines(e.read().toString("utf8"), bad));
  } catch (e) {
    throw new GitHubError(`artifact ${a.name}: ${e.message}`);
  }
}

async function readGithub(repoArg, since, bad) {
  const repo = repoArg || repoFromRemote();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new UsageError(`--github needs a repository as owner/name, not "${repo}"`);
  const auth = token();
  const artifacts = await listArtifacts(repo, auth, since);
  const records = [];
  for (let i = 0; i < artifacts.length; i += 8) {
    const batch = await Promise.all(artifacts.slice(i, i + 8).map((a) => readArtifact(repo, a, auth, bad)));
    records.push(...batch.flat());
  }
  return records;
}

// ---- aggregation -----------------------------------------------------------------------

const round = (n, d) => Number(n.toFixed(d));
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function dedupe(records) {
  const seen = new Map();
  for (const r of records) {
    const key = r.run_id != null ? `${r.run_id}|${r.job}` : JSON.stringify(r);
    if (!seen.has(key)) seen.set(key, r);
  }
  return [...seen.values()];
}

function summarise(records) {
  const sum = (f) => records.reduce((s, r) => s + num(r[f]), 0);
  const cost = sum("cost_usd");
  const input = sum("input_tokens");
  const read = sum("cache_read_tokens");
  const total = input + read + sum("cache_creation_tokens");
  return {
    runs: records.length,
    cost_usd: round(cost, 6),
    avg_cost_usd: records.length ? round(cost / records.length, 6) : 0,
    max_cost_usd: round(Math.max(0, ...records.map((r) => num(r.cost_usd))), 6),
    turns: sum("turns"),
    input_tokens: input,
    output_tokens: sum("output_tokens"),
    cache_hit_ratio: total ? round(read / total, 3) : 0,
    errors: records.filter((r) => r.is_error).length,
  };
}

function weekOf(ts) {
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return "unknown";
  const d = new Date(t);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function build(records, by) {
  const groups = new Map();
  for (const r of records) {
    const key = by === "week" ? weekOf(r.ts) : String(r.job ?? "unknown");
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const rows = [...groups].map(([key, rs]) => ({ key, ...summarise(rs) }));
  rows.sort(by === "week" ? (a, b) => a.key.localeCompare(b.key) : (a, b) => b.cost_usd - a.cost_usd || a.key.localeCompare(b.key));
  const byModel = {};
  for (const r of records) for (const [m, c] of Object.entries(r.cost_by_model ?? {})) byModel[m] = (byModel[m] ?? 0) + num(c);
  for (const m of Object.keys(byModel)) byModel[m] = round(byModel[m], 6);
  return { records: records.length, by, groups: rows, total: summarise(records), cost_by_model: byModel };
}

// ---- output ----------------------------------------------------------------------------

function table(header, rows) {
  const all = [header, ...rows];
  const w = header.map((_, c) => Math.max(...all.map((r) => String(r[c]).length)));
  const line = (r) => r.map((v, c) => (c === 0 ? String(v).padEnd(w[c]) : String(v).padStart(w[c]))).join("  ");
  return [line(header), ...rows.map(line)].join("\n");
}

function print(report, since) {
  if (!report.records) {
    console.log("No telemetry records found" + (since !== null ? ` since ${new Date(since).toISOString().slice(0, 10)}` : "") + ".");
    return;
  }
  const row = (key, g) => [key, g.runs, g.cost_usd.toFixed(4), g.avg_cost_usd.toFixed(4), g.max_cost_usd.toFixed(4), g.turns, g.input_tokens, g.output_tokens, g.cache_hit_ratio.toFixed(3), g.errors];
  console.log(`Telemetry report: ${report.records} run${report.records === 1 ? "" : "s"}, by ${report.by}\n`);
  console.log(
    table(
      [report.by === "week" ? "Week of" : "Job", "Runs", "Cost USD", "Avg", "Max", "Turns", "Input tok", "Output tok", "Cache hit", "Errors"],
      [...report.groups.map((g) => row(g.key, g)), row("Total", report.total)]
    )
  );
  const models = Object.entries(report.cost_by_model).sort((a, b) => b[1] - a[1]);
  if (models.length) console.log("\n" + table(["Model", "Cost USD"], models.map(([m, c]) => [m, c.toFixed(4)])));
}

// ---- main ------------------------------------------------------------------------------

try {
  const opts = parseArgs(process.argv.slice(2));
  const bad = { count: 0 };
  let records = [];
  if (opts.from.length === 0 && opts.github === null) {
    if (!existsSync(resolve("telemetry.jsonl"))) {
      throw new UsageError("no data: there is no ./telemetry.jsonl. Pass --from <file|dir> to read telemetry.jsonl files, or --github [owner/name] to download the artifacts of CI runs");
    }
    opts.from.push("telemetry.jsonl");
  }
  records.push(...readLocal(opts.from, bad));
  if (opts.github !== null) records.push(...(await readGithub(opts.github, opts.since, bad)));
  if (bad.count) console.error(`report: skipped ${bad.count} line${bad.count === 1 ? "" : "s"} that are not valid records`);
  records = dedupe(records);
  if (opts.since !== null) records = records.filter((r) => Date.parse(r.ts) >= opts.since);
  const report = build(records, opts.by);
  if (opts.json) console.log(JSON.stringify(report, null, 2));
  else print(report, opts.since);
} catch (e) {
  if (e instanceof UsageError) {
    console.error(`report: ${e.message}`);
    process.exit(1);
  }
  if (e instanceof GitHubError) {
    console.error(`report: ${e.message}`);
    process.exit(2);
  }
  throw e;
}
