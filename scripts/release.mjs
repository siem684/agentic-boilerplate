#!/usr/bin/env node
// release.mjs: create the git tag for a template release, but only if it is ready.
// It never pushes and never publishes a GitHub Release; a human does that (ADR 0008).
//
//   node scripts/release.mjs <x.y.z> [--dry-run]
//
// Refuses unless: the version is SemVer, CHANGELOG.md has a non-empty entry for it
// that contains an "Action required" line, the working tree is clean, and the tag
// does not exist yet. Options: --root <dir> (default: current directory)
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const i = args.indexOf("--root");
const root = resolve(i === -1 ? process.cwd() : args.splice(i, 2)[1]);
const dryRun = args.includes("--dry-run");
const [version] = args.filter((a) => !a.startsWith("--"));

function fail(msg) {
  console.error(`release: ${msg}`);
  process.exit(1);
}
const git = (...a) => {
  const r = spawnSync("git", a, { cwd: root, encoding: "utf8" });
  if (r.error) fail(`could not run git (${r.error.code ?? r.error.message}); is it installed and on PATH?`);
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
if (!version || !SEMVER.test(version)) {
  fail("usage: release.mjs <x.y.z> [--dry-run]; the version must be SemVer");
}

const file = join(root, "CHANGELOG.md");
if (!existsSync(file)) fail("CHANGELOG.md not found");
const lines = readFileSync(file, "utf8").split(/\r?\n/);
const esc = version.replace(/[.+]/g, "\\$&");
const start = lines.findIndex((l) => new RegExp(`^##\\s+\\[?v?${esc}\\]?(\\s|$)`).test(l));
if (start === -1) fail(`CHANGELOG.md has no entry for ${version}`);
let end = lines.findIndex((l, n) => n > start && /^##\s/.test(l));
if (end === -1) end = lines.length;
const body = lines.slice(start + 1, end).join("\n");
if (!body.trim()) fail(`the CHANGELOG.md entry for ${version} is empty`);
if (!/action required/i.test(body)) {
  fail(`the CHANGELOG.md entry for ${version} needs an "Action required" line (write "none" if so)`);
}

if (git("rev-parse", "--git-dir").status !== 0) fail(`${root} is not a git repository`);
const top = git("rev-parse", "--show-toplevel").stdout.trim();
if (!top || resolve(top).toLowerCase() !== root.toLowerCase()) {
  fail(`${root} is not the top level of its git repository (${top}); run from the repository root`);
}
const status = git("status", "--porcelain");
if (status.status !== 0) fail(`git status failed: ${status.stderr.trim()}`);
if (status.stdout.trim()) fail("uncommitted changes; commit or stash first");

const tag = `v${version}`;
if (git("rev-parse", "-q", "--verify", `refs/tags/${tag}`).status === 0) {
  fail(`tag ${tag} already exists`);
}

if (dryRun) {
  console.log(`would tag ${tag}`);
} else {
  const r = git("tag", "-a", tag, "-m", `Release ${version}`);
  if (r.status !== 0) fail(r.stderr.trim());
  console.log(`tagged ${tag}. Next: git push origin ${tag}, then create the GitHub Release from the changelog entry.`);
}
