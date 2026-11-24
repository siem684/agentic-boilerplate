#!/usr/bin/env node
// sync.mjs: bring this project's agentic layer (see layers.json) up to a template release.
// A human runs it and reviews the result as a normal PR; nothing runs it on a schedule.
//
//   node scripts/sync.mjs [--to <x.y.z>] [--apply] [--force] [--diff]
//                         [--from <dir>] [--base <dir>] [--root <dir>]
//
// Default is a dry-run: it prints what would change and writes nothing. --apply writes.
// Three trees are compared per path the agentic layer owns: the template at the version in
// boilerplate.lock ("old"), the template at the target ("new") and this project. A file the
// project changed that the template also changed is a conflict: it is reported and skipped
// (--force takes the template's version). Files that exist only in the project are never touched.
//
// The target is the latest GitHub Release of `repo` in boilerplate.lock, or --to. --from <dir>
// uses a local template checkout as the new tree (its template.json gives the version) and
// --base <dir> a local tree as the old tree; each replaces the matching release tarball.
//
// Exit code: 0 nothing to do (or applied cleanly), 1 changes pending in a dry-run or conflicts
// remain, 2 the run failed (network, bad lock, dirty paths, not a git repository).
// GitHub calls use GH_TOKEN, GITHUB_TOKEN or `gh auth token` when available; the token is
// sent to the GitHub API only. Tests point the API elsewhere with STALENESS_GITHUB_API.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, lstatSync, readdirSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { planSync } from "./sync-plan.mjs";
import { readTarball } from "./tar.mjs";

const GITHUB_API = process.env.STALENESS_GITHUB_API ?? "https://api.github.com";
const die = (message) => {
  console.error(`sync: ${message}`);
  process.exit(2);
};

// ---- arguments -------------------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
};
const option = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  if (value === undefined || value.startsWith("--")) die(`${name} needs a value`);
  args.splice(i, 2);
  return value;
};
const root = resolve(option("--root") ?? process.cwd());
const to = option("--to");
const fromDir = option("--from");
const baseDir = option("--base");
const apply = flag("--apply");
const force = flag("--force");
const showDiff = flag("--diff");
if (args.length) die(`unknown argument ${args[0]}. Usage: node scripts/sync.mjs [--to x.y.z] [--apply] [--force] [--diff] [--from dir] [--base dir] [--root dir]`);
if (fromDir && to) die("use --from or --to, not both");

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

async function get(url, accept) {
  const headers = { Accept: accept, "User-Agent": "agentic-boilerplate-sync" };
  if (githubToken()) headers.Authorization = `Bearer ${githubToken()}`;
  let res;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    throw new Error(`could not reach ${new URL(url).host} (${e.cause?.code ?? e.cause?.message ?? "network error"})`);
  }
  if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") {
    throw new Error("GitHub rate limit reached; set GH_TOKEN or run `gh auth login` to raise it");
  }
  if (!res.ok) throw new Error(`${new URL(url).host}${new URL(url).pathname} answered ${res.status}`);
  return res;
}

// ---- versions --------------------------------------------------------------------------

const parts = (v) => (String(v).match(/\d+/g) ?? []).map(Number);
const strip = (v) => String(v).replace(/^v/, "");
function compare(a, b) {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0) ? -1 : 1;
  }
  return 0;
}

// ---- trees -----------------------------------------------------------------------------

