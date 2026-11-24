import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

const SCRIPT = fileURLToPath(new URL("../../scripts/report.mjs", import.meta.url));
const execFileP = promisify(execFile);

// ---- fixtures --------------------------------------------------------------------------

// A record as scripts/telemetry.mjs writes it (every field).
const rec = (o) => ({
  ts: "2026-11-02T10:00:00.000Z",
  job: "review:m1",
  run_id: "1",
  ref: "feat/x",
  cost_usd: 0,
  turns: 0,
  duration_ms: 1000,
  input_tokens: 0,
  output_tokens: 0,
  cache_read_tokens: 0,
  cache_creation_tokens: 0,
  cache_hit_ratio: 0,
  cost_by_model: {},
  tool_calls: {},
  is_error: false,
  ...o,
});

// Two reviews in the week of Monday 2026-11-02 and one failed dev run in the week of 2026-11-09.
const R1 = rec({ run_id: "1", cost_usd: 0.1, turns: 5, input_tokens: 1000, output_tokens: 200, cache_read_tokens: 3000, cache_creation_tokens: 1000, cost_by_model: { m1: 0.1 } });
const R2 = rec({ run_id: "2", ts: "2026-11-04T10:00:00.000Z", cost_usd: 0.3, turns: 7, input_tokens: 2000, output_tokens: 400, cache_read_tokens: 1000, cache_creation_tokens: 1000, cost_by_model: { m1: 0.3 } });
const D1 = rec({ run_id: "3", ts: "2026-11-10T10:00:00.000Z", job: "dev:m2", cost_usd: 1, turns: 20, input_tokens: 500, output_tokens: 100, cache_creation_tokens: 500, cost_by_model: { m2: 0.8, m3: 0.2 }, is_error: true });
const lines = (...records) => records.map((r) => JSON.stringify(r)).join("\n") + "\n";

const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 1e-6, `${what}: ${actual} vs ${expected}`);

function dir(files = {}) {
  const d = mkdtempSync(join(tmpdir(), "report-test-"));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(d, name, ".."), { recursive: true });
    writeFileSync(join(d, name), content);
  }
  return d;
}

async function run(args, { cwd, env = {} } = {}) {
  try {
    const r = await execFileP(process.execPath, [SCRIPT, ...args], { cwd, env: { ...process.env, ...env }, encoding: "utf8" });
    return { status: 0, out: r.stdout, err: r.stderr };
  } catch (e) {
    return { status: e.code, out: e.stdout, err: e.stderr };
  }
}
const runJson = async (args, opts) => {
  const r = await run([...args, "--json"], opts);
  assert.equal(r.status, 0, r.err);
  return JSON.parse(r.out);
};

// ---- local files -----------------------------------------------------------------------

test("sums cost, turns and tokens per job and in total", async () => {
  const cwd = dir({ "telemetry.jsonl": lines(R1, R2, D1) });
  const r = await runJson([], { cwd });
  assert.equal(r.records, 3);
  const review = r.groups.find((g) => g.key === "review:m1");
  assert.equal(review.runs, 2);
  near(review.cost_usd, 0.4, "review cost");
  near(review.avg_cost_usd, 0.2, "review avg");
  near(review.max_cost_usd, 0.3, "review max");
  assert.equal(review.turns, 12);
  assert.equal(review.input_tokens, 3000);
  assert.equal(review.output_tokens, 600);
  assert.equal(review.errors, 0);
  const dev = r.groups.find((g) => g.key === "dev:m2");
  assert.equal(dev.errors, 1);
  assert.equal(r.total.runs, 3);
  near(r.total.cost_usd, 1.4, "total cost");
  assert.equal(r.total.turns, 32);
  assert.equal(r.total.errors, 1);
});

test("the biggest spender comes first", async () => {
  const cwd = dir({ "telemetry.jsonl": lines(R1, R2, D1) });
  const r = await runJson([], { cwd });
  assert.deepEqual(r.groups.map((g) => g.key), ["dev:m2", "review:m1"]);
});

test("cache hit ratio is weighted by tokens, not averaged per run", async () => {
  // R1 hits 3000 of 5000 (0.6), R2 hits 1000 of 4000 (0.25). Together 4000 of 9000.
  const cwd = dir({ "telemetry.jsonl": lines(R1, R2) });
  const r = await runJson([], { cwd });
  assert.ok(Math.abs(r.groups[0].cache_hit_ratio - 4000 / 9000) < 0.001, `got ${r.groups[0].cache_hit_ratio}`);
});

