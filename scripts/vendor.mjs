#!/usr/bin/env node
// vendor.mjs: check external components against the versions pinned in vendor.json.
// Read-only and offline. It never installs or downloads anything; it prints the
// install command for a human to run (see docs/agentic/vendoring.md).
//
//   node scripts/vendor.mjs list
//   node scripts/vendor.mjs verify      # exit 1 if a component is missing or on another version
//
// Options: --root <dir> (default: current directory)
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const i = args.indexOf("--root");
const root = resolve(i === -1 ? process.cwd() : args.splice(i, 2)[1]);
const [cmd] = args;

const { components } = JSON.parse(readFileSync(join(root, "vendor.json"), "utf8"));

function installedVersion(c) {
  const file = join(root, c.detect.file);
  if (!existsSync(file)) return null;
  const m = readFileSync(file, "utf8").match(new RegExp(c.detect.pattern));
  return m ? m[1] : null;
}

switch (cmd) {
  case "list":
    for (const [n, c] of Object.entries(components)) {
      console.log(`${n}  ${c.version}  ${c.source.type}:${c.source.package ?? c.source.repo}`);
    }
    break;

  case "verify": {
    let bad = false;
    for (const [n, c] of Object.entries(components)) {
      const found = installedVersion(c);
      if (found === c.version) {
        console.log(`${n} ${c.version}: ok`);
        continue;
      }
      bad = true;
      console.log(
        found === null
          ? `${n}: not installed (pinned ${c.version})`
          : `${n}: installed ${found}, pinned ${c.version}`
      );
      console.log(`  fix: ${c.install}`);
    }
    process.exit(bad ? 1 : 0);
  }

  default:
    console.error("Usage: vendor.mjs list | verify");
    process.exit(1);
}
