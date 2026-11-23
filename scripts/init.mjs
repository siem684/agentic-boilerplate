#!/usr/bin/env node
// init.mjs: fill in the template placeholders of a freshly spawned project.
// Offline. Safe to re-run: once the placeholders are gone it changes nothing.
//
//   node scripts/init.mjs --name <n> --description <d> --owner <@user|@org/team> --check "<cmd>"
//
// Options: --root <dir> (default: current directory)
// Afterwards run `node scripts/check.mjs` to see what is still missing.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PLACEHOLDER_FILES } from "./placeholders.mjs";

const args = process.argv.slice(2);
function take(flag) {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args.splice(i, 2)[1];
}
const root = resolve(take("--root") ?? process.cwd());
const flags = { PROJECT_NAME: "--name", PROJECT_DESCRIPTION: "--description", OWNER: "--owner", CHECK_COMMANDS: "--check" };
const values = Object.fromEntries(Object.entries(flags).map(([k, f]) => [k, take(f)]));

const missing = Object.keys(values).filter((k) => !values[k]);
if (missing.length) {
  console.error(`Missing: ${missing.map((k) => flags[k]).join(", ")}`);
  console.error('Usage: init.mjs --name <n> --description <d> --owner <@user> --check "<cmd>"');
  process.exit(1);
}

// Compute everything first so a failure cannot leave a half-initialised repo.
const out = [];
for (const f of PLACEHOLDER_FILES.filter((f) => existsSync(join(root, f)))) {
  const before = readFileSync(join(root, f), "utf8");
  // Function replacer: values may contain `$&` etc.
  const after = before.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => values[k] ?? m);
  if (after !== before) out.push([f, after]);
}
for (const [f, text] of out) {
  writeFileSync(join(root, f), text);
  console.log(`updated ${f}`);
}
if (!out.length) console.log("nothing to do: no placeholders left");
console.log("Next: node scripts/check.mjs");
