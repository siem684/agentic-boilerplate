import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPTS = fileURLToPath(new URL("../scripts/", import.meta.url));
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
