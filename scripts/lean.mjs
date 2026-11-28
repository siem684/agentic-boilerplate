#!/usr/bin/env node
// lean.mjs: choose which plugins, claude.ai connectors, MCP servers, skills and built-in
// tools load in this project, per item, with a keep/off recommendation for each (issue #18).
// The choices go to the developer's own .claude/settings.local.json (gitignored, never
// touched by sync). Nothing else is written; user-level files are only read.
//
//   node scripts/run.mjs lean [--lean recommended|off] [--inventory <file>] [--home <dir>] [--root <dir>]
//
// Without --lean and on a terminal: one screen per group, then a confirmation.
// --lean recommended applies the recommendations without asking; --lean off writes nothing.
// Without --lean and without a terminal (CI) the step is skipped.
// The inventory comes from `claude -p /context --setting-sources user` (or --inventory <file>);
// when that cannot be read, from disk: user plugins, MCP servers, user skills.
// Exit codes: 0 done or skipped, 2 failure (bad flag, invalid JSON in settings.local.json).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import {
  GROUP_LABELS, INTRO, answerGroup, applyChoices, buildItems, currentOff, formatTokens, parseAnswer,
  parseContext, recommendedOff, renderGroup, summarize,
} from "./lean-plan.mjs";

const USAGE = "Usage: lean.mjs [--lean recommended|off] [--inventory <file>] [--home <dir>] [--root <dir>]";
const LOCAL = ".claude/settings.local.json";
const UNDO = `To change this, run: node scripts/run.mjs lean (or delete ${LOCAL})`;

function fail(message) {
  console.error(message);
  process.exit(2);
}

const opts = {};
const args = process.argv.slice(2);
while (args.length) {
  const flag = args.shift();
  const key = { "--lean": "lean", "--inventory": "inventory", "--home": "home", "--root": "root" }[flag];
  if (!key || !args.length) fail(`${key ? `${flag} needs a value` : `unknown flag ${flag}`}\n${USAGE}`);
  opts[key] = args.shift();
}
if (opts.lean && !["recommended", "off"].includes(opts.lean)) fail(`--lean must be recommended or off\n${USAGE}`);
const root = resolve(opts.root ?? process.cwd());
const home = resolve(opts.home ?? homedir());

if (opts.lean === "off") {
  console.log("lean: skipped (--lean off); nothing written.");
  process.exit(0);
}
const interactive = !opts.lean;
if (interactive && !(process.stdin.isTTY && process.stdout.isTTY)) {
  console.log("lean: skipped (no terminal); run `node scripts/run.mjs lean` to choose what loads in this project.");
  process.exit(0);
}

// A JSON file, or `fallback` when it is missing. Invalid JSON is a warning here; the
// developer's own settings.local.json is checked separately and strictly.
function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.warn(`warning: could not read ${file}: ${e.message}`);
    return fallback;
  }
}

const localFile = join(root, LOCAL);
let existing = {};
if (existsSync(localFile)) {
  try {
    existing = JSON.parse(readFileSync(localFile, "utf8"));
  } catch (e) {
    fail(`${LOCAL} is not valid JSON (${e.message}); fix or delete it. Nothing was written.`);
  }
  if (!existing || typeof existing !== "object" || Array.isArray(existing)) fail(`${LOCAL} must hold a JSON object. Nothing was written.`);
}

// `claude -p /context`, with constant arguments only. Without a shell first; on Windows the
// npm .cmd shim needs one, which is safe because nothing here comes from input.
function runContext() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("CLAUDE")));
  env.MSYS_NO_PATHCONV = "1";
  const argv = ["-p", "/context", "--setting-sources", "user"];
  const options = { cwd: root, env, encoding: "utf8", timeout: 120_000, windowsHide: true };
  let r = spawnSync("claude", argv, options);
  if (process.platform === "win32" && ["ENOENT", "EINVAL"].includes(r.error?.code)) {
    r = spawnSync(`claude ${argv.join(" ")}`, { ...options, shell: true });
  }
  return r.error || r.status !== 0 ? "" : r.stdout;
}

