import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT = fileURLToPath(new URL("../scripts/telemetry.mjs", import.meta.url));

function run(content, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), "telemetry-test-"));
  const file = join(dir, "exec.json");
  writeFileSync(file, content);
  return spawnSync(process.execPath, [SCRIPT, file, "dev"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, GITHUB_STEP_SUMMARY: "", GITHUB_OUTPUT: "", ...env },
  });
}

test("a truncated execution file is a warning, not a crash", () => {
  const r = run('[{"type":"resu');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /::warning::/);
  assert.doesNotMatch(r.stderr, /SyntaxError/);
});

test("a cost above the cap still fails the step", () => {
  const r = run(JSON.stringify([{ type: "result", total_cost_usd: 9 }]), { MAX_COST_USD: "5" });
  assert.equal(r.status, 1);
});
