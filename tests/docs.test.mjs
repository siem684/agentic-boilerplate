// Template-only (see layers.json): checks documents that only exist in the template repository.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { owns } from "../scripts/layers.mjs";
import { markdownFiles, relativeLinks } from "./agentic/helpers/doc-links.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const { layers } = JSON.parse(readFileSync(`${root}layers.json`, "utf8"));
const read = (file) => readFileSync(`${root}${file}`, "utf8");
const resolved = (file) => relativeLinks(read(file)).map((l) => posix.normalize(posix.join(dirname(file), l)));

const checked = () =>
  [
    "README.md",
    "CHANGELOG.md",
    ...["CONTRIBUTING.md", "SECURITY.md"].filter((f) => existsSync(`${root}${f}`)),
    ...(existsSync(`${root}docs/template`) ? markdownFiles(root, "docs/template") : []),
  ];

test("every relative link in the README, changelog and template docs resolves", () => {
  for (const file of checked()) {
    for (const target of resolved(file)) {
      assert.ok(existsSync(`${root}${target}`), `${file}: ${target} does not resolve`);
    }
  }
});

test("README.md links no template-only path (init.mjs deletes those in a spawned project)", () => {
  for (const target of resolved("README.md")) {
    for (const probe of [target, `${target}/x`]) {
      assert.ok(!owns(layers["template-only"], probe), `README.md links ${target}, which init.mjs deletes`);
    }
  }
});

test("CONTRIBUTING.md, SECURITY.md and the fork guide exist and say what they must", () => {
  for (const f of ["CONTRIBUTING.md", "SECURITY.md", "docs/template/fork-guide.md"]) {
    assert.ok(existsSync(`${root}${f}`), `${f} is missing`);
  }
  const contributing = read("CONTRIBUTING.md");
  for (const needle of ['node --test "tests/**/*.test.mjs"', "fork", "own key"]) {
    assert.ok(contributing.includes(needle), `CONTRIBUTING.md does not mention ${needle}`);
  }
  const guide = resolved("docs/template/fork-guide.md");
  for (const adr of readdirSync(`${root}docs/template/adr`).filter((f) => f.endsWith(".md"))) {
    assert.ok(guide.includes(`docs/template/adr/${adr}`), `fork-guide.md does not link ${adr}`);
  }
  const security = read("SECURITY.md");
  assert.ok(security.includes("private vulnerability reporting"));
  assert.ok(resolved("SECURITY.md").includes("docs/agentic/security-model.md"));
});
