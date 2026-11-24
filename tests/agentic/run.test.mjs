import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPTS = fileURLToPath(new URL("../../scripts/", import.meta.url));
const SCRIPT = SCRIPTS + "run.mjs";
const spec = JSON.parse(readFileSync(SCRIPTS + "commands.json", "utf8"));

function run(...args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

test("commands.json matches the scripts directory", () => {
  const files = readdirSync(SCRIPTS).filter((f) => f.endsWith(".mjs")).map((f) => f.slice(0, -4));
  for (const name of files) {
    if (!spec.notCommands.includes(name)) assert.ok(spec.commands[name], `${name}.mjs has no entry in commands.json`);
  }
  for (const name of spec.notCommands) assert.ok(files.includes(name), `notCommands lists ${name}, which does not exist`);
  for (const [name, c] of Object.entries(spec.commands)) {
    if (!c.templateOnly) assert.ok(files.includes(name), `${name} has an entry but no script`);
    assert.ok(c.summary?.trim(), `${name}: summary`);
    assert.ok(spec.audiences[c.audience], `${name}: unknown audience ${c.audience}`);
    assert.ok(c.example.startsWith("node scripts/"), `${name}: example`);
  }
});

test("no arguments lists every available command grouped by audience", () => {
  const { status, out } = run();
  assert.equal(status, 0);
  const labels = Object.values(spec.audiences);
  const at = labels.map((l) => out.indexOf(l)).filter((i) => i !== -1);
  assert.deepEqual(at, [...at].sort((a, b) => a - b), "audience labels in order");
  assert.ok(out.includes(labels[0]), "first audience shown");
  const files = readdirSync(SCRIPTS);
  for (const [name, c] of Object.entries(spec.commands)) {
    if (files.includes(name + ".mjs")) assert.ok(out.includes(name), `${name} listed`);
    else assert.ok(c.templateOnly);
  }
});

test("-h and --help are the same as no arguments", () => {
  const base = run();
  for (const flag of ["-h", "--help"]) {
    const r = run(flag);
    assert.equal(r.status, 0);
    assert.equal(r.out, base.out);
  }
});

test("help <name> shows summary, flags, exit codes and example", () => {
  const c = spec.commands.staleness;
  const { status, out } = run("help", "staleness");
  assert.equal(status, 0);
  assert.ok(out.includes(c.summary));
  for (const f of c.flags) assert.ok(out.includes(f.flag), f.flag);
  for (const e of c.exitCodes) assert.ok(out.includes(e.meaning), e.meaning);
  assert.ok(out.includes(c.example));
});

test("help with an unknown name exits 1 and shows the overview", () => {
  const { status, out } = run("help", "nope");
  assert.equal(status, 1);
  assert.ok(out.includes("staleness"));
});

// --- dispatching ---
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

function vendorRoot() {
  const root = mkdtempSync(join(tmpdir(), "run-test-"));
  writeFileSync(
    join(root, "vendor.json"),
    JSON.stringify({
      schemaVersion: 1,
      components: {
        demo: {
          version: "1.2.3",
          source: { type: "npm", package: "demo" },
          install: "npx demo@1.2.3 install",
          detect: { file: "_demo/manifest.yaml", pattern: "version:\\s*(\\S+)" },
        },
      },
    })
  );
  return root;
}

test("runs the script and passes flags through", () => {
  const root = vendorRoot();
  const r = run("vendor", "list", "--root", root);
  assert.equal(r.status, 0);
  assert.ok(r.out.includes("demo"));
});

test("returns the exit code and output of the script", () => {
  const root = vendorRoot();
  const direct = spawnSync(process.execPath, [SCRIPTS + "vendor.mjs", "verify", "--root", root], { encoding: "utf8" });
  assert.equal(direct.status, 1, "precondition: verify fails on a missing component");
  const r = run("vendor", "verify", "--root", root);
  assert.equal(r.status, 1);
  assert.equal(r.out, direct.stdout);
  assert.equal(r.err, direct.stderr);
});

test("a relative --root resolves against the caller's cwd", () => {
  const root = vendorRoot();
  const r = spawnSync(process.execPath, [SCRIPT, "vendor", "list", "--root", basename(root)], { encoding: "utf8", cwd: dirname(root) });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes("demo"));
});

test("a command name is not a path", () => {
  for (const name of ["../init", "./init", "../scripts/init", "__proto__", "constructor", ""]) {
    const r = run(name);
    assert.equal(r.status, 1, `"${name}" exits 1`);
    assert.ok(r.out.includes("staleness"), `"${name}" shows the overview`);
    assert.ok(!r.out.includes("--name") && !r.err.includes("--name"), `"${name}" ran nothing`);
  }
});

test("--help after a command shows its help instead of running it", () => {
  const root = vendorRoot();
  const r = run("vendor", "--help", "--root", root);
  assert.equal(r.status, 0);
  assert.ok(r.out.includes(spec.commands.vendor.summary));
  assert.ok(!r.out.includes("1.2.3"), "did not run `vendor list`");
});

test("an entry without a script file exits 1 with a message", () => {
  const dir = mkdtempSync(join(tmpdir(), "run-test-scripts-"));
  mkdirSync(join(dir, "scripts"));
  for (const f of ["run.mjs", "commands.json"]) copyFileSync(SCRIPTS + f, join(dir, "scripts", f));
  const r = spawnSync(process.execPath, [join(dir, "scripts", "run.mjs"), "release"], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.ok(r.stderr.includes("release"));
  assert.ok(!r.stderr.includes("Error:"), "no stack trace");
});

function fixture(checkBody) {
  const dir = mkdtempSync(join(tmpdir(), "run-test-fixture-"));
  mkdirSync(join(dir, "scripts"));
  for (const f of ["run.mjs", "commands.json"]) copyFileSync(SCRIPTS + f, join(dir, "scripts", f));
  writeFileSync(join(dir, "scripts", "check.mjs"), checkBody);
  return join(dir, "scripts", "run.mjs");
}

test("passes through any exit code and the arguments of the script", () => {
  const runner = fixture("console.log(process.argv.slice(2).join('|')); process.exit(7);");
  const r = spawnSync(process.execPath, [runner, "check", "--a", "b c"], { encoding: "utf8" });
  assert.equal(r.status, 7);
  assert.equal(r.stdout.trim(), "--a|b c");
});

test("a script that dies without an exit code does not become success", () => {
  const runner = fixture("process.kill(process.pid, 'SIGKILL'); setTimeout(() => {}, 5000);");
  const r = spawnSync(process.execPath, [runner, "check"], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
});
