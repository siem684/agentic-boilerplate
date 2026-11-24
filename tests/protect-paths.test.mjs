import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HOOK = fileURLToPath(new URL("../.claude/hooks/protect-paths.mjs", import.meta.url));
const SETTINGS = fileURLToPath(new URL("../.claude/settings.json", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "protect-paths-test-"));

const run = (tool_name, tool_input) =>
  spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name, tool_input }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: "utf8",
  });
const blocked = (r) => r.status === 2 && /protected path/.test(r.stderr);
const allowed = (r) => r.status === 0 && r.stderr === "";

test("Edit and Write are blocked on every protected path", () => {
  for (const p of ["_bmad/core.md", "_bmad-output/plan.md", ".claude/settings.json", ".github/workflows/ci.yml"]) {
    assert.ok(blocked(run("Edit", { file_path: join(root, p) })), `Edit ${p}`);
    assert.ok(blocked(run("Write", { file_path: p })), `Write ${p}`);
  }
});

test("ordinary paths and path-like lookalikes are allowed", () => {
  for (const p of ["src/app.mjs", "docs/adr/0001-x.md", ".github/CODEOWNERS", "claude/notes.md", "scripts/check.mjs"]) {
    assert.ok(allowed(run("Edit", { file_path: p })), p);
  }
});

test("path traversal into a protected directory is blocked", () => {
  assert.ok(blocked(run("Write", { file_path: "docs/../.claude/hooks/protect-paths.mjs" })));
});

test("matching is case-insensitive (Windows and macOS file systems)", () => {
  for (const p of [".CLAUDE/settings.json", ".Github/Workflows/ci.yml", "_BMAD/core.md"]) {
    assert.ok(blocked(run("Edit", { file_path: p })), p);
  }
});

test("NotebookEdit is checked through notebook_path", () => {
  assert.ok(blocked(run("NotebookEdit", { notebook_path: ".claude/analysis.ipynb" })));
  assert.ok(allowed(run("NotebookEdit", { notebook_path: "notebooks/analysis.ipynb" })));
});

test("Bash commands that write to a protected path are blocked", () => {
  for (const command of [
    "echo x > .claude/settings.json",
    "echo x >> ./.claude/hooks/protect-paths.mjs",
    "sed -i 's/a/b/' .claude/settings.json",
    "rm -rf .github/workflows",
    "mv _bmad/core.md /tmp/core.md",
    "cp /tmp/evil.mjs .claude/hooks/protect-paths.mjs",
    "git checkout main -- .claude/settings.json",
    "cat patch | tee _bmad-output/plan.md",
    "Set-Content -Path .CLAUDE/settings.json -Value x",
    String.raw`echo x > C:\work\app\.claude\settings.json`,
  ]) {
    assert.ok(blocked(run("Bash", { command })), command);
  }
});

test("Bash commands that only read protected paths, or write elsewhere, are allowed", () => {
  for (const command of [
    "git status",
    "cat .claude/settings.json",
    "ls .claude/hooks/",
    "cat .claude/settings.json 2>/dev/null",
    "node scripts/check.mjs 2>&1",
    "node .claude/hooks/protect-paths.mjs",
    "git checkout -b claude/issue-4-fix",
    "echo hi > out.txt",
    "rm -rf node_modules",
    "cp docs/a.md docs/b.md",
  ]) {
    assert.ok(allowed(run("Bash", { command })), command);
  }
});

test("malformed or empty hook input does not block", () => {
  const r = spawnSync(process.execPath, [HOOK], { input: "not json", encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.ok(allowed(run("Edit", {})));
});

test("settings.json runs the hook for every tool the hook understands", () => {
  const { hooks } = JSON.parse(readFileSync(SETTINGS, "utf8"));
  const entry = hooks.PreToolUse.find((h) => h.hooks.some((x) => x.command.includes("protect-paths.mjs")));
  const matcher = new RegExp(`^(?:${entry.matcher})$`);
  for (const tool of ["Edit", "Write", "MultiEdit", "NotebookEdit", "Bash"]) {
    assert.match(tool, matcher);
  }
});

test("cleanup", () => rmSync(root, { recursive: true, force: true }));
