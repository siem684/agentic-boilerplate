import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT = fileURLToPath(new URL("../scripts/vendor.mjs", import.meta.url));

function setup(installedText) {
  const root = mkdtempSync(join(tmpdir(), "vendor-test-"));
  writeFileSync(
    join(root, "vendor.json"),
    JSON.stringify({
      schemaVersion: 1,
      components: {
        demo: {
          version: "1.2.3",
          source: { type: "npm", package: "demo" },
          install: "npx demo@1.2.3 install",
          detect: { file: "_demo/manifest.yaml", pattern: "version:\\s*(\\S+)" },
        },
      },
    })
  );
  if (installedText !== undefined) {
    mkdirSync(join(root, "_demo"));
    writeFileSync(join(root, "_demo/manifest.yaml"), installedText);
  }
  return root;
}
const run = (root, ...args) =>
  spawnSync(process.execPath, [SCRIPT, "--root", root, ...args], { encoding: "utf8" });

test("list prints name, pinned version and source", () => {
  const root = setup();
  const r = run(root, "list");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /demo\s+1\.2\.3\s+npm:demo/);
  rmSync(root, { recursive: true });
});

test("verify passes when installed version equals the pin", () => {
  const root = setup("installation:\n  version: 1.2.3\n");
  const r = run(root, "verify");
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /demo 1\.2\.3: ok/);
  rmSync(root, { recursive: true });
});

test("verify fails on a different installed version and prints the install command", () => {
  const root = setup("version: 1.0.0\n");
  const r = run(root, "verify");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /installed 1\.0\.0, pinned 1\.2\.3/);
  assert.match(r.stdout, /npx demo@1\.2\.3 install/);
  rmSync(root, { recursive: true });
});

test("verify fails when the component is not installed and prints the install command", () => {
  const root = setup();
  const r = run(root, "verify");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /not installed/);
  assert.match(r.stdout, /npx demo@1\.2\.3 install/);
  rmSync(root, { recursive: true });
});
