import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../../scripts/staleness.mjs", import.meta.url));
const execFileP = promisify(execFile);
const SHA = "a".repeat(40);

const CHANGELOG = `# Changelog

## [Unreleased]
- Not released yet.

## [0.3.0] - 2026-12-01
### Agentic layer
- Added the sync script.

**Action required:** run sync.

## [0.2.0] - 2026-11-28
### Agentic layer
- Tightened the hook.

**Action required:** review the hook.

## [0.1.0] - 2026-11-24
First release.

**Action required:** none (first release).
`;

const COMPARE = {
  files: [
    { filename: ".claude/agents/fixer.md" },
    { filename: "scripts/check.mjs" },
    { filename: "scripts/release.mjs" },
    { filename: "docs/adr/0001.md" },
    { filename: "CHANGELOG.md" },
  ],
};

// A stub of the four services staleness.mjs talks to. Requests are recorded per path.
let server;
let base;
let routes;
let seen;
const json = (body, status = 200, headers = {}) => ({ status, body: JSON.stringify(body), headers });
const text = (body, status = 200) => ({ status, body, headers: {} });

function defaultRoutes() {
  return {
    "/gh/repos/acme/tpl/releases/latest": json({ tag_name: "v0.3.0" }),
    "/gh/repos/acme/tpl/contents/CHANGELOG.md": text(CHANGELOG),
    "/gh/repos/acme/tpl/compare/v0.1.0...v0.3.0": json(COMPARE),
    "/npm/bmad-method/latest": json({ version: "6.13.0" }),
    "/pypi/pypi/graphifyy/json": json({ info: { version: "0.9.1" } }),
    "/gh/repos/actions/checkout/releases/latest": json({ tag_name: "v6.0.0" }),
    "/gh/repos/actions/setup-node/releases/latest": json({ tag_name: "v5.0.1" }),
    "/gh/repos/actions/upload-artifact/releases/latest": json({ tag_name: "v4.6.2" }),
    "/gh/repos/anthropics/claude-code-action/releases/latest": json({ tag_name: "v1.0.20" }),
  };
}

before(async () => {
  server = http.createServer((req, res) => {
    const path = new URL(req.url, "http://x").pathname;
    seen.push({ path, auth: req.headers.authorization });
    const r = routes[path];
    if (!r) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(r.status, { "content-type": "application/json", ...r.headers }).end(r.body);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

function project({ lock = { based_on: "0.1.0", repo: "acme/tpl" }, bmad = "6.12.0", extraWorkflow = "" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "staleness-test-"));
  if (lock) writeFileSync(join(root, "boilerplate.lock"), JSON.stringify(lock));
  writeFileSync(
    join(root, "vendor.json"),
    JSON.stringify({
      schemaVersion: 1,
      components: {
        bmad: { version: bmad, source: { type: "npm", package: "bmad-method" }, install: "x", detect: { file: "x", pattern: "(x)" } },
        graphify: {
          version: "0.9.1",
          source: { type: "pypi", package: "graphifyy", repo: "https://github.com/Graphify-Labs/graphify" },
          install: "x",
          detect: { file: "x", pattern: "(x)" },
        },
      },
    })
  );
  writeFileSync(
    join(root, "layers.json"),
    JSON.stringify({
      layers: { agentic: { paths: [".claude/agents/**", "scripts/**"], exclude: ["scripts/release.mjs"] } },
    })
  );
  mkdirSync(join(root, ".github/workflows"), { recursive: true });
  writeFileSync(
    join(root, ".github/workflows/ci.yml"),
    [
      "jobs:",
      "  a:",
      "    steps:",
      `      - uses: actions/checkout@${SHA} # v5`,
      `      - uses: actions/setup-node@${SHA} # v5`,
      `      - uses: anthropics/claude-code-action@${SHA} # v1`,
      `      - uses: actions/upload-artifact@${SHA}`,
      "      - uses: ./.github/actions/local",
      "      - run: echo hi",
      "",
    ].join("\n")
  );
  writeFileSync(
    join(root, ".github/workflows/claude.yml"),
    `jobs:\n  b:\n    steps:\n      - uses: actions/checkout@${SHA} # v5\n${extraWorkflow}`
  );
  return root;
}

// Async on purpose: the stub server lives in this process and must keep answering.
async function run(root, { env = {}, baseUrl = base } = {}) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(GH|GITHUB)_TOKEN$/.test(k)));
  try {
    const r = await execFileP(process.execPath, [SCRIPT, "--root", root], {
      encoding: "utf8",
      env: {
        ...clean,
        GH_TOKEN: "test-token", // keeps the script from calling the real `gh`
        STALENESS_GITHUB_API: `${baseUrl}/gh`,
        STALENESS_NPM_REGISTRY: `${baseUrl}/npm`,
        STALENESS_PYPI: `${baseUrl}/pypi`,
        ...env,
      },
    });
    return { status: 0, stdout: r.stdout, stderr: r.stderr };
  } catch (e) {
    return { status: e.code, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}
const fresh = () => {
  routes = defaultRoutes();
  seen = [];
};
const snapshot = (root) => {
  const out = {};
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else out[p] = readFileSync(p, "utf8");
    }
  };
  walk(root);
  return out;
};

