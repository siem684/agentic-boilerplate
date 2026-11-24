import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LAYERS, makeTar, snapshot, writeTree } from "./helpers/fixtures.mjs";

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