// A directory as a Map of forward-slash path -> bytes (regular files only).
function readDir(dir) {
  const files = new Map();
  const walk = (rel) => {
    for (const entry of readdirSync(join(dir, rel), { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) files.set(path, readFileSync(join(dir, path)));
    }
  };
  walk("");
  return files;
}

async function fetchTree(repo, version) {
  try {
    const res = await get(`${GITHUB_API}/repos/${repo}/tarball/v${version}`, "application/vnd.github+json");
    return readTarball(Buffer.from(await res.arrayBuffer()));
  } catch (e) {
    return die(`could not get template v${version}: ${e.message}`);
  }
}

function layersOf(tree, label) {
  const file = tree.get("layers.json");
  if (!file) die(`the template at ${label} has no layers.json`);
  try {
    return JSON.parse(file.toString("utf8")).layers ?? {};
  } catch (e) {
    return die(`layers.json of the template at ${label} is not valid JSON: ${e.message}`);
  }
}

// ---- inputs ----------------------------------------------------------------------------

const lockFile = join(root, "boilerplate.lock");
if (!existsSync(lockFile)) die("no boilerplate.lock, so the template version is unknown (written by scripts/init.mjs)");
let lock;
try {
  lock = JSON.parse(readFileSync(lockFile, "utf8"));
  if (!/^[\w.-]+\/[\w.-]+$/.test(lock.repo ?? "") || !parts(lock.based_on).length) throw new Error("needs based_on and repo (owner/name)");
} catch (e) {
  die(`boilerplate.lock is not usable: ${e.message}`);
}

let target;
if (fromDir) {
  try {
    target = strip(JSON.parse(readFileSync(join(fromDir, "template.json"), "utf8")).version);
  } catch (e) {
    die(`cannot read the version from ${fromDir}/template.json: ${e.message}`);
  }
} else if (to) {
  target = strip(to);
} else {
  try {
    target = strip((await (await get(`${GITHUB_API}/repos/${lock.repo}/releases/latest`, "application/json")).json()).tag_name);
  } catch (e) {
    die(`could not find the latest release of ${lock.repo}: ${e.message}`);
  }
}
if (!parts(target).length) die(`"${target}" is not a version`);
const order = compare(target, lock.based_on);
if (order === 0) {
  console.log(`already at ${lock.based_on}; nothing to sync`);
  process.exit(0);
}
if (order < 0) die(`${target} is older than the ${lock.based_on} this project is based on; refusing to go back`);

const oldTree = baseDir ? readDir(baseDir) : await fetchTree(lock.repo, lock.based_on);
const newTree = fromDir ? readDir(fromDir) : await fetchTree(lock.repo, target);
const oldLayers = layersOf(oldTree, `v${lock.based_on}`);
const newLayers = layersOf(newTree, `v${target}`);
// The project's bytes for a path, or null when it is absent. Names are matched exactly, so on
// a case-insensitive filesystem `scripts/tool.mjs` does not find `scripts/Tool.mjs`: a
// case-only rename in the template is then a delete plus an add, not a no-op.
const listings = new Map();
const entries = (dir) => {
  if (!listings.has(dir)) {
    try {
      listings.set(dir, new Set(readdirSync(dir)));
    } catch {
      listings.set(dir, new Set());
    }
  }
  return listings.get(dir);
};
const read = (path) => {
  let file = root;
  for (const segment of path.split("/")) {
    if (!entries(file).has(segment)) return null;
    file = join(file, segment);
  }
  return statSync(file).isFile() ? readFileSync(file) : null;
};
const plan = planSync({ oldTree, newTree, oldLayers, newLayers, read });
const applied = force ? plan : plan.filter((i) => !i.reason);

// Before anything is written: the project must be a git repository and every file we would
// write or delete (and boilerplate.lock) must be committed, so a bad run is one `git checkout` away.
if (apply) {
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  const inside = git("rev-parse", "--is-inside-work-tree");
  if (inside.status !== 0 || inside.stdout.trim() !== "true") die("this project is not a git repository (or git is not installed); sync --apply needs git so a bad run can be undone");
  const status = git("status", "--porcelain", "--", ...applied.map((i) => i.path), "boilerplate.lock");
  if (status.status !== 0) die(`git status failed: ${status.stderr.trim()}`);
  const dirty = status.stdout.split("\n").filter(Boolean).map((l) => l.slice(3));
  if (dirty.length) die(`uncommitted changes in files sync would write; commit or stash them first:\n  ${dirty.join("\n  ")}\nNothing was written.`);

  // Every target must be writable as planned: no symbolic link on the way (a write would land
  // outside the project), no directory where a file goes, no file where a directory goes.
  const problems = [];
  for (const { path } of applied) {
    const segments = path.split("/");
    let current = root;
    for (let i = 0; i < segments.length; i++) {
      current = join(current, segments[i]);
      let stat;
      try {
        stat = lstatSync(current);
      } catch {
        break; // nothing there yet, so nothing can be in the way
      }
      const here = segments.slice(0, i + 1).join("/");
      if (stat.isSymbolicLink()) problems.push(`${here} is a symbolic link; sync does not write through links`);
      else if (i < segments.length - 1 && !stat.isDirectory()) problems.push(`${here} is a file in your project, but the template needs a directory there`);
      else if (i === segments.length - 1 && stat.isDirectory()) problems.push(`${here} is a directory in your project, but the template has a file there`);
      else continue;
      break;
    }
  }
  if (problems.length) die(`cannot write these paths as planned:\n  ${problems.join("\n  ")}\nNothing was written.`);
}

// ---- report ----------------------------------------------------------------------------

console.log(`sync: ${lock.based_on} -> ${target} (${lock.repo})`);
const groups = [
  ["add", plan.filter((i) => !i.reason && i.action === "add")],
  ["update", plan.filter((i) => !i.reason && i.action === "update")],
  ["delete", plan.filter((i) => !i.reason && i.action === "delete")],
  ["conflict", plan.filter((i) => i.reason)],
];
for (const [name, items] of groups) {
  if (!items.length) continue;
  console.log(`\n${name} (${items.length})`);
  for (const i of items) console.log(`  ${i.path}${i.reason ? `  (${i.reason}${force ? `; --force: ${apply ? "" : "would "}${i.action}` : ""})` : ""}`);
}

if (showDiff) {
  for (const item of plan.filter((i) => i.action === "update" || i.reason)) {
    const dir = mkdtempSync(join(tmpdir(), "sync-diff-"));
    const sides = [["project", read(item.path)], ["template", newTree.get(item.path)]];
    for (const [side, bytes] of sides) {
      mkdirSync(dirname(join(dir, side, item.path)), { recursive: true });
      writeFileSync(join(dir, side, item.path), bytes ?? "");
    }
    const r = spawnSync("git", ["diff", "--no-index", "--no-color", "--no-prefix", "--", `project/${item.path}`, `template/${item.path}`], { cwd: dir, encoding: "utf8" });
    console.log(`\n${r.error ? `(git is needed for --diff: ${r.error.message})` : r.stdout.trimEnd()}`);
    rmSync(dir, { recursive: true, force: true });
  }
}

const counts = groups.map(([name, items]) => `${items.length} ${name}`).join(", ");
const notes = `release notes: https://github.com/${lock.repo}/releases/tag/v${target}`;
if (!apply) {
  if (!plan.length) console.log(`\nno files change; only boilerplate.lock would move to ${target}`);
  console.log(`\ndry-run: ${counts}. Nothing was written; run again with --apply to write.`);
  console.log(notes);
  process.exit(1);
}

// Everything is planned and checked; now write. Parent directories are created, files that
// were removed are deleted and directories left empty are pruned (never the project root).
const pruneEmpty = (dir) => {
  while (dir !== root && dir.startsWith(root) && readdirSync(dir).length === 0) {
    rmdirSync(dir);
    dir = dirname(dir);
  }
};
// Deletes first: on a case-insensitive filesystem a rename that only changes case would
// otherwise write the new name and then delete the file again.
for (const item of [...applied.filter((i) => i.action === "delete"), ...applied.filter((i) => i.action !== "delete")]) {
  const file = join(root, item.path);
  try {
    if (item.action === "delete") {
      rmSync(file, { force: true });
      pruneEmpty(dirname(file));
    } else {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, newTree.get(item.path));
    }
  } catch (e) {
    die(`failed while writing ${item.path}: ${e.message}\nSome files may have been written; review with \`git status\` and undo with \`git checkout\`.`);
  }
}
const remaining = plan.length - applied.length;
if (!remaining) {
  lock.based_on = target;
  writeFileSync(lockFile, JSON.stringify(lock, null, 2) + "\n");
}
console.log(`\napplied ${applied.length} of ${plan.length} change${plan.length === 1 ? "" : "s"}.`);
if (remaining) {
  console.log(`${remaining} conflict${remaining === 1 ? "" : "s"} left as they were, so boilerplate.lock still says ${lock.based_on}. Resolve them by hand, or run again with --force to take the template's version.`);
} else {
  console.log(`boilerplate.lock now says ${target}.`);
}
console.log(`next: review \`git diff\`, run this project's check, then open a pull request.\n${notes}`);
process.exit(remaining ? 1 : 0);
