import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT = fileURLToPath(new URL("../scripts/trim-skills.mjs", import.meta.url));

function repoWithSkills(names) {
  const root = mkdtempSync(join(tmpdir(), "trim-test-"));
  const git = (...a) => assert.equal(spawnSync("git", a, { cwd: root, encoding: "utf8" }).status, 0);
  git("init", "-q");
  for (const n of names) {
    mkdirSync(join(root, ".claude/skills", n), { recursive: true });
    writeFileSync(join(root, ".claude/skills", n, "SKILL.md"), n);
  }
  git("add", "-A");
  git("-c", "user.email=t@example.com", "-c", "user.name=t", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "x");
  return root;
}
const run = (root, ...keep) =>
  spawnSync(process.execPath, [SCRIPT, "--root", root, ...keep], { encoding: "utf8" });

test("removes every skill directory that is not in the keep list", () => {
  const root = repoWithSkills(["bmad-build", "graphify", "other"]);
  const r = run(root, "bmad-build");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(existsSync(join(root, ".claude/skills/bmad-build")), true);
  assert.equal(existsSync(join(root, ".claude/skills/graphify")), false);
  assert.equal(existsSync(join(root, ".claude/skills/other")), false);
});

test("hides the deletions from git so the agent cannot stage them", () => {
  const root = repoWithSkills(["bmad-build", "graphify"]);
  run(root, "bmad-build");
  const s = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  assert.equal(s.stdout.trim(), "");
});

test("does nothing when there is no skills directory", () => {
  const root = mkdtempSync(join(tmpdir(), "trim-empty-"));
  assert.equal(run(root, "bmad-build").status, 0);
});

test("refuses to run without a keep list, so it cannot delete everything by accident", () => {
  const root = repoWithSkills(["graphify"]);
  const r = run(root);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /keep/i);
  assert.equal(existsSync(join(root, ".claude/skills/graphify")), true);
});