test("cost per model is summed over all runs", async () => {
  const cwd = dir({ "telemetry.jsonl": lines(R1, R2, D1) });
  const r = await runJson([], { cwd });
  assert.deepEqual(Object.keys(r.cost_by_model).sort(), ["m1", "m2", "m3"]);
  near(r.cost_by_model.m1, 0.4, "m1");
  near(r.cost_by_model.m2, 0.8, "m2");
  near(r.cost_by_model.m3, 0.2, "m3");
});

test("--by week groups by the Monday of the week, oldest first", async () => {
  const cwd = dir({ "telemetry.jsonl": lines(D1, R2, R1) });
  const r = await runJson(["--by", "week"], { cwd });
  assert.deepEqual(r.groups.map((g) => g.key), ["2026-11-02", "2026-11-09"]);
  assert.equal(r.groups[0].runs, 2);
  near(r.groups[0].cost_usd, 0.4, "first week");
  near(r.groups[1].cost_usd, 1, "second week");
});

test("the same run read twice is counted once", async () => {
  const cwd = dir({ "telemetry.jsonl": lines(R1, R1), "other/telemetry.jsonl": lines(R1, R2) });
  const r = await runJson(["--from", "telemetry.jsonl", "--from", "other"], { cwd });
  assert.equal(r.records, 2);
  near(r.total.cost_usd, 0.4, "total");
});

test("manual runs without a run id are not mistaken for each other", async () => {
  const a = rec({ run_id: undefined, cost_usd: 1, ts: "2026-11-02T10:00:00.000Z" });
  const b = rec({ run_id: undefined, cost_usd: 1, ts: "2026-11-02T10:05:00.000Z" });
  const cwd = dir({ "telemetry.jsonl": lines(a, b) });
  const r = await runJson([], { cwd });
  assert.equal(r.records, 2);
});

test("--since drops older records: a date, and a number of days", async () => {
  const cwd = dir({ "telemetry.jsonl": lines(R1, R2, D1) });
  assert.equal((await runJson(["--since", "2026-11-04"], { cwd })).records, 2);
  const recent = rec({ run_id: "9", ts: new Date(Date.now() - 2 * 86_400_000).toISOString(), cost_usd: 2 });
  const cwd2 = dir({ "telemetry.jsonl": lines(R1, recent) });
  const r = await runJson(["--since", "7d"], { cwd: cwd2 });
  assert.equal(r.records, 1);
  near(r.total.cost_usd, 2, "only the recent run");
});

test("--from reads a directory, including nested telemetry.jsonl files", async () => {
  const cwd = dir({ "dl/telemetry-claude-1/telemetry.jsonl": lines(R1), "dl/telemetry-review-2/telemetry.jsonl": lines(R2), "dl/notes.txt": "ignore me" });
  const r = await runJson(["--from", "dl"], { cwd });
  assert.equal(r.records, 2);
});

test("a malformed line is skipped with a warning and the rest is reported", async () => {
  const cwd = dir({ "telemetry.jsonl": lines(R1) + '{"ts":"2026-11-0\n' + lines(R2) });
  const r = await run(["--json"], { cwd });
  assert.equal(r.status, 0, r.err);
  assert.equal(JSON.parse(r.out).records, 2);
  assert.match(r.err, /skipped 1 line/);
});

test("the text report names each job, the total and each model", async () => {
  const cwd = dir({ "telemetry.jsonl": lines(R1, R2, D1) });
  const r = await run([], { cwd });
  assert.equal(r.status, 0, r.err);
  for (const s of ["review:m1", "dev:m2", "Total", "m1", "m2", "m3", "1.4000"]) assert.ok(r.out.includes(s), `missing ${s} in:\n${r.out}`);
});

test("no data is an empty report, not a failure", async () => {
  const cwd = dir({ "telemetry.jsonl": lines(R1) });
  const r = await run(["--since", "2027-01-01"], { cwd });
  assert.equal(r.status, 0, r.err);
  assert.match(r.out, /No telemetry records/);
});

// ---- bad input -------------------------------------------------------------------------

test("without a source and without ./telemetry.jsonl it explains what to pass", async () => {
  const r = await run([], { cwd: dir() });
  assert.equal(r.status, 1);
  assert.match(r.err, /--from/);
  assert.match(r.err, /--github/);
});

test("--from with a path that does not exist exits 1", async () => {
  const r = await run(["--from", "nope.jsonl"], { cwd: dir() });
  assert.equal(r.status, 1);
  assert.match(r.err, /nope\.jsonl/);
});