test("an outdated template is reported with the changelog entries between the versions", async () => {
  fresh();
  const root = project();
  const r = await run(root);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /template\s+0\.1\.0 -> 0\.3\.0\s+OUTDATED/);
  assert.match(r.stdout, /0\.3\.0[^\n]*\n[\s\S]*Added the sync script/);
  assert.match(r.stdout, /Action required: run sync\./);
  assert.match(r.stdout, /0\.2\.0/);
  assert.match(r.stdout, /Action required: review the hook\./);
  assert.doesNotMatch(r.stdout, /First release/, "the installed version's own entry is not a change");
  assert.doesNotMatch(r.stdout, /Not released yet/);
  rmSync(root, { recursive: true });
});

test("the template report lists the changed agentic-layer files and a compare link", async () => {
  fresh();
  const root = project();
  const r = await run(root);
  assert.match(r.stdout, /\.claude\/agents\/fixer\.md/);
  assert.match(r.stdout, /scripts\/check\.mjs/);
  assert.doesNotMatch(r.stdout, /scripts\/release\.mjs/, "excluded from the agentic layer");
  assert.doesNotMatch(r.stdout, /docs\/adr\/0001\.md/, "project-owned");
  assert.doesNotMatch(r.stdout, /CHANGELOG\.md/);
  assert.match(r.stdout, /https:\/\/github\.com\/acme\/tpl\/compare\/v0\.1\.0\.\.\.v0\.3\.0/);
  rmSync(root, { recursive: true });
});

test("outdated BMAD is reported with a link to where its changes are", async () => {
  fresh();
  const root = project();
  const r = await run(root);
  assert.match(r.stdout, /bmad\s+6\.12\.0 -> 6\.13\.0\s+OUTDATED/);
  assert.match(r.stdout, /https:\/\/www\.npmjs\.com\/package\/bmad-method\?activeTab=versions/);
  rmSync(root, { recursive: true });
});

test("a current component says so, and links to upstream releases when it has a repo", async () => {
  fresh();
  const root = project();
  const r = await run(root);
  assert.match(r.stdout, /graphify\s+0\.9\.1\s+up to date/);
  rmSync(root, { recursive: true });
});

test("an outdated graphify links to the releases page of its repo", async () => {
  fresh();
  routes["/pypi/pypi/graphifyy/json"] = json({ info: { version: "0.10.0" } });
  const root = project();
  const r = await run(root);
  assert.match(r.stdout, /graphify\s+0\.9\.1 -> 0\.10\.0\s+OUTDATED/);
  assert.match(r.stdout, /https:\/\/github\.com\/Graphify-Labs\/graphify\/releases/);
  rmSync(root, { recursive: true });
});

test("GitHub Actions pinned by SHA are compared through their version comment, once each", async () => {
  fresh();
  const root = project();
  const r = await run(root);
  assert.match(r.stdout, /actions\/checkout\s+v5 -> v6\.0\.0\s+OUTDATED/);
  assert.match(r.stdout, /https:\/\/github\.com\/actions\/checkout\/releases/);
  assert.match(r.stdout, /actions\/setup-node\s+v5\s+up to date/, "v5 comment, latest v5.0.1: same major");
  assert.match(r.stdout, /anthropics\/claude-code-action\s+v1\s+up to date/);
  assert.equal(r.stdout.match(/actions\/checkout\s/g).length, 1, "used in two workflows, reported once");
  assert.doesNotMatch(r.stdout, /local/, "local actions are not external dependencies");
  rmSync(root, { recursive: true });
});

test("an action pinned by SHA without a version comment is noted, not compared", async () => {
  fresh();
  const root = project();
  const r = await run(root);
  assert.match(r.stdout, /actions\/upload-artifact[^\n]*no version comment/);
  rmSync(root, { recursive: true });
});

test("model IDs are not checked, and the report says where to look", async () => {
  fresh();
  const root = project();
  const r = await run(root);
  assert.match(r.stdout, /models[^\n]*ADR 0002/i);
  rmSync(root, { recursive: true });
});

test("everything current: exit 0, and no changelog or compare request is made", async () => {
  fresh();
  routes["/gh/repos/acme/tpl/releases/latest"] = json({ tag_name: "v0.1.0" });
  routes["/npm/bmad-method/latest"] = json({ version: "6.12.0" });
  routes["/gh/repos/actions/checkout/releases/latest"] = json({ tag_name: "v5.2.0" });
  const root = project();
  const r = await run(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /template\s+0\.1\.0\s+up to date/);
  assert.match(r.stdout, /Everything is up to date/);
  assert.equal(seen.filter((s) => /contents|compare/.test(s.path)).length, 0);
  rmSync(root, { recursive: true });
});

