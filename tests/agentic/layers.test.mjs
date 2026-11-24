import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { owns } from "../../scripts/layers.mjs";

const { layers } = JSON.parse(readFileSync(fileURLToPath(new URL("../../layers.json", import.meta.url)), "utf8"));
const templateOnly = layers["template-only"].paths;

test("template-only layer lists everything that must not reach a spawned project", () => {
  for (const p of [
    ".github/workflows/template-ci.yml",
    "CHANGELOG.md",
    "docs/superpowers/**",
    "scripts/release.mjs",
    "tests/release.test.mjs",
    "tests/agents.test.mjs",
    "template.json",
  ]) {
    assert.ok(templateOnly.includes(p), `template-only should list ${p}`);
  }
});

test("boilerplate.lock is project bookkeeping: listed in the project layer, not in the synced one", () => {
  assert.ok(layers.project.paths.includes("boilerplate.lock"));
  assert.ok(!owns(layers.agentic, "boilerplate.lock"));
});

test("a template-only path is never also owned by another layer (sync would re-add it)", () => {
  for (const [name, layer] of Object.entries(layers)) {
    if (name === "template-only") continue;
    for (const p of templateOnly) {
      // For a directory pattern, probe a file below it.
      const probe = p.endsWith("/**") ? p.slice(0, -2) + "x" : p;
      assert.ok(!owns(layer, probe), `${p} is template-only but layer "${name}" also owns it; add it to that layer's exclude`);
    }
  }
});

test("tests/agentic/** is synced, not project-owned", () => {
  assert.ok(owns(layers.agentic, "tests/agentic/init.test.mjs"));
  assert.ok(!owns(layers.project, "tests/agentic/init.test.mjs"));
  assert.ok(owns(layers.project, "tests/app.test.mjs"));
  assert.ok(!owns(layers.agentic, "tests/app.test.mjs"));
});
