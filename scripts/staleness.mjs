#!/usr/bin/env node
// staleness.mjs: report which dependencies of this project are behind. Read-only, and it
// only runs when someone invokes it: nothing schedules it.
//
//   node scripts/staleness.mjs
//
// Checks, each reported on its own line:
//   template  boilerplate.lock against the latest GitHub Release, with the changelog
//             entries and the agentic-layer files that changed in between
//   vendored  the pins in vendor.json (npm, PyPI) against the registries
//   actions   the `# vX` comment next to each SHA-pinned action in .github/workflows
// Model IDs are not checked (there is no key-free way to ask).
//
// Exit code: 0 everything current, 1 something outdated, 2 a check failed (wins over 1).
// GitHub calls use GH_TOKEN, GITHUB_TOKEN or `gh auth token` when available (anonymous
// calls are limited to 60 an hour); the token is sent to the GitHub API only.
// Options: --root <dir> (default: current directory).
// Tests point the services elsewhere: STALENESS_GITHUB_API, STALENESS_NPM_REGISTRY, STALENESS_PYPI.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadLayers, owns } from "./layers.mjs";

const args = process.argv.slice(2);
const ri = args.indexOf("--root");
const root = resolve(ri === -1 ? process.cwd() : args.splice(ri, 2)[1]);
const GITHUB_API = process.env.STALENESS_GITHUB_API ?? "https://api.github.com";
const NPM = process.env.STALENESS_NPM_REGISTRY ?? "https://registry.npmjs.org";
const PYPI = process.env.STALENESS_PYPI ?? "https://pypi.org";
const GITHUB = "https://github.com";

// ---- network ---------------------------------------------------------------------------

let cachedToken;
function githubToken() {
  if (cachedToken === undefined) {
    cachedToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || null;
    if (!cachedToken) {
      const r = spawnSync("gh", ["auth", "token"], { encoding: "utf8" });
      cachedToken = r.status === 0 && r.stdout.trim() ? r.stdout.trim() : null;
    }
  }
  return cachedToken;
}

async function get(url, { github = false, accept = "application/json" } = {}) {
  const headers = { Accept: accept, "User-Agent": "agentic-boilerplate-staleness" };
  if (github && githubToken()) headers.Authorization = `Bearer ${githubToken()}`;
  let res;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    const host = new URL(url).host;
    throw new Error(`could not reach ${host} (${e.cause?.code ?? e.cause?.message ?? "network error"})`);
  }
  if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") {
    throw new Error("GitHub rate limit reached; set GH_TOKEN or run `gh auth login` to raise it");
  }
  if (!res.ok) throw new Error(`${new URL(url).host}${new URL(url).pathname} answered ${res.status}`);
  return res;
}
const getJson = async (url, opts) => (await get(url, opts)).json();
const getText = async (url, opts) => (await get(url, opts)).text();
const latestRelease = async (repo) => (await getJson(`${GITHUB_API}/repos/${repo}/releases/latest`, { github: true })).tag_name;

// ---- versions --------------------------------------------------------------------------

const parts = (v) => (String(v).match(/\d+/g) ?? []).map(Number);
// Compare as many components as `current` has, so a pin of "v5" is current for "v5.0.1".
function isBehind(current, latest) {
  const c = parts(current);
  const l = parts(latest);
  for (let i = 0; i < c.length; i++) {
    if ((l[i] ?? 0) !== c[i]) return (l[i] ?? 0) > c[i];
  }
  return false;
}
const strip = (v) => String(v).replace(/^v/, "");

// ---- results ---------------------------------------------------------------------------

const outdated = (name, current, latest, details = []) => ({ name, kind: "outdated", current, latest, details });
const upToDate = (name, current) => ({ name, kind: "current", current });
const failed = (name, e) => ({ name, kind: "error", text: `could not check: ${e.message ?? e}` });
const note = (name, text) => ({ name, kind: "note", text });

// ---- template --------------------------------------------------------------------------

