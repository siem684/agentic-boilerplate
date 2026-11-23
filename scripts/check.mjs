#!/usr/bin/env node
// check.mjs: report whether a spawned project is ready to use. Read-only: it
// changes nothing and only calls `gh` to list secret and variable names.
//
//   node scripts/check.mjs [--offline]     # exit 1 if something blocks use
//
// Options: --root <dir> (default: current directory); --offline skips `gh`.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { PLACEHOLDER_FILES } from "./placeholders.mjs";

const SECRETS = [
  { name: "ANTHROPIC_API_KEY", kind: "secret", required: true, note: "runs the agent and the CI review" },
  { name: "DEEPSEEK_API_KEY", kind: "secret", required: false, note: "only for the non-Claude pilot (ADR 0007)" },
  { name: "DEV_MODEL", kind: "variable", required: false, note: "default claude-opus-5-5" },
  { name: "MAX_COST_USD_DEV", kind: "variable", required: false, note: "budget cap per dev run, default 5" },
  { name: "MAX_COST_USD_REVIEW", kind: "variable", required: false, note: "budget cap per review, default 1" },
];

const args = process.argv.slice(2);
const flag = (f) => { const i = args.indexOf(f); if (i !== -1) args.splice(i, 1); return i !== -1; };
const ri = args.indexOf("--root");
const root = resolve(ri === -1 ? process.cwd() : args.splice(ri, 2)[1]);
const offline = flag("--offline");
const read = (f) => readFileSync(join(root, f), "utf8");

function ghList(kind) {
  const r = spawnSync("gh", [kind, "list", "--json", "name", "--jq", ".[].name"], { cwd: root, encoding: "utf8" });
  return r.status === 0 ? new Set(r.stdout.split(/\r?\n/).filter(Boolean)) : null;
}

let blocking = 0;

console.log("Placeholders");
for (const f of PLACEHOLDER_FILES.filter((f) => existsSync(join(root, f)))) {
  const found = [...new Set(read(f).match(/\{\{[A-Z_]+\}\}/g) ?? [])];
  if (found.length) {
    blocking++;
    console.log(`  FAIL ${f}: ${found.join(" ")}`);
  }
}
if (!blocking) console.log("  ok");

console.log("Components");
if (existsSync(join(root, "vendor.json"))) {
  const r = spawnSync(process.execPath, [join(import.meta.dirname, "vendor.mjs"), "verify", "--root", root], { encoding: "utf8" });
  for (const l of r.stdout.split(/\r?\n/).filter(Boolean)) console.log(`  ${l}`);
  if (r.status !== 0) blocking++;
} else {
  console.log("  skipped: no vendor.json");
}

console.log("Repository secrets and variables");
const sets = offline ? null : { secret: ghList("secret"), variable: ghList("variable") };
for (const s of SECRETS) {
  const have = sets?.[s.kind]?.has(s.name);
  const state = have === undefined ? "to set" : have ? "set" : s.required ? "MISSING" : "unset (optional)";
  if (state === "MISSING") blocking++;
  console.log(`  ${state.padEnd(16)} ${s.kind.padEnd(8)} ${s.name}  ${s.required ? "required" : "optional"}: ${s.note}`);
}
if (!sets?.secret) console.log("  (could not query GitHub; set these with `gh secret set` / `gh variable set`)");

console.log(blocking ? `\n${blocking} blocking problem(s).` : "\nReady.");
process.exit(blocking ? 1 : 0);
