import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

test("docs/agentic/README.md exists and links every other top-level doc in docs/agentic/", () => {
  assert.ok(existsSync(`${root}docs/agentic/README.md`), "docs/agentic/README.md is missing");
  const linked = resolved("docs/agentic/README.md");
  const topLevel = markdownFiles(root, "docs/agentic").filter((f) => f.split("/").length === 3 && f !== "docs/agentic/README.md");
  assert.ok(topLevel.length > 0);
  for (const doc of topLevel) assert.ok(linked.includes(doc), `docs/agentic/README.md does not link ${doc}`);
});

test("architecture.md names every agent and workflow", () => {
  assert.ok(existsSync(`${root}docs/agentic/architecture.md`), "docs/agentic/architecture.md is missing");
  const text = read("docs/agentic/architecture.md");
  const agents = readdirSync(`${root}.claude/agents`).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
  assert.ok(agents.length >= 5);
  for (const name of [...agents, "claude.yml", "ci.yml"]) assert.ok(text.includes(name), `architecture.md does not mention ${name}`);
});
