#!/usr/bin/env node
// init.mjs: fill in the template placeholders of a freshly spawned project.
// Safe to re-run: once the placeholders are gone it changes nothing.
//
//   node scripts/init.mjs --name <n> --description <d> --owner <@user|@org/team> --check "<cmd>"
//
// Inputs are validated first; nothing is written if any is invalid. The owner is
// also looked up with `gh api` (a warning if that is not possible).
// Options: --root <dir> (default: current directory); --offline skips the `gh` lookup.
// Afterwards run `node scripts/check.mjs` to see what is still missing.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { PLACEHOLDER_FILES } from "./placeholders.mjs";
import { validateInputs, ownerExists } from "./validate.mjs";

const args = process.argv.slice(2);
function take(flag) {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args.splice(i, 2)[1];
}
const offlineAt = args.indexOf("--offline");
const offline = offlineAt !== -1;
if (offline) args.splice(offlineAt, 1);
const root = resolve(take("--root") ?? process.cwd());
const flags = { PROJECT_NAME: "--name", PROJECT_DESCRIPTION: "--description", OWNER: "--owner", CHECK_COMMANDS: "--check" };
const values = Object.fromEntries(Object.entries(flags).map(([k, f]) => [k, take(f)]));

const missing = Object.keys(values).filter((k) => !values[k]);
if (missing.length) {
  console.error(`Missing: ${missing.map((k) => flags[k]).join(", ")}`);
  console.error('Usage: init.mjs --name <n> --description <d> --owner <@user> --check "<cmd>"');
  process.exit(1);
}

const problems = validateInputs(values);
if (problems.length) {
  for (const p of problems) console.error(p);
  process.exit(1);
}
if (!offline) {
  const exists = ownerExists(values.OWNER);
  if (exists === false) {
    console.error(`--owner: GitHub user or org "${values.OWNER.slice(1).split("/")[0]}" does not exist`);
    process.exit(1);
  }
  if (exists === null) console.warn("warning: could not verify --owner with `gh`; check the handle yourself");
}

// Compute everything first so a failure cannot leave a half-initialised repo.
// Template-only paths come from layers.json ("template-only" layer): files that only
// make sense in the template repository. `dir/**` means the whole directory.
const templateOnly = [];
const layersFile = join(root, "layers.json");
if (!existsSync(layersFile)) {
  console.warn("warning: layers.json not found; template-only files were not removed");
} else {
  const paths = JSON.parse(readFileSync(layersFile, "utf8")).layers?.["template-only"]?.paths ?? [];
  for (const pattern of paths) {
    const isDir = pattern.endsWith("/**");
    const target = resolve(root, isDir ? pattern.slice(0, -3) : pattern);
    const rel = relative(root, target);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
      console.error(`layers.json: template-only path "${pattern}" is outside the project`);
      process.exit(1);
    }
    templateOnly.push([pattern, target, isDir]);
  }
}
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
for (const [pattern, target, isDir] of templateOnly.filter(([, target]) => existsSync(target))) {
  rmSync(target, { recursive: isDir, force: true });
  console.log(`removed ${pattern}`);
}
if (!out.length) console.log("nothing to do: no placeholders left");
console.log("Next: node scripts/check.mjs");
