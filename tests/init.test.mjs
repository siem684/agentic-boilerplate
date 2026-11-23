import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT = fileURLToPath(new URL("../scripts/init.mjs", import.meta.url));

function spawned() {
  const root = mkdtempSync(join(tmpdir(), "init-test-"));
  mkdirSync(join(root, ".github/workflows"), { recursive: true });
  writeFileSync(join(root, "CLAUDE.md"), "# {{PROJECT_NAME}}\n\n{{PROJECT_DESCRIPTION}}\n\nRun: {{CHECK_COMMANDS}}\n");
  writeFileSync(join(root, ".github/CODEOWNERS"), "/.github/ {{OWNER}}\n/docs/adr/ {{OWNER}}\n");
  writeFileSync(join(root, ".github/workflows/ci.yml"), "run: {{CHECK_COMMANDS}}\n");
  writeFileSync(join(root, "README.md"), "Uses `{{PLACEHOLDERS}}` in docs.\n");
  return root;
}
const run = (root, ...args) =>
  spawnSync(process.execPath, [SCRIPT, "--root", root, ...args], { encoding: "utf8" });
const read = (root, f) => readFileSync(join(root, f), "utf8");
const INIT = ["--name", "Demo", "--description", "A demo app.", "--owner", "@acme", "--check", "npm test", "--offline"];

test("init replaces every placeholder in CLAUDE.md, CODEOWNERS and ci.yml", () => {
  const root = spawned();
  const r = run(root, ...INIT);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(read(root, "CLAUDE.md"), "# Demo\n\nA demo app.\n\nRun: npm test\n");
  assert.equal(read(root, ".github/CODEOWNERS"), "/.github/ @acme\n/docs/adr/ @acme\n");
  assert.equal(read(root, ".github/workflows/ci.yml"), "run: npm test\n");
  rmSync(root, { recursive: true });
});

test("init leaves README.md alone (it only mentions the placeholder syntax)", () => {
  const root = spawned();
  run(root, ...INIT);
  assert.match(read(root, "README.md"), /\{\{PLACEHOLDERS\}\}/);
  rmSync(root, { recursive: true });
});

test("init is idempotent: a second run changes nothing and succeeds", () => {
  const root = spawned();
  run(root, ...INIT);
  const r = run(root, ...INIT);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(read(root, "CLAUDE.md"), "# Demo\n\nA demo app.\n\nRun: npm test\n");
  rmSync(root, { recursive: true });
});

test("init rejects invalid values, names every problem and changes nothing", () => {
  const root = spawned();
  const r = run(root, "--name", "Demo", "--description", "ok", "--owner", "@me", "--check", "npm test", "--offline");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--owner/);
  assert.match(read(root, "CLAUDE.md"), /\{\{PROJECT_NAME\}\}/, "must not half-apply");
  const r2 = run(root, "--name", "x\ny", "--description", "ok", "--owner", "notahandle", "--check", "npm test", "--offline");
  assert.equal(r2.status, 1);
  assert.match(r2.stderr, /--name/);
  assert.match(r2.stderr, /--owner/);
  rmSync(root, { recursive: true });
});

test("init fails with a clear message when a value is missing", () => {
  const root = spawned();
  const r = run(root, "--name", "Demo");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--description/);
  assert.match(read(root, "CLAUDE.md"), /\{\{PROJECT_NAME\}\}/, "must not half-apply");
  rmSync(root, { recursive: true });
});

test("init removes the template's own CI workflow from the spawned project", () => {
  const root = spawned();
  writeFileSync(join(root, ".github/workflows/template-ci.yml"), "name: Template CI\n");
  const r = run(root, ...INIT);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(existsSync(join(root, ".github/workflows/template-ci.yml")), false);
  assert.match(r.stdout, /removed .github\/workflows\/template-ci\.yml/);
  rmSync(root, { recursive: true });
});

test("init still succeeds when there is no template-ci.yml (re-run)", () => {
  const root = spawned();
  assert.equal(run(root, ...INIT).status, 0);
  assert.equal(run(root, ...INIT).status, 0);
  rmSync(root, { recursive: true });
});

// Guard against the real ci.yml silently ignoring --check (it used to hard-code `exit 1`).
// Only meaningful in the template itself; skipped once a project has been initialised.
const REAL_CI = fileURLToPath(new URL("../.github/workflows/ci.yml", import.meta.url));
test("the shipped ci.yml runs the --check command", { skip: !readFileSync(REAL_CI, "utf8").includes("{{CHECK_COMMANDS}}") }, () => {
  const root = spawned();
  writeFileSync(join(root, ".github/workflows/ci.yml"), readFileSync(REAL_CI, "utf8"));
  assert.equal(run(root, ...INIT).status, 0);
  const ci = read(root, ".github/workflows/ci.yml");
  assert.match(ci, /run: \|\r?\n\s+npm test\r?\n/);
  assert.doesNotMatch(ci, /exit 1/);
  rmSync(root, { recursive: true });
});
