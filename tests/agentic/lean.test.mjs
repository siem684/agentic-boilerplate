import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT = fileURLToPath(new URL("../../scripts/lean.mjs", import.meta.url));
const FIXTURE = fileURLToPath(new URL("./fixtures/context-report.md", import.meta.url));
const LOCAL = join(".claude", "settings.local.json");

// A project dir and a home dir with a fictional user setup: one enabled plugin.
function setup() {
  const base = mkdtempSync(join(tmpdir(), "lean-test-"));
  const root = join(base, "project");
  const home = join(base, "home");
  mkdirSync(root);
  mkdirSync(join(home, ".claude"), { recursive: true });
  writeFileSync(join(home, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { "helper@market": true, "gone@market": false } }));
  return { base, root, home };
}
// spawnSync pipes stdin and stdout, so the script never sees a TTY here.
const run = ({ root, home }, ...args) =>
  spawnSync(process.execPath, [SCRIPT, "--root", root, "--home", home, ...args], { encoding: "utf8" });
const local = (root) => join(root, LOCAL);

test("--lean recommended writes the recommended file and prints what it turned off", () => {
  const t = setup();
  const r = run(t, "--lean", "recommended", "--inventory", FIXTURE);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(readFileSync(local(t.root), "utf8")), {
    disableClaudeAiConnectors: true,
    skillOverrides: { pptx: "off" },
    enableArtifact: false,
    permissions: { deny: ["CronCreate", "RemoteTrigger"] },
  });
  for (const s of ["Gmail", "Google Calendar", "pptx", "Artifact", "CronCreate"]) assert.match(r.stdout, new RegExp(s));
  assert.match(r.stdout, /To change this, run: node scripts\/run\.mjs lean \(or delete \.claude\/settings\.local\.json\)/);
  rmSync(t.base, { recursive: true });
});

test("--lean off writes nothing", () => {
  const t = setup();
  const r = run(t, "--lean", "off", "--inventory", FIXTURE);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(existsSync(local(t.root)), false);
  rmSync(t.base, { recursive: true });
});

test("without a TTY and without --lean it skips and writes nothing", () => {
  const t = setup();
  const r = run(t, "--inventory", FIXTURE);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim().split("\n").length, 1);
  assert.match(r.stdout, /skipped/);
  assert.equal(existsSync(local(t.root)), false);
  rmSync(t.base, { recursive: true });
});

test("second run with the same answers gives the same file", () => {
  const t = setup();
  mkdirSync(join(t.root, ".claude"));
  writeFileSync(local(t.root), JSON.stringify({ env: { MY_VAR: "1" }, permissions: { allow: ["Bash(npm test)"] } }));
  assert.equal(run(t, "--lean", "recommended", "--inventory", FIXTURE).status, 0);
  const first = readFileSync(local(t.root), "utf8");
  const r = run(t, "--lean", "recommended", "--inventory", FIXTURE);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(local(t.root), "utf8"), first);
  const s = JSON.parse(first);
  assert.deepEqual(s.env, { MY_VAR: "1" });
  assert.deepEqual(s.permissions.allow, ["Bash(npm test)"]);
  rmSync(t.base, { recursive: true });
});

test("--lean recommended only adds; what the developer turned off stays off", () => {
  const t = setup();
  mkdirSync(join(t.root, ".claude"));
  writeFileSync(local(t.root), JSON.stringify({
    permissions: { deny: ["WebFetch"] },
    deniedMcpServers: [{ serverName: "local-search" }],
  }));
  const r = run(t, "--lean", "recommended", "--inventory", FIXTURE);
  assert.equal(r.status, 0, r.stderr);
  const s = JSON.parse(readFileSync(local(t.root), "utf8"));
  assert.ok(s.permissions.deny.includes("WebFetch"), JSON.stringify(s));
  assert.ok(s.permissions.deny.includes("CronCreate"), JSON.stringify(s));
  assert.deepEqual(s.deniedMcpServers, [{ serverName: "local-search" }]);
  assert.equal(s.disableClaudeAiConnectors, true);
  assert.doesNotMatch(r.stdout, /Turned back on/);
  rmSync(t.base, { recursive: true });
});

test("a second run with nothing to change says so and does not claim to write", () => {
  const t = setup();
  run(t, "--lean", "recommended", "--inventory", FIXTURE);
  const r = run(t, "--lean", "recommended", "--inventory", FIXTURE);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /No changes; \.claude\/settings\.local\.json is up to date\./);
  assert.doesNotMatch(r.stdout, /Wrote/);
  rmSync(t.base, { recursive: true });
});

test("invalid JSON in settings.local.json exits 2 and writes nothing", () => {
  const t = setup();
  mkdirSync(join(t.root, ".claude"));
  writeFileSync(local(t.root), "{ not json");
  const r = run(t, "--lean", "recommended", "--inventory", FIXTURE);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /settings\.local\.json/);
  assert.equal(readFileSync(local(t.root), "utf8"), "{ not json");
  rmSync(t.base, { recursive: true });
});

test("unparseable /context output falls back to disk with a warning", () => {
  const t = setup();
  const inventory = join(t.base, "context.txt");
  writeFileSync(inventory, "Error: not signed in\n");
  writeFileSync(join(t.home, ".claude.json"), JSON.stringify({ mcpServers: { "claude-in-chrome": { command: "x" } } }));
  const r = run(t, "--lean", "recommended", "--inventory", inventory);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /could not read \/context; claude\.ai connectors and account skills are not listed/);
  assert.match(r.stdout, /claude-in-chrome/);
  assert.deepEqual(JSON.parse(readFileSync(local(t.root), "utf8")).deniedMcpServers, [{ serverName: "claude-in-chrome" }]);
  rmSync(t.base, { recursive: true });
});

test("an unknown flag or --lean value exits 2", () => {
  const t = setup();
  assert.equal(run(t, "--bogus").status, 2);
  assert.equal(run(t, "--lean", "maybe").status, 2);
  assert.equal(existsSync(local(t.root)), false);
  rmSync(t.base, { recursive: true });
});
