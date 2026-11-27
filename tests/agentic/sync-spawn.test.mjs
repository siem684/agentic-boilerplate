import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { gitInit, snapshot, writeTree } from "./helpers/fixtures.mjs";

const INIT = fileURLToPath(new URL("../../scripts/init.mjs", import.meta.url));
const SYNC = fileURLToPath(new URL("../../scripts/sync.mjs", import.meta.url));
const node = (script, ...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

// The real layers.json: its exclusions and seeded rules are what this test is about.
const LAYERS = readFileSync(fileURLToPath(new URL("../../layers.json", import.meta.url)), "utf8");
function template(version, files) {
  const dir = mkdtempSync(join(tmpdir(), "sync-spawn-"));
  writeTree(dir, {
    "template.json": JSON.stringify({ version, repo: "acme/tpl" }),
    "layers.json": LAYERS,
    "CLAUDE.md": "# {{PROJECT_NAME}}\n\n{{PROJECT_DESCRIPTION}}\n\nRun: {{CHECK_COMMANDS}}\n",
    ".github/CODEOWNERS": "/.github/ {{OWNER}}\n",
    ".github/workflows/ci.yml": "run: {{CHECK_COMMANDS}}\n",
    ...files,
  });
  return dir;
}

test("spawn with init, work in the project, then sync from a template one version ahead", () => {
  const v1 = template("0.1.0", { "scripts/tool.mjs": "// v1\n" });
  const v2 = template("0.2.0", {
    "scripts/tool.mjs": "// v2\n",
    "scripts/extra.mjs": "// new\n",
    "scripts/release.mjs": "// template-only\n",
    "CLAUDE.md": "# {{PROJECT_NAME}}\n\nThe template changed this seeded file.\n",
    ".github/workflows/ci.yml": "run: the template changed this seeded file\n",
  });

  // The project is a copy of v1, initialised the documented way.
  const project = mkdtempSync(join(tmpdir(), "sync-spawn-project-"));
  writeTree(project, snapshot(v1));
  const init = node(INIT, "--root", project, "--name", "Demo", "--description", "A demo.", "--owner", "@acme", "--check", "npm test", "--offline");
  assert.equal(init.status, 0, init.stderr);
  assert.ok(!existsSync(join(project, "template.json")), "init removes template.json");
  assert.deepEqual(JSON.parse(readFileSync(join(project, "boilerplate.lock"), "utf8")), { based_on: "0.1.0", repo: "acme/tpl" });

  // Project work on top: its own script, an edited CLAUDE.md.
  writeTree(project, { "scripts/mine.mjs": "// mine\n", "CLAUDE.md": "# Demo\n\nOur own rules.\n" });
  // The developer's own lean choices (issue #18): sync must never touch them.
  const localSettings = '{\n  "skillOverrides": {\n    "pptx": "off"\n  },\n  "env": { "MINE": "1" }\n}\n';
  writeTree(project, { ".claude/settings.local.json": localSettings });
  gitInit(project);
  const before = snapshot(project);

  const sync = node(SYNC, "--root", project, "--from", v2, "--base", v1, "--apply");
  assert.equal(sync.status, 0, sync.stderr + sync.stdout);

  const after = snapshot(project);
  assert.equal(after["scripts/tool.mjs"], "// v2\n");
  assert.equal(after["scripts/extra.mjs"], "// new\n");
  assert.equal(after["scripts/mine.mjs"], before["scripts/mine.mjs"]);
  assert.equal(after["CLAUDE.md"], before["CLAUDE.md"]);
  assert.equal(after[".github/workflows/ci.yml"], before[".github/workflows/ci.yml"]);
  assert.deepEqual(JSON.parse(after["boilerplate.lock"]), { based_on: "0.2.0", repo: "acme/tpl" });
  assert.ok(!("template.json" in after), "sync never adds template-only files");
  assert.ok(!("scripts/release.mjs" in after), "sync respects the exclude list of the agentic layer");
  assert.equal(readFileSync(join(project, ".claude/settings.local.json"), "utf8"), localSettings, "settings.local.json byte-identical");
});
