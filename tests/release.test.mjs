import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT = fileURLToPath(new URL("../scripts/release.mjs", import.meta.url));

const GOOD = `# Changelog

## [Unreleased]

## [0.1.0] - 2026-11-23
### Agentic layer
- Added agents.

**Action required:** none.
`;

function git(root, ...a) {
  const r = spawnSync("git", a, { cwd: root, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

function setup(changelog = GOOD, { commit = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "release-test-"));
  git(root, "init", "-q");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  git(root, "config", "commit.gpgsign", "false");
  git(root, "config", "tag.gpgsign", "false");
  if (changelog !== null) writeFileSync(join(root, "CHANGELOG.md"), changelog);
  writeFileSync(join(root, "a.txt"), "a");
  if (commit) {
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "init");
  }
  return root;
}
const run = (root, ...args) =>
  spawnSync(process.execPath, [SCRIPT, "--root", root, ...args], { encoding: "utf8" });
const tags = (root) => git(root, "tag", "--list").trim();

test("creates an annotated tag v<version> when the changelog entry is complete", () => {
  const root = setup();
  const r = run(root, "0.1.0");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(tags(root), "v0.1.0");
  assert.equal(git(root, "cat-file", "-t", "v0.1.0").trim(), "tag");
});

test("refuses a version that is not SemVer", () => {
  const root = setup();
  const r = run(root, "1.0");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /SemVer/);
  assert.equal(tags(root), "");
});

test("refuses to tag without a changelog entry for the version", () => {
  const root = setup();
  const r = run(root, "0.2.0");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /CHANGELOG\.md has no entry for 0\.2\.0/);
  assert.equal(tags(root), "");
});

test("refuses when there is no CHANGELOG.md", () => {
  const root = setup(null);
  const r = run(root, "0.1.0");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /CHANGELOG\.md/);
});

test("refuses an entry without an Action required line", () => {
  const root = setup(GOOD.replace("**Action required:** none.", ""));
  const r = run(root, "0.1.0");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Action required/);
  assert.equal(tags(root), "");
});

test("refuses an empty entry", () => {
  const root = setup("# Changelog\n\n## [0.1.0] - 2026-11-23\n\n## [0.0.1] - 2026-01-01\n- x\n");
  const r = run(root, "0.1.0");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /empty/);
});

test("refuses when the working tree is dirty", () => {
  const root = setup();
  writeFileSync(join(root, "a.txt"), "changed");
  const r = run(root, "0.1.0");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /uncommitted/);
  assert.equal(tags(root), "");
});

test("refuses when the tag already exists", () => {
  const root = setup();
  git(root, "tag", "v0.1.0");
  const r = run(root, "0.1.0");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /already exists/);
});

test("--dry-run validates but creates no tag", () => {
  const root = setup();
  const r = run(root, "0.1.0", "--dry-run");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /would tag v0\.1\.0/);
  assert.equal(tags(root), "");
});