test("invalid --since, --by and unknown flags exit 1 and name the problem", async () => {
  const cwd = dir({ "telemetry.jsonl": lines(R1) });
  for (const [args, pattern] of [
    [["--since", "last tuesday"], /--since/],
    [["--by", "colour"], /--by/],
    [["--bogus"], /--bogus/],
  ]) {
    const r = await run(args, { cwd });
    assert.equal(r.status, 1, args.join(" "));
    assert.match(r.err, pattern);
  }
});

// ---- GitHub artifacts ------------------------------------------------------------------

// A zip as upload-artifact makes it: entries are stored or deflated, with real CRCs.
function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, content, deflate] of entries) {
    const raw = Buffer.from(content);
    const data = deflate ? deflateRawSync(raw) : raw;
    const nameBuf = Buffer.from(name);
    const common = Buffer.alloc(26);
    common.writeUInt16LE(20, 0); // version needed
    common.writeUInt16LE(0, 2); // flags
    common.writeUInt16LE(deflate ? 8 : 0, 4); // method
    common.writeUInt32LE(crc32(raw), 10);
    common.writeUInt32LE(data.length, 14);
    common.writeUInt32LE(raw.length, 18);
    common.writeUInt16LE(nameBuf.length, 22);
    const local = Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), common, nameBuf, data]);
    const cd = Buffer.alloc(42);
    cd.writeUInt16LE(20, 0);
    common.copy(cd, 2, 0, 26);
    cd.writeUInt32LE(offset, 38);
    central.push(Buffer.concat([Buffer.from([0x50, 0x4b, 1, 2]), cd, nameBuf]));
    locals.push(local);
    offset += local.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdBuf, end]);
}

const art = (id, name, created, extra = {}) => ({ id, name, created_at: created, expired: false, workflow_run: { id: Number(id) }, ...extra });

let server;
let base;
let artifacts; // what the list endpoint serves, newest first
let zips; // artifact id -> Buffer
let seen; // { path, query, auth }

before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    seen.push({ path: url.pathname, page: url.searchParams.get("page"), auth: req.headers.authorization });
    const list = url.pathname === "/repos/acme/proj/actions/artifacts";
    if (list) {
      const per = Number(url.searchParams.get("per_page"));
      const page = Number(url.searchParams.get("page") ?? 1);
      const slice = artifacts.slice((page - 1) * per, page * per);
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ total_count: artifacts.length, artifacts: slice }));
      return;
    }
    const m = url.pathname.match(/^\/repos\/acme\/proj\/actions\/artifacts\/(\d+)\/zip$/);
    if (m && zips[m[1]]) {
      // The real API answers with a redirect to blob storage.
      res.writeHead(302, { location: `/blob/${m[1]}` }).end();
      return;
    }
    const b = url.pathname.match(/^\/blob\/(\d+)$/);
    if (b && zips[b[1]]) {
      res.writeHead(200, { "content-type": "application/zip" }).end(zips[b[1]]);
      return;
    }
    res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ message: "Not Found" }));
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

function stub({ list, files }) {
  artifacts = list;
  zips = files;
  seen = [];
}
const gh = (extra = {}) => ({ env: { REPORT_GITHUB_API: base, GH_TOKEN: "t0ken", ...extra } });

test("--github downloads the telemetry artifacts of the repository and reports them", async () => {
  stub({
    list: [art("3", "telemetry-claude-3", "2026-11-10T11:00:00Z"), art("2", "telemetry-review-2", "2026-11-04T11:00:00Z"), art("1", "telemetry-review-1", "2026-11-02T11:00:00Z")],
    files: {
      3: zip([["telemetry.jsonl", lines(D1), true], ["claude-execution-output.json", "[]", false]]),
      2: zip([["telemetry.jsonl", lines(R2), false]]),
      1: zip([["work/repo/telemetry.jsonl", lines(R1), true]]),
    },
  });
  const r = await runJson(["--github", "acme/proj"], { cwd: dir(), ...gh() });
  assert.equal(r.records, 3);
  near(r.total.cost_usd, 1.4, "total");
  assert.deepEqual(seen.filter((s) => s.path.endsWith("/zip")).map((s) => s.path.split("/").at(-2)).sort(), ["1", "2", "3"]);
});

test("--github skips expired artifacts and artifacts that are not telemetry", async () => {
  stub({
    list: [art("4", "telemetry-review-4", "2026-11-10T11:00:00Z", { expired: true }), art("5", "coverage-report", "2026-11-10T11:00:00Z"), art("2", "telemetry-review-2", "2026-11-04T11:00:00Z")],
    files: { 2: zip([["telemetry.jsonl", lines(R2), false]]) },
  });
  const r = await runJson(["--github", "acme/proj"], { cwd: dir(), ...gh() });
  assert.equal(r.records, 1);
  assert.deepEqual(seen.filter((s) => s.path.endsWith("/zip")).map((s) => s.path.split("/").at(-2)), ["2"]);
});