// What can be found without `claude`: MCP servers from ~/.claude.json and .mcp.json, and the
// user's own skill directories. Plugins come from the user settings either way.
function diskInventory() {
  const names = new Set([
    ...Object.keys(readJson(join(home, ".claude.json"), {})?.mcpServers ?? {}),
    ...Object.keys(readJson(join(root, ".mcp.json"), {})?.mcpServers ?? {}),
  ]);
  const skillsDir = join(home, ".claude", "skills");
  const skills = existsSync(skillsDir)
    ? readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => ({ name: d.name, source: "user", tokens: null }))
    : [];
  return { skills, servers: [...names].map((name) => ({ name, tokens: null })) };
}

const text = opts.inventory ? readFileSync(resolve(opts.inventory), "utf8") : runContext();
let context = parseContext(text);
if (!context) {
  console.warn("warning: could not read /context; claude.ai connectors and account skills are not listed");
  context = diskInventory();
}
const userSettings = readJson(join(home, ".claude", "settings.json"), {});
const userPlugins = Object.entries(userSettings?.enabledPlugins ?? {}).filter(([, on]) => on === true).map(([id]) => id);
const catalog = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "lean-catalog.json"), "utf8"));
const items = buildItems({ context, userPlugins, catalog });

const now = currentOff(existing, items);
const before = now ?? new Set();
let after = interactive ? now ?? recommendedOff(items) : recommendedOff(items);

const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : null;
async function ask(question) {
  try {
    return await rl.question(question);
  } catch {
    console.log("\nCancelled; nothing written.");
    process.exit(0);
  }
}
rl?.on("SIGINT", () => {
  console.log("\nCancelled; nothing written.");
  process.exit(0);
});

if (interactive) {
  console.log(`\n${INTRO}`);
  for (const group of Object.keys(GROUP_LABELS)) {
    const list = items.filter((i) => i.group === group);
    if (!list.length) continue;
    const count = list.filter((i) => i.switchable).length;
    for (;;) {
      console.log(`\n${renderGroup(group, items, after)}`);
      if (!count) break;
      const answer = parseAnswer(await ask("> "), count);
      if (answer.action === "accept") break;
      if (answer.action === "invalid") console.log(`Not understood. Type numbers from 1 to ${count}, a, n, or press Enter.`);
      after = answerGroup(answer, group, items, after);
    }
  }
}

const { turnedOff, turnedOn, tokensSaved } = summarize(before, after, items);
const label = (i) => `  - ${i.name} (${GROUP_LABELS[i.group]})`;
function printChanges() {
  if (!turnedOff.length && !turnedOn.length) console.log("No changes.");
  if (turnedOff.length) console.log(["Turned off:", ...turnedOff.map(label)].join("\n"));
  if (turnedOn.length) console.log(["Turned back on:", ...turnedOn.map(label)].join("\n"));
  if (tokensSaved) {
    console.log(`/context lists ${formatTokens(tokensSaved)} tokens for what was turned off (MCP tools mostly load on demand, so the saving per session is smaller).`);
  }
}

const next = applyChoices(existing, items, after);
const content = `${JSON.stringify(next, null, 2)}\n`;
if (!existsSync(localFile) && !Object.keys(next).length) {
  printChanges();
  console.log(`Nothing is turned off, so ${LOCAL} was not created.`);
  rl?.close();
  process.exit(0);
}
if (!turnedOff.length && !turnedOn.length && existsSync(localFile) && readFileSync(localFile, "utf8") === content) {
  console.log(`\nNo changes; ${LOCAL} is up to date.`);
  rl?.close();
  console.log(UNDO);
  process.exit(0);
}

if (interactive) {
  console.log("");
  printChanges();
  const yes = (await ask(`Write ${LOCAL}? [Y/n] `)).trim().toLowerCase();
  rl.close();
  if (yes && yes !== "y" && yes !== "yes") {
    console.log("Nothing written.");
    process.exit(0);
  }
}

mkdirSync(dirname(localFile), { recursive: true });
writeFileSync(localFile, content);
console.log(`\nWrote ${LOCAL}.`);
if (!interactive) printChanges();
console.log(UNDO);
