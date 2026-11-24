#!/usr/bin/env node
// run.mjs: list the scripts of this project and run them by short name.
// Everything it shows comes from scripts/commands.json (tests/run.test.mjs keeps that file
// in step with the scripts directory). It does not read or interpret flags such as --root.
//
//   node scripts/run.mjs                   # overview, grouped by who runs what
//   node scripts/run.mjs help <command>    # purpose, flags, exit codes and an example
//   node scripts/run.mjs <command> [...]   # same as node scripts/<command>.mjs [...]
//
// -h and --help show the overview; `<command> --help` shows that command's help.
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
const { audiences, commands } = JSON.parse(readFileSync(dir + "commands.json", "utf8"));
const available = (name) => Object.hasOwn(commands, name) && existsSync(`${dir}${name}.mjs`);

function overview() {
  const names = Object.keys(commands).filter(available);
  const width = Math.max(...names.map((n) => n.length));
  console.log("Usage: node scripts/run.mjs <command> [flags]\n");
  for (const [key, label] of Object.entries(audiences)) {
    const group = names.filter((n) => commands[n].audience === key);
    if (!group.length) continue;
    console.log(`${label}:`);
    for (const n of group) console.log(`  ${n.padEnd(width)}  ${commands[n].summary}`);
    console.log();
  }
  console.log("Details, flags and exit codes: node scripts/run.mjs help <command>");
}

function help(name) {
  const c = commands[name];
  console.log(`${name}: ${c.summary}\n`);
  console.log(`Example:\n  ${c.example}\n`);
  console.log("Flags:");
  const width = Math.max(...c.flags.map((f) => f.flag.length));
  for (const f of c.flags) console.log(`  ${f.flag.padEnd(width)}  ${f.description}`);
  console.log("\nExit codes:");
  for (const e of c.exitCodes) console.log(`  ${e.code}  ${e.meaning}`);
}

const [first, second] = process.argv.slice(2);
const unknown = (name) => {
  const why = Object.hasOwn(commands, name) ? `"${name}" is not available here` : `unknown command "${name}"`;
  console.error(`run: ${why}\n`);
  overview();
  process.exitCode = 1;
};

if (first === undefined || first === "-h" || first === "--help" || (first === "help" && second === undefined)) {
  overview();
} else if (first === "help") {
  if (available(second)) help(second);
  else unknown(second);
} else if (!available(first)) {
  unknown(first);
} else if (second === "-h" || second === "--help") {
  help(first);
} else {
  const r = spawnSync(process.execPath, [`${dir}${first}.mjs`, ...process.argv.slice(3)], { stdio: "inherit" });
  process.exitCode = r.status ?? 1;
}