function changelogEntries(changelog, from, to) {
  const lines = changelog.split(/\r?\n/);
  const entries = [];
  let cur = null;
  for (const line of lines) {
    const h = line.match(/^##\s+\[?v?(\d+\.\d+\.\d+\S*?)\]?(?:\s+-\s+(\S+))?\s*$/);
    if (/^##\s/.test(line)) {
      cur = h && isBehind(from, h[1]) && !isBehind(to, h[1]) ? { version: h[1], date: h[2], body: [] } : null;
      if (cur) entries.push(cur);
    } else if (cur) {
      cur.body.push(line.replace(/\*\*/g, ""));
    }
  }
  return entries;
}

async function checkTemplate() {
  const lockFile = join(root, "boilerplate.lock");
  if (!existsSync(lockFile)) {
    return existsSync(join(root, "template.json"))
      ? note("template", "this is the template itself; nothing to compare")
      : note("template", "no boilerplate.lock, so the template version is unknown (written by scripts/init.mjs)");
  }
  let lock;
  try {
    lock = JSON.parse(readFileSync(lockFile, "utf8"));
    if (!/^[\w.-]+\/[\w.-]+$/.test(lock.repo ?? "") || !parts(lock.based_on).length) throw new Error("needs based_on and repo (owner/name)");
  } catch (e) {
    return failed("template", new Error(`boilerplate.lock is not usable: ${e.message}`));
  }
  try {
    const tag = await latestRelease(lock.repo);
    if (!isBehind(lock.based_on, tag)) return upToDate("template", lock.based_on);
    const details = [];
    try {
      const changelog = await getText(`${GITHUB_API}/repos/${lock.repo}/contents/CHANGELOG.md?ref=${tag}`, {
        github: true,
        accept: "application/vnd.github.raw",
      });
      details.push("changes since your version:");
      for (const e of changelogEntries(changelog, lock.based_on, tag)) {
        details.push(`  ${e.version}${e.date ? ` (${e.date})` : ""}`);
        for (const l of e.body.join("\n").trim().split("\n")) details.push(`    ${l}`.trimEnd());
      }
    } catch (e) {
      details.push(`changelog unavailable: ${e.message}`);
    }
    try {
      const { files = [] } = await getJson(`${GITHUB_API}/repos/${lock.repo}/compare/v${lock.based_on}...${tag}`, { github: true });
      const layers = loadLayers(root);
      const names = files.map((f) => f.filename);
      const mine = layers?.agentic ? names.filter((n) => owns(layers.agentic, n)) : names;
      details.push(layers?.agentic ? `agentic-layer files changed (${mine.length}):` : `all changed files (layers.json not found) (${mine.length}):`);
      for (const n of mine) details.push(`  ${n}`);
      if (files.length >= 300) details.push("  (GitHub lists at most 300 files; there may be more)");
    } catch (e) {
      details.push(`file list unavailable: ${e.message}`);
    }
    details.push(`full diff: ${GITHUB}/${lock.repo}/compare/v${lock.based_on}...${tag}`);
    return outdated("template", lock.based_on, strip(tag), details);
  } catch (e) {
    return failed("template", e);
  }
}

// ---- vendored components ---------------------------------------------------------------

async function checkVendored() {
  const file = join(root, "vendor.json");
  if (!existsSync(file)) return [note("vendored", "no vendor.json")];
  const { components = {} } = JSON.parse(readFileSync(file, "utf8"));
  return Promise.all(
    Object.entries(components).map(async ([name, c]) => {
      const { type, package: pkg, repo } = c.source ?? {};
      try {
        let latest;
        let link;
        if (type === "npm") {
          latest = (await getJson(`${NPM}/${encodeURIComponent(pkg).replace("%40", "@")}/latest`)).version;
          link = `https://www.npmjs.com/package/${pkg}?activeTab=versions`;
        } else if (type === "pypi") {
          latest = (await getJson(`${PYPI}/pypi/${pkg}/json`)).info.version;
          link = `https://pypi.org/project/${pkg}/#history`;
        } else {
          return note(name, `source type "${type}" is not supported by this check`);
        }
        if (repo) link = `${repo.replace(/(\.git)?\/?$/, "")}/releases`;
        if (!isBehind(c.version, latest)) return upToDate(name, c.version);
        return outdated(name, c.version, latest, [`changes: ${link}`, "to upgrade: see docs/agentic/vendoring.md"]);
      } catch (e) {
        return failed(name, e);
      }
    })
  );
}

// ---- GitHub Actions --------------------------------------------------------------------

async function checkActions() {
  const dir = join(root, ".github/workflows");
  if (!existsSync(dir)) return [];
  const found = new Map(); // repo -> { ref, comment }
  const USES = /^\s*(?:-\s*)?uses:\s*([A-Za-z0-9][\w.-]*\/[\w.-]+)(?:\/[^@\s]*)?@([^\s#]+)(?:\s+#\s*(\S+))?/;
  for (const f of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))) {
    for (const line of readFileSync(join(dir, f), "utf8").split(/\r?\n/)) {
      const m = line.match(USES);
      if (!m) continue;
      const [, repo, ref, comment] = m;
      if (!found.has(repo) || (comment && !found.get(repo).comment)) found.set(repo, { ref, comment });
    }
  }
  return Promise.all(
    [...found].map(async ([repo, { ref, comment }]) => {
      const pinnedBySha = /^[0-9a-f]{40}$/i.test(ref);
      const current = pinnedBySha ? comment : ref;
      if (!current) return note(repo, "pinned by SHA with no version comment, so it cannot be compared (add `# v1` after the SHA)");
      try {
        const tag = await latestRelease(repo);
        return isBehind(current, tag) ? outdated(repo, current, tag, [`changes: ${GITHUB}/${repo}/releases`]) : upToDate(repo, current);
      } catch (e) {
        return failed(repo, e);
      }
    })
  );
}

// ---- report ----------------------------------------------------------------------------

const [template, vendored, actions] = await Promise.all([checkTemplate(), checkVendored(), checkActions()]);
const sections = [
  ["Template", [template]],
  ["Vendored components", vendored],
  ["GitHub Actions", actions],
  ["Not checked", [note("models", "no key-free way to ask. Revisit the model IDs in the agent files and workflows now and then (ADR 0002).")]],
].filter(([, rows]) => rows.length);
const width = Math.max(...sections.flatMap(([, rows]) => rows.map((r) => r.name.length)));

for (const [title, rows] of sections) {
  console.log(`\n${title}`);
  for (const r of rows) {
    const name = r.name.padEnd(width);
    if (r.kind === "outdated") console.log(`  ${name}  ${r.current} -> ${r.latest}  OUTDATED`);
    else if (r.kind === "current") console.log(`  ${name}  ${r.current}  up to date`);
    else console.log(`  ${name}  ${r.text}`);
    for (const d of r.details ?? []) console.log(`  ${" ".repeat(width)}  ${d}`);
  }
}

const results = sections.flatMap(([, rows]) => rows);
const nOutdated = results.filter((r) => r.kind === "outdated").length;
const nFailed = results.filter((r) => r.kind === "error").length;
console.log(
  nOutdated || nFailed
    ? `\n${nOutdated} outdated, ${nFailed} could not be checked. Nothing was changed; upgrades are done by hand.`
    : "\nEverything is up to date."
);
process.exit(nFailed ? 2 : nOutdated ? 1 : 0);
