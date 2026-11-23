#!/usr/bin/env node
// trim-skills.mjs: in CI, keep only the named skills under .claude/skills/.
// Only skill names and descriptions reach the system prompt, but every skill costs a line.
// Deleted files are marked skip-worktree so the agent's `git add` cannot stage the deletions.
//
//   node scripts/trim-skills.mjs <keep-skill> [<keep-skill> ...]
//
// A keep list is required, so a typo in a workflow cannot delete every skill.
// Options: --root <dir> (default: current directory)
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const i = args.indexOf("--root");
const root = resolve(i === -1 ? process.cwd() : args.splice(i, 2)[1]);
const keep = new Set(args);

if (!keep.size) {
  console.error("usage: trim-skills.mjs <keep-skill> [<keep-skill> ...]  (a keep list is required)");
  process.exit(1);
}

const skills = join(root, ".claude", "skills");
if (!existsSync(skills)) process.exit(0);

for (const entry of readdirSync(skills, { withFileTypes: true })) {
  if (!entry.isDirectory() || keep.has(entry.name)) continue;
  const rel = `.claude/skills/${entry.name}`;
  const files = spawnSync("git", ["ls-files", "-z", "--", rel], { cwd: root, encoding: "utf8" }).stdout ?? "";
  const list = files.split("\0").filter(Boolean);
  if (list.length) spawnSync("git", ["update-index", "--skip-worktree", "--", ...list], { cwd: root });
  rmSync(join(skills, entry.name), { recursive: true, force: true });
  console.log(`trimmed ${rel}`);
}
