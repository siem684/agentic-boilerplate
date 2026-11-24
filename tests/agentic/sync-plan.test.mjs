import { test } from "node:test";
import assert from "node:assert/strict";
import { planSync } from "../../scripts/sync-plan.mjs";

const B = (s) => Buffer.from(s);
const tree = (o) => new Map(Object.entries(o).map(([k, v]) => [k, B(v)]));
const LAYERS = { agentic: { paths: ["scripts/**", "layers.json"], exclude: ["scripts/release.mjs"] } };

// `old`, `next` and `project` map a path to its content; a path missing from `project` is absent.
function plan({ old = {}, next = {}, project = {}, oldLayers = LAYERS, newLayers = LAYERS }) {
  return planSync({ oldTree: tree(old), newTree: tree(next), oldLayers, newLayers, read: (p) => (p in project ? B(project[p]) : null) });
}
const P = "scripts/a.mjs";

test("project equals new: nothing, also when it was spawned after based_on", () => {
  assert.deepEqual(plan({ old: { [P]: "1" }, next: { [P]: "2" }, project: { [P]: "2" } }), []);
  assert.deepEqual(plan({ next: { [P]: "2" }, project: { [P]: "2" } }), []);
});

test("template did not change the file: local edits stay and are not reported", () => {
  assert.deepEqual(plan({ old: { [P]: "1" }, next: { [P]: "1" }, project: { [P]: "mine" } }), []);
});

test("template did not change the file: a locally deleted file is not resurrected", () => {
  assert.deepEqual(plan({ old: { [P]: "1" }, next: { [P]: "1" } }), []);
});

test("new file absent from project and old is an add", () => {
  assert.deepEqual(plan({ next: { [P]: "2" } }), [{ path: P, action: "add" }]);
});

test("project equals old and the template changed it is an update", () => {
  assert.deepEqual(plan({ old: { [P]: "1" }, next: { [P]: "2" }, project: { [P]: "1" } }), [{ path: P, action: "update" }]);
});

test("project edited a file the template also changed is a conflict", () => {
  assert.deepEqual(plan({ old: { [P]: "1" }, next: { [P]: "2" }, project: { [P]: "mine" } }), [{ path: P, action: "update", reason: "edited locally" }]);
});

test("project deleted a file the template changed is a conflict that force would add back", () => {
  assert.deepEqual(plan({ old: { [P]: "1" }, next: { [P]: "2" } }), [{ path: P, action: "add", reason: "deleted locally" }]);
});

test("a file in the project but not in old that differs from new is a conflict", () => {
  assert.deepEqual(plan({ next: { [P]: "2" }, project: { [P]: "mine" } }), [
    { path: P, action: "update", reason: "exists locally but not in your base version" },
  ]);
});

test("removed by the template and unedited is a delete", () => {
  assert.deepEqual(plan({ old: { [P]: "1" }, project: { [P]: "1" } }), [{ path: P, action: "delete" }]);
});

test("removed by the template but edited locally is a conflict that force would delete", () => {
  assert.deepEqual(plan({ old: { [P]: "1" }, project: { [P]: "mine" } }), [
    { path: P, action: "delete", reason: "removed by the template, edited locally" },
  ]);
});

test("removed by the template and already absent from the project: nothing", () => {
  assert.deepEqual(plan({ old: { [P]: "1" } }), []);
});

test("paths outside the agentic layer are never planned", () => {
  const next = { "src/app.js": "1", "CLAUDE.md": "1", "scripts/release.mjs": "1", "template.json": "1" };
  assert.deepEqual(plan({ old: { "src/old.js": "1" }, next }), []);
});

test("ownership comes from the new tree's layers, or the old tree's for removed files", () => {
  const oldLayers = { agentic: { paths: ["scripts/**", "legacy/**"] } };
  const newLayers = { agentic: { paths: ["scripts/**"] } };
  const got = plan({
    oldLayers,
    newLayers,
    old: { "legacy/gone.txt": "1", "legacy/kept.txt": "1" },
    next: { "legacy/kept.txt": "2" },
    project: { "legacy/gone.txt": "1", "legacy/kept.txt": "1" },
  });
  assert.deepEqual(got, [{ path: "legacy/gone.txt", action: "delete" }]);
});

test("a tree without an agentic layer puts nothing in scope", () => {
  assert.deepEqual(plan({ next: { [P]: "2" }, newLayers: {} }), []);
});

test("a CRLF-converted project file is a conflict, not an update", () => {
  assert.deepEqual(plan({ old: { [P]: "a\nb\n" }, next: { [P]: "a\nc\n" }, project: { [P]: "a\r\nb\r\n" } }), [
    { path: P, action: "update", reason: "edited locally" },
  ]);
});

test("files that exist only in the project are never in the result", () => {
  assert.deepEqual(plan({ old: { [P]: "1" }, next: { [P]: "1" }, project: { [P]: "1", "scripts/mine.mjs": "x" } }), []);
});

test("the result is sorted by path", () => {
  const got = plan({ next: { "scripts/b.mjs": "1", "scripts/a.mjs": "1", "layers.json": "1" } });
  assert.deepEqual(got.map((i) => i.path), ["layers.json", "scripts/a.mjs", "scripts/b.mjs"]);
});