test("the project is not modified", async () => {
  fresh();
  const root = project();
  const before = snapshot(root);
  await run(root);
  assert.deepEqual(snapshot(root), before);
  rmSync(root, { recursive: true });
});

test("a failing lookup is reported for that component only, and exits 2", async () => {
  fresh();
  routes["/npm/bmad-method/latest"] = text("boom", 500);
  const root = project();
  const r = await run(root);
  assert.equal(r.status, 2, "a failed check takes precedence over outdated");
  assert.match(r.stdout, /bmad\s+could not check/);
  assert.match(r.stdout, /template\s+0\.1\.0 -> 0\.3\.0\s+OUTDATED/, "the other components are still reported");
  rmSync(root, { recursive: true });
});

test("offline: every component says it could not be checked, with no stack trace", async () => {
  fresh();
  const dead = http.createServer();
  await new Promise((ok) => dead.listen(0, "127.0.0.1", ok));
  const deadBase = `http://127.0.0.1:${dead.address().port}`;
  await new Promise((ok) => dead.close(ok));
  const root = project();
  const r = await run(root, { baseUrl: deadBase });
  assert.equal(r.status, 2);
  for (const name of ["template", "bmad", "graphify", "actions/checkout"]) {
    assert.match(r.stdout, new RegExp(`${name}\\s+could not check`), name);
  }
  assert.doesNotMatch(r.stdout + r.stderr, /TypeError|\n\s+at /);
  rmSync(root, { recursive: true });
});

test("a GitHub rate limit is explained, with the way out", async () => {
  fresh();
  routes["/gh/repos/acme/tpl/releases/latest"] = json({ message: "rate limit exceeded" }, 403, { "x-ratelimit-remaining": "0" });
  const root = project();
  const r = await run(root);
  assert.equal(r.status, 2);
  assert.match(r.stdout, /rate limit/i);
  assert.match(r.stdout, /GH_TOKEN/);
  rmSync(root, { recursive: true });
});

test("the GitHub token goes to the GitHub API and nowhere else", async () => {
  fresh();
  const root = project();
  await run(root, { env: { GH_TOKEN: "s3cret" } });
  const gh = seen.filter((s) => s.path.startsWith("/gh/"));
  const other = seen.filter((s) => !s.path.startsWith("/gh/"));
  assert.ok(gh.length > 0 && other.length > 0);
  assert.ok(gh.every((s) => s.auth === "Bearer s3cret"), "GitHub requests carry the token");
  assert.ok(other.every((s) => s.auth === undefined), "npm and PyPI requests do not");
  rmSync(root, { recursive: true });
});

test("works anonymously when there is no token and no gh on the PATH", async () => {
  fresh();
  const root = project();
  const empty = mkdtempSync(join(tmpdir(), "staleness-nopath-"));
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toLowerCase() !== "path" && !/^(GH|GITHUB)_TOKEN$/.test(k)));
  const r = await execFileP(process.execPath, [SCRIPT, "--root", root], {
    encoding: "utf8",
    env: {
      ...env,
      PATH: empty,
      STALENESS_GITHUB_API: `${base}/gh`,
      STALENESS_NPM_REGISTRY: `${base}/npm`,
      STALENESS_PYPI: `${base}/pypi`,
    },
  }).catch((e) => e);
  assert.equal(r.code, 1, "outdated, not a crash");
  assert.match(r.stdout, /template\s+0\.1\.0 -> 0\.3\.0\s+OUTDATED/);
  assert.ok(seen.filter((s) => s.path.startsWith("/gh/")).every((s) => s.auth === undefined));
  rmSync(root, { recursive: true });
});

test("without boilerplate.lock the template is untracked, which is not a failure", async () => {
  fresh();
  routes["/npm/bmad-method/latest"] = json({ version: "6.12.0" });
  routes["/gh/repos/actions/checkout/releases/latest"] = json({ tag_name: "v5.2.0" });
  const root = project({ lock: null });
  const r = await run(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /template\s+no boilerplate\.lock/);
  rmSync(root, { recursive: true });
});

test("in the template itself (template.json, no lock) the template line says so", async () => {
  fresh();
  routes["/npm/bmad-method/latest"] = json({ version: "6.12.0" });
  routes["/gh/repos/actions/checkout/releases/latest"] = json({ tag_name: "v5.2.0" });
  const root = project({ lock: null });
  writeFileSync(join(root, "template.json"), JSON.stringify({ version: "0.2.0", repo: "acme/tpl" }));
  const r = await run(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /template\s+this is the template/);
  rmSync(root, { recursive: true });
});
