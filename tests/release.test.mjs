import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
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

function setup(changelog = GOOD, { commit = true, templateVersion = "0.1.0" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "release-test-"));
  git(root, "init", "-q");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  git(root, "config", "commit.gpgsign", "false");
  git(root, "config", "tag.gpgsign", "false");
  if (changelog !== null) writeFileSync(join(root, "CHANGELOG.md"), changelog);
  if (templateVersion !== null) {
    writeFileSync(join(root, "template.json"), JSON.stringify({ version: templateVersion, repo: "acme/tpl" }));
  }
  writeFileSync(join(root, "a.txt"), "a");
  if (commit) {
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "init");
  }
  return root;
}
// Isolate from the developer's environment: no inherited GIT_* variables, and git must not
// look for a repository above the temp directory.
function cleanEnv(root, extra = {}) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|CEILING_DIRECTORIES)$/i.test(k)) delete env[k];
  }
  return { ...env, GIT_CEILING_DIRECTORIES: dirname(root), ...extra };
}
const run = (root, ...args) =>
  spawnSync(process.execPath, [SCRIPT, "--root", root, ...args], { encoding: "utf8", env: cleanEnv(root) });
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

test("refuses when template.json names another version than the release", () => {
  const root = setup(GOOD, { templateVersion: "0.0.9" });
  const r = run(root, "0.1.0");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /template\.json/);
  assert.match(r.stderr, /0\.0\.9/);
  assert.equal(tags(root), "");
});

test("refuses when template.json is missing", () => {
  const root = setup(GOOD, { templateVersion: null });
  const r = run(root, "0.1.0");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /template\.json/);
  assert.equal(tags(root), "");
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

test("fails clearly outside a git repository", () => {
  const root = mkdtempSync(join(tmpdir(), "release-nogit-"));
  writeFileSync(join(root, "CHANGELOG.md"), GOOD);
  const r = run(root, "0.1.0");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not a git repository/);
  assert.doesNotMatch(r.stderr, /TypeError/);
});

// One PATH key only: Windows env names are case-insensitive, duplicates behave unpredictably.
function withoutPath(env, value) {
  const out = Object.fromEntries(Object.entries(env).filter(([k]) => k.toLowerCase() !== "path"));
  return { ...out, PATH: value };
}

test("fails clearly when git cannot be run", () => {
  const root = setup();
  const empty = mkdtempSync(join(tmpdir(), "release-nopath-"));
  const r = spawnSync(process.execPath, [SCRIPT, "--root", root, "0.1.0"], {
    encoding: "utf8",
    env: withoutPath(cleanEnv(root), empty),
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /could not run git/);
  assert.doesNotMatch(r.stderr, /TypeError/);
});

test("refuses when --root is a subdirectory of the repository", () => {
  const root = setup();
  const sub = join(root, "sub");
  mkdirSync(sub);
  writeFileSync(join(sub, "CHANGELOG.md"), GOOD);
  const r = spawnSync(process.execPath, [SCRIPT, "--root", sub, "0.1.0"], {
    encoding: "utf8",
    env: cleanEnv(root), // ceiling above the repo, so git can find it from the subdirectory
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /top level/);
  assert.equal(tags(root), "");
});
