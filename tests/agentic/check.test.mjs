import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const INIT_SCRIPT = fileURLToPath(new URL("../../scripts/init.mjs", import.meta.url));
const SCRIPT = fileURLToPath(new URL("../../scripts/check.mjs", import.meta.url));

function spawned() {
  const root = mkdtempSync(join(tmpdir(), "check-test-"));
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

const init = (root) =>
  spawnSync(process.execPath, [INIT_SCRIPT, "--root", root, "--name", "Demo", "--description", "A demo app.", "--owner", "@acme", "--check", "npm test", "--offline"]);

test("check fails and names the files that still contain placeholders", () => {
  const root = spawned();
  const r = run(root, "--offline");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /CLAUDE\.md.*\{\{PROJECT_NAME\}\}/);
  assert.match(r.stdout, /CODEOWNERS/);
  assert.doesNotMatch(r.stdout, /README\.md/);
  rmSync(root, { recursive: true });
});

test("check lists the secrets and variables to set, and passes placeholders after init", () => {
  const root = spawned();
  init(root);
  const r = run(root, "--offline");
  assert.match(r.stdout, /ANTHROPIC_API_KEY/);
  assert.match(r.stdout, /DEV_MODEL/);
  assert.match(r.stdout, /MAX_COST_USD_DEV/);
  assert.doesNotMatch(r.stdout, /placeholder.*CLAUDE\.md/i);
  rmSync(root, { recursive: true });
});
