#!/usr/bin/env node
// init.mjs: fill in the template placeholders of a freshly spawned project.
// Safe to re-run: once the placeholders are gone it changes none of them and only
// repeats the lean step (see below).
//
//   node scripts/init.mjs --name <n> --description <d> --owner <@user|@org/team> --check "<cmd>"
//
// Inputs are validated first; nothing is written if any is invalid. The owner is
// also looked up with `gh api` (a warning if that is not possible).
// Options: --root <dir> (default: current directory); --offline skips the `gh` lookup.
// Last step: the lean chooser (lean.mjs) for this developer's .claude/settings.local.json.
// --lean recommended|off, --inventory <file> and --home <dir> are passed on to it; without
// --lean and without a terminal it is skipped. A failing lean step is only a warning.
// Afterwards run `node scripts/check.mjs` to see what is still missing.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
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
const leanArgs = [];
for (const f of ["--lean", "--inventory", "--home"]) {
  const v = take(f);
  if (v !== undefined) leanArgs.push(f, v);
}
const lean = leanArgs[leanArgs.indexOf("--lean") + 1];
if (leanArgs.includes("--lean") && !["recommended", "off"].includes(lean)) {
  console.error("--lean must be recommended or off");
  process.exit(1);
}
const flags ={ PROJECT_NAME: "--name", PROJECT_DESCRIPTION: "--description", OWNER: "--owner", CHECK_COMMANDS: "--check" };
const values = Object.fromEntries(Object.entries(flags).map(([k, f]) => [k, take(f)]));

const missing = Object.keys(values).filter((k) => !values[k]);
if (missing.length) {
  console.error(`Missing: ${missing.map((k) => flags[k]).join(", ")}`);
  console.error('Usage: init.mjs --name <n> --description <d> --owner <@user> --check "<cmd>" [--lean recommended|off]');
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
// template.json (template-only) says which template version this copy is. Record it in
// boilerplate.lock for staleness.mjs, once: a re-run keeps the lock, and sync updates it.
const lockFile = join(root, "boilerplate.lock");
let lock = null;
const templateFile = join(root, "template.json");
if (existsSync(templateFile)) {
  try {
    const t = JSON.parse(readFileSync(templateFile, "utf8"));
    if (!/^\d+\.\d+\.\d+/.test(t.version ?? "")) throw new Error(`version "${t.version}" is not SemVer`);
    if (!/^[\w.-]+\/[\w.-]+$/.test(t.repo ?? "")) throw new Error(`repo "${t.repo}" is not owner/name`);
    if (!existsSync(lockFile)) lock = { based_on: t.version, repo: t.repo };
  } catch (e) {
    console.error(`template.json: ${e.message}`);
    process.exit(1);
  }
} else if (!existsSync(lockFile)) {
  console.warn("warning: template.json not found; boilerplate.lock was not written, so staleness.mjs cannot check the template");
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
if (lock) {
  writeFileSync(lockFile, JSON.stringify(lock, null, 2) + "\n");
  console.log("wrote boilerplate.lock");
}
for (const [pattern, target, isDir] of templateOnly.filter(([, target]) => existsSync(target))) {
  rmSync(target, { recursive: isDir, force: true });
  console.log(`removed ${pattern}`);
}
if (!out.length) console.log("nothing to do: no placeholders left");

// Last, after all of init's own writes: let this developer choose what loads (lean.mjs).
const leanScript = join(dirname(fileURLToPath(import.meta.url)), "lean.mjs");
if (existsSync(leanScript)) {
  const r = spawnSync(process.execPath, [leanScript, "--root", root, ...leanArgs], { stdio: "inherit" });
  if (r.status !== 0) console.warn("warning: the lean step failed; the project is initialised. Rerun it with: node scripts/run.mjs lean");
}
console.log("Next: node scripts/check.mjs");
