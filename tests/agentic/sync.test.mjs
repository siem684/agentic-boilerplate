import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LAYERS, gitCommitAll, gitInit, makeTar, snapshot, writeTree } from "./helpers/fixtures.mjs";

const SCRIPT = fileURLToPath(new URL("../../scripts/sync.mjs", import.meta.url));
const execFileP = promisify(execFile);

// A stub of the GitHub API. Requests are recorded; tarballs are served from `routes`.
let server;
let base;
let routes;
let seen;
before(async () => {
  server = http.createServer((req, res) => {
    const path = new URL(req.url, "http://x").pathname;
    seen.push({ path, auth: req.headers.authorization });
    const r = routes[path];
    if (!r) return void res.writeHead(404).end("not found");
    res.writeHead(r.status ?? 200, { "content-type": r.type ?? "application/json" }).end(r.body);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

// Async on purpose: the stub server lives in this process and must keep answering.
async function runSync(args, { env = {} } = {}) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(GH|GITHUB)_TOKEN$/.test(k)));
  try {
    const r = await execFileP(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env: { ...clean, STALENESS_GITHUB_API: `${base}/gh`, ...env } });
    return { code: 0, stdout: r.stdout, stderr: r.stderr };
  } catch (e) {
    return { code: e.code, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

const tmp = () => mkdtempSync(join(tmpdir(), "sync-test-"));
const LOCK = { based_on: "0.1.0", repo: "acme/tpl" };
function makeProject(files = {}, lock = LOCK) {
  const root = tmp();
  if (lock) writeFileSync(join(root, "boilerplate.lock"), JSON.stringify(lock, null, 2) + "\n");
  writeTree(root, files);
  return root;
}
function makeTemplate(version, files) {
  const dir = tmp();
  writeTree(dir, { "template.json": JSON.stringify({ version, repo: "acme/tpl" }), "layers.json": LAYERS, ...files });
  return dir;
}
const tarOf = (files) => makeTar(Object.entries({ "layers.json": LAYERS, ...files }).map(([name, data]) => ({ name: `acme-tpl-abc123/${name}`, data })));

// v0.1.0 -> v0.2.0: one file each of add, update, delete and conflict, and one unchanged.
const BASE = { "scripts/keep.mjs": "k\n", "scripts/edit.mjs": "e1\n", "scripts/gone.mjs": "g\n", "scripts/conf.mjs": "c1\n" };
const NEXT = { "scripts/keep.mjs": "k\n", "scripts/edit.mjs": "e2\n", "scripts/conf.mjs": "c2\n", "scripts/new.mjs": "n\n" };
const PROJECT = { ...BASE, "scripts/conf.mjs": "mine\n" };

function setup() {
  const root = makeProject(PROJECT);
  return { root, from: makeTemplate("0.2.0", NEXT), baseDir: makeTemplate("0.1.0", BASE) };
}
const block = (out, name) => out.split("\n\n").find((b) => b.startsWith(`${name} (`)) ?? "";

test("no boilerplate.lock: exit 2 and the message points at init.mjs", async () => {
  const root = makeProject({}, null);
  const r = await runSync(["--root", root, "--from", makeTemplate("0.2.0", {})]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /init\.mjs/);
});

test("dry-run lists add, update, delete and conflict groups and exits 1", async () => {
  const { root, from, baseDir } = setup();
  const r = await runSync(["--root", root, "--from", from, "--base", baseDir]);
  assert.equal(r.code, 1, r.stderr);
  assert.match(block(r.stdout, "add"), /scripts\/new\.mjs/);
  assert.match(block(r.stdout, "update"), /scripts\/edit\.mjs/);
  assert.match(block(r.stdout, "delete"), /scripts\/gone\.mjs/);
  assert.match(block(r.stdout, "conflict"), /scripts\/conf\.mjs.*edited locally/);
  assert.doesNotMatch(r.stdout, /keep\.mjs/);
  assert.match(r.stdout, /0\.1\.0 -> 0\.2\.0/);
  assert.match(r.stdout, /dry-run/);
  assert.match(r.stdout, /https:\/\/github\.com\/acme\/tpl\/releases\/tag\/v0\.2\.0/);
});

test("dry-run writes nothing", async () => {
  const { root, from, baseDir } = setup();
  const before = snapshot(root);
  await runSync(["--root", root, "--from", from, "--base", baseDir]);
  assert.deepEqual(snapshot(root), before);
});

test("files outside the agentic layer are never listed", async () => {
  const root = makeProject({});
  const from = makeTemplate("0.2.0", { "src/app.js": "x", "CLAUDE.md": "x", "scripts/release.mjs": "x", "scripts/ok.mjs": "x" });
  const r = await runSync(["--root", root, "--from", from, "--base", makeTemplate("0.1.0", {})]);
  assert.match(r.stdout, /scripts\/ok\.mjs/);
  for (const p of ["src/app.js", "CLAUDE.md", "release.mjs", "template.json"]) assert.ok(!r.stdout.includes(p), `${p} must not be listed`);
});

test("already at the target version: exit 0", async () => {
  const root = makeProject({}, { ...LOCK, based_on: "0.2.0" });
  const r = await runSync(["--root", root, "--from", makeTemplate("0.2.0", {})]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /already at 0\.2\.0/);
});

test("a target older than based_on is refused with exit 2", async () => {
  const root = makeProject({}, { ...LOCK, based_on: "0.2.0" });
  const r = await runSync(["--root", root, "--from", makeTemplate("0.1.0", {})]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /older/);
});

test("--diff prints a unified diff for an update", async () => {
  const { root, from, baseDir } = setup();
  const r = await runSync(["--root", root, "--from", from, "--base", baseDir, "--diff"]);
  assert.match(r.stdout, /@@/);
  assert.match(r.stdout, /^-e1$/m);
  assert.match(r.stdout, /^\+e2$/m);
});

test("--from without template.json: exit 2", async () => {
  const dir = tmp();
  const r = await runSync(["--root", makeProject({}), "--from", dir]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /template\.json/);
});

test("a template tree without layers.json: exit 2", async () => {
  const from = tmp();
  writeTree(from, { "template.json": JSON.stringify({ version: "0.2.0" }) });
  const r = await runSync(["--root", makeProject({}), "--from", from, "--base", makeTemplate("0.1.0", {})]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /layers\.json/);
});

test("--from together with --to is refused", async () => {
  const r = await runSync(["--root", makeProject({}), "--from", makeTemplate("0.2.0", {}), "--to", "0.2.0"]);
  assert.equal(r.code, 2);
});

// ---- release tarballs from the (stubbed) GitHub API ------------------------------------

function stubRelease() {
  seen = [];
  routes = {
    "/gh/repos/acme/tpl/releases/latest": { body: JSON.stringify({ tag_name: "v0.2.0" }) },
    "/gh/repos/acme/tpl/tarball/v0.1.0": { body: tarOf(BASE), type: "application/gzip" },
    "/gh/repos/acme/tpl/tarball/v0.2.0": { body: tarOf(NEXT), type: "application/gzip" },
  };
}

test("fetch: the default target is the latest release", async () => {
  stubRelease();
  const root = makeProject(PROJECT);
  const r = await runSync(["--root", root]);
  assert.equal(r.code, 1, r.stderr);
  assert.match(block(r.stdout, "add"), /scripts\/new\.mjs/);
  assert.match(block(r.stdout, "conflict"), /scripts\/conf\.mjs/);
  assert.match(r.stdout, /0\.1\.0 -> 0\.2\.0/);
});

test("fetch: --to skips the latest-release request", async () => {
  stubRelease();
  delete routes["/gh/repos/acme/tpl/releases/latest"];
  const r = await runSync(["--root", makeProject(PROJECT), "--to", "0.2.0"]);
  assert.equal(r.code, 1, r.stderr);
  assert.ok(!seen.some((s) => s.path.endsWith("/releases/latest")));
});

test("fetch: a 404 for the new tarball exits 2, names the tag and writes nothing", async () => {
  stubRelease();
  delete routes["/gh/repos/acme/tpl/tarball/v0.2.0"];
  const root = makeProject(PROJECT);
  const before = snapshot(root);
  const r = await runSync(["--root", root]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /v0\.2\.0/);
  assert.deepEqual(snapshot(root), before);
});

test("fetch: a 404 for the old tarball exits 2 and names the tag", async () => {
  stubRelease();
  delete routes["/gh/repos/acme/tpl/tarball/v0.1.0"];
  const r = await runSync(["--root", makeProject(PROJECT)]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /v0\.1\.0/);
});

test("fetch: GH_TOKEN is sent as a bearer token to the API", async () => {
  stubRelease();
  await runSync(["--root", makeProject(PROJECT)], { env: { GH_TOKEN: "tok123" } });
  assert.ok(seen.length >= 3);
  assert.ok(seen.every((s) => s.auth === "Bearer tok123"));
});

// ---- --apply and --force ---------------------------------------------------------------

// A committed project plus a template pair (old and new) built from the given file maps.
function scenario({ base = BASE, next = NEXT, project = base, git = true } = {}) {
  const root = makeProject(project);
  if (git) gitInit(root);
  return { root, from: makeTemplate("0.2.0", next), baseDir: makeTemplate("0.1.0", base) };
}
const sync = (s, ...extra) => runSync(["--root", s.root, "--from", s.from, "--base", s.baseDir, ...extra]);
const lockOf = (root) => JSON.parse(readFileSync(join(root, "boilerplate.lock"), "utf8"));
const content = (root, path) => readFileSync(join(root, path), "utf8");

test("apply: not a git repository exits 2 and writes nothing", async () => {
  const s = scenario({ git: false });
  const before = snapshot(s.root);
  const r = await sync(s, "--apply");
  assert.equal(r.code, 2);
  assert.match(r.stderr, /git/);
  assert.deepEqual(snapshot(s.root), before);
});

test("apply: an uncommitted file the plan would update blocks the run before any write", async () => {
  // edit.mjs equals the old version but is untracked, so git sees it as dirty.
  const { "scripts/edit.mjs": _untracked, ...tracked } = BASE;
  const s = scenario({ project: tracked });
  writeTree(s.root, { "scripts/edit.mjs": BASE["scripts/edit.mjs"] });
  const before = snapshot(s.root);
  const r = await sync(s, "--apply");
  assert.equal(r.code, 2);
  assert.match(r.stderr, /scripts\/edit\.mjs/);
  assert.deepEqual(snapshot(s.root), before, "nothing, not even the clean files, may be written");
});

test("apply: an uncommitted boilerplate.lock blocks", async () => {
  const s = scenario();
  writeFileSync(join(s.root, "boilerplate.lock"), JSON.stringify(LOCK) + "\n\n");
  const r = await sync(s, "--apply");
  assert.equal(r.code, 2);
  assert.match(r.stderr, /boilerplate\.lock/);
});

test("apply: unrelated uncommitted files do not block", async () => {
  const s = scenario();
  writeTree(s.root, { "scripts/keep.mjs": "dirty but not in the plan\n", "notes.txt": "x" });
  const r = await sync(s, "--apply");
  assert.equal(r.code, 0, r.stderr);
  assert.equal(content(s.root, "scripts/new.mjs"), "n\n");
  assert.equal(content(s.root, "scripts/keep.mjs"), "dirty but not in the plan\n");
});

test("apply: a clean run writes adds and updates, deletes, prunes emptied directories and moves the lock", async () => {
  const base = { ...BASE, "scripts/old/deep/x.mjs": "x\n" };
  const s = scenario({ base });
  const r = await sync(s, "--apply");
  assert.equal(r.code, 0, r.stderr);
  assert.equal(content(s.root, "scripts/new.mjs"), "n\n");
  assert.equal(content(s.root, "scripts/edit.mjs"), "e2\n");
  assert.equal(content(s.root, "scripts/conf.mjs"), "c2\n");
  assert.equal(content(s.root, "scripts/keep.mjs"), "k\n");
  assert.ok(!existsSync(join(s.root, "scripts/gone.mjs")));
  assert.ok(!existsSync(join(s.root, "scripts/old")), "the emptied directories are pruned");
  assert.ok(existsSync(join(s.root, "scripts")));
  assert.deepEqual(lockOf(s.root), { based_on: "0.2.0", repo: "acme/tpl" });
  assert.match(r.stdout, /pull request|PR/i);
});

test("apply: conflicts are kept, clean changes are applied, the lock stays behind and the exit is 1", async () => {
  const s = scenario({ project: PROJECT });
  const r = await sync(s, "--apply");
  assert.equal(r.code, 1, r.stderr);
  assert.equal(content(s.root, "scripts/conf.mjs"), "mine\n");
  assert.equal(content(s.root, "scripts/new.mjs"), "n\n");
  assert.equal(content(s.root, "scripts/edit.mjs"), "e2\n");
  assert.equal(lockOf(s.root).based_on, "0.1.0");
});

test("apply --force: takes the template's version for every kind of conflict and moves the lock", async () => {
  const base = { ...BASE, "scripts/del.mjs": "d1\n", "scripts/rem.mjs": "r1\n" };
  const next = { ...NEXT, "scripts/del.mjs": "d2\n" };
  const { "scripts/del.mjs": _deleted, ...rest } = { ...base, "scripts/conf.mjs": "mine\n", "scripts/rem.mjs": "mine\n" };
  const s = scenario({ base, next, project: rest });
  const r = await sync(s, "--apply", "--force");
  assert.equal(r.code, 0, r.stderr);
  assert.equal(content(s.root, "scripts/conf.mjs"), "c2\n");
  assert.equal(content(s.root, "scripts/del.mjs"), "d2\n");
  assert.ok(!existsSync(join(s.root, "scripts/rem.mjs")));
  assert.equal(lockOf(s.root).based_on, "0.2.0");
});

test("apply: a CRLF-converted file is a conflict and is kept; --force replaces it", async () => {
  const base = { "scripts/crlf.mjs": "a\nb\n" };
  const next = { "scripts/crlf.mjs": "a\nc\n" };
  const s = scenario({ base, next, project: { "scripts/crlf.mjs": "a\r\nb\r\n" } });
  const kept = await sync(s, "--apply");
  assert.equal(kept.code, 1);
  assert.equal(content(s.root, "scripts/crlf.mjs"), "a\r\nb\r\n");
  const forced = await sync(s, "--apply", "--force");
  assert.equal(forced.code, 0, forced.stderr);
  assert.equal(content(s.root, "scripts/crlf.mjs"), "a\nc\n");
});

test("apply: files only the project has are untouched, also with --force", async () => {
  const own = { "scripts/mine.mjs": "mine\n", "tests/mine.test.mjs": "t\n", "src/app.js": "a\n" };
  const s = scenario({ project: { ...PROJECT, ...own } });
  const r = await sync(s, "--apply", "--force");
  assert.equal(r.code, 0, r.stderr);
  for (const [path, text] of Object.entries(own)) assert.equal(content(s.root, path), text);
});

test("apply: running it again after committing is a no-op", async () => {
  const s = scenario();
  assert.equal((await sync(s, "--apply")).code, 0);
  gitCommitAll(s.root);
  const again = await sync(s, "--apply");
  assert.equal(again.code, 0, again.stderr);
  assert.match(again.stdout, /already at 0\.2\.0/);
});

test("apply: a newer version with no file changes only moves the lock", async () => {
  const s = scenario({ base: BASE, next: BASE });
  const r = await sync(s, "--apply");
  assert.equal(r.code, 0, r.stderr);
  assert.equal(lockOf(s.root).based_on, "0.2.0");
});

test("dry-run never moves the lock, even for a newer version with no file changes", async () => {
  const s = scenario({ base: BASE, next: BASE });
  const r = await sync(s);
  assert.equal(r.code, 1);
  assert.equal(lockOf(s.root).based_on, "0.1.0");
});

// ---- review fixes: case-only renames, type clashes, symlinks, empty plans ---------------

test("apply: a case-only rename in the template ends with the new name, not with the file deleted", async () => {
  const s = scenario({ base: { "scripts/Tool.mjs": "t\n" }, next: { "scripts/tool.mjs": "t\n" } });
  const r = await sync(s, "--apply");
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(readdirSync(join(s.root, "scripts")), ["tool.mjs"]);
  assert.equal(content(s.root, "scripts/tool.mjs"), "t\n");
});

test("apply: a directory where the template has a file stops the run before any write", async () => {
  const s = scenario({
    base: { "scripts/keep.mjs": "k\n" },
    next: { "scripts/keep.mjs": "k\n", "scripts/a.mjs": "a\n", "scripts/b.mjs": "b\n" },
    project: { "scripts/keep.mjs": "k\n", "scripts/b.mjs/inner.txt": "x\n" },
  });
  const before = snapshot(s.root);
  const r = await sync(s, "--apply");
  assert.equal(r.code, 2);
  assert.match(r.stderr, /scripts\/b\.mjs/);
  assert.deepEqual(snapshot(s.root), before, "scripts/a.mjs must not have been written");
});

test("apply: a file where the template needs a directory stops the run before any write", async () => {
  const s = scenario({
    base: { "scripts/keep.mjs": "k\n" },
    next: { "scripts/keep.mjs": "k\n", "scripts/a.mjs": "a\n", "scripts/lib/x.mjs": "x\n" },
    project: { "scripts/keep.mjs": "k\n", "scripts/lib": "a file\n" },
  });
  const before = snapshot(s.root);
  const r = await sync(s, "--apply");
  assert.equal(r.code, 2);
  assert.match(r.stderr, /scripts\/lib/);
  assert.deepEqual(snapshot(s.root), before);
});

// Creating symlinks needs a privilege on some Windows setups; the tests skip when it is missing.
function trySymlink(t, target, path, type) {
  try {
    symlinkSync(target, path, type);
    return true;
  } catch (e) {
    t.skip(`cannot create symlinks here: ${e.code}`);
    return false;
  }
}

test("apply: a symlinked file in the project is never written through", async (t) => {
  const outside = makeProject({ "x.mjs": "e1\n" }, null);
  const { "scripts/edit.mjs": _link, ...rest } = BASE;
  const root = makeProject(rest);
  if (!trySymlink(t, join(outside, "x.mjs"), join(root, "scripts/edit.mjs"))) return;
  gitInit(root);
  const r = await runSync(["--root", root, "--from", makeTemplate("0.2.0", NEXT), "--base", makeTemplate("0.1.0", BASE), "--apply"]);
  assert.equal(r.code, 2, r.stdout);
  assert.match(r.stderr, /symbolic link/);
  assert.equal(content(outside, "x.mjs"), "e1\n");
});

test("apply: a symlinked parent directory in the project is never written through", async (t) => {
  const outside = makeProject({}, null);
  const root = makeProject({ "scripts/keep.mjs": "k\n" });
  mkdirSync(join(root, "tests"), { recursive: true });
  if (!trySymlink(t, outside, join(root, "tests/agentic"), "junction")) return;
  gitInit(root);
  const from = makeTemplate("0.2.0", { "scripts/keep.mjs": "k\n", "tests/agentic/new.test.mjs": "t\n" });
  const r = await runSync(["--root", root, "--from", from, "--base", makeTemplate("0.1.0", { "scripts/keep.mjs": "k\n" }), "--apply"]);
  assert.equal(r.code, 2, r.stdout);
  assert.deepEqual(readdirSync(outside), ["boilerplate.lock"].filter((f) => existsSync(join(outside, f))), "nothing may land in the linked directory");
});

test("dry-run with a newer version and no file changes says that only boilerplate.lock would move", async () => {
  const s = scenario({ base: BASE, next: BASE });
  const r = await sync(s);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /only boilerplate\.lock/);
});

test("apply: a failed fetch stops before the git check and any write", async () => {
  stubRelease();
  delete routes["/gh/repos/acme/tpl/tarball/v0.2.0"];
  const root = makeProject(PROJECT);
  gitInit(root);
  const before = snapshot(root);
  const r = await runSync(["--root", root, "--apply"]);
  assert.equal(r.code, 2);
  assert.deepEqual(snapshot(root), before);
});

test("an unreachable GitHub exits 2 with a message about the host", async () => {
  const r = await runSync(["--root", makeProject(PROJECT), "--to", "0.2.0"], { env: { STALENESS_GITHUB_API: "http://127.0.0.1:9/gh" } });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /127\.0\.0\.1/);
});