test("--github --since stops listing and downloading at the first older artifact", async () => {
  const many = Array.from({ length: 250 }, (_, i) => art(String(1000 - i), `telemetry-review-${1000 - i}`, i < 3 ? "2026-11-10T11:00:00Z" : "2026-10-01T11:00:00Z"));
  stub({ list: many, files: { 1000: zip([["telemetry.jsonl", lines(rec({ run_id: "1000", cost_usd: 1 })), false]]), 999: zip([["telemetry.jsonl", lines(rec({ run_id: "999", cost_usd: 1 })), false]]), 998: zip([["telemetry.jsonl", lines(rec({ run_id: "998", cost_usd: 1 })), false]]) } });
  const r = await runJson(["--github", "acme/proj", "--since", "2026-11-01"], { cwd: dir(), ...gh() });
  assert.equal(r.records, 3);
  assert.equal(seen.filter((s) => s.path.endsWith("/zip")).length, 3);
  assert.deepEqual(seen.filter((s) => !s.path.endsWith("/zip") && !s.path.startsWith("/blob")).map((s) => s.page), ["1"], "the first page already reached older artifacts");
});

test("--github follows the pages of the list", async () => {
  const many = Array.from({ length: 120 }, (_, i) => art(String(500 - i), `telemetry-review-${500 - i}`, "2026-11-10T11:00:00Z"));
  const files = Object.fromEntries(many.map((a) => [a.id, zip([["telemetry.jsonl", lines(rec({ run_id: a.id, cost_usd: 0.5 })), false]])]));
  stub({ list: many, files });
  const r = await runJson(["--github", "acme/proj"], { cwd: dir(), ...gh() });
  assert.equal(r.records, 120);
  near(r.total.cost_usd, 60, "total");
});

test("--github sends the token with every API request, and --from is read as well", async () => {
  stub({ list: [art("2", "telemetry-review-2", "2026-11-04T11:00:00Z")], files: { 2: zip([["telemetry.jsonl", lines(R2), false]]) } });
  const cwd = dir({ "mine/telemetry.jsonl": lines(R1, R2) });
  const r = await runJson(["--github", "acme/proj", "--from", "mine"], { cwd, ...gh() });
  assert.equal(r.records, 2, "R2 is in both sources and counted once");
  const api = seen.filter((s) => s.path.startsWith("/repos/"));
  assert.ok(api.length >= 2);
  assert.ok(api.every((s) => s.auth === "Bearer t0ken"));
});

test("--github without a repo takes it from the git remote 'origin'", async () => {
  stub({ list: [art("2", "telemetry-review-2", "2026-11-04T11:00:00Z")], files: { 2: zip([["telemetry.jsonl", lines(R2), false]]) } });
  const cwd = dir();
  for (const a of [["init", "-q"], ["remote", "add", "origin", "git@github.com:acme/proj.git"]]) await execFileP("git", a, { cwd });
  const r = await runJson(["--github"], { cwd, ...gh() });
  assert.equal(r.records, 1);
});

test("--github outside a git repository without a repo name exits 1", async () => {
  stub({ list: [], files: {} });
  const r = await run(["--github"], { cwd: dir(), ...gh({ GIT_CEILING_DIRECTORIES: tmpdir() }) });
  assert.equal(r.status, 1);
  assert.match(r.err, /owner\/name/);
});

test("--github that GitHub refuses exits 2 with the reason and prints no report", async () => {
  stub({ list: [], files: {} });
  const r = await run(["--github", "acme/missing"], { cwd: dir(), ...gh() });
  assert.equal(r.status, 2);
  assert.match(r.err, /404/);
  assert.equal(r.out, "");
});

test("--github with an unreadable archive exits 2 and names the artifact", async () => {
  stub({ list: [art("2", "telemetry-review-2", "2026-11-04T11:00:00Z")], files: { 2: Buffer.from("this is not a zip") } });
  const r = await run(["--github", "acme/proj"], { cwd: dir(), ...gh() });
  assert.equal(r.status, 2);
  assert.match(r.err, /telemetry-review-2/);
});

test("--github rejects a malformed repo name before any request", async () => {
  stub({ list: [], files: {} });
  const r = await run(["--github", "not a repo"], { cwd: dir(), ...gh() });
  assert.equal(r.status, 1);
  assert.deepEqual(seen, []);
});
