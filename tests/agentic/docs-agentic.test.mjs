import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { owns } from "../../scripts/layers.mjs";
import { markdownFiles, relativeLinks } from "./helpers/doc-links.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const { layers } = JSON.parse(readFileSync(`${root}layers.json`, "utf8"));
const read = (file) => readFileSync(`${root}${file}`, "utf8");

// Resolve every relative link of a doc to a repo-relative POSIX path.
const resolved = (file) => relativeLinks(read(file)).map((l) => posix.normalize(posix.join(dirname(file), l)));

test("relativeLinks ignores code, URLs, anchors and fragments", () => {
  const md = [
    "[a](a.md#x) [b](b.md?raw=1) [c](https://example.com/c.md) [d](mailto:x@y.z) [e](#top)",
    "`[inline](code.md)`",
    "```",
    "[fenced](fence.md)",
    "```",
    "[f](dir/f.md)",
  ].join("\n");
  assert.deepEqual(relativeLinks(md), ["a.md", "b.md", "dir/f.md"]);
});

test("every relative link in docs/agentic resolves", () => {
  for (const file of markdownFiles(root, "docs/agentic")) {
    for (const target of resolved(file)) {
      assert.ok(existsSync(`${root}${target}`), `${file}: ${target} does not resolve`);
    }
  }
});

test("docs/agentic never links to a template-only path", () => {
  for (const file of markdownFiles(root, "docs/agentic")) {
    for (const target of resolved(file)) {
      for (const probe of [target, `${target}/x`]) {
        assert.ok(!owns(layers["template-only"], probe), `${file} links ${target}, a template-only path that spawned projects do not have`);
      }
    }
  }
});
