import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { layers } = JSON.parse(readFileSync(fileURLToPath(new URL("../layers.json", import.meta.url)), "utf8"));
const templateOnly = layers["template-only"].paths;

// Minimal glob: an exact path, or `dir/**` for everything below dir.
const matches = (pattern, path) =>
  pattern.endsWith("/**") ? path.startsWith(pattern.slice(0, -2)) : pattern === path;
const owns = (layer, path) =>
  layer.paths.some((p) => matches(p, path)) && !(layer.exclude ?? []).some((p) => matches(p, path));

test("template-only layer lists everything that must not reach a spawned project", () => {
  for (const p of [
    ".github/workflows/template-ci.yml",
    "CHANGELOG.md",
    "docs/superpowers/**",
    "scripts/release.mjs",
    "tests/release.test.mjs",
    "tests/agents.test.mjs",
  ]) {
    assert.ok(templateOnly.includes(p), `template-only should list ${p}`);
  }
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
