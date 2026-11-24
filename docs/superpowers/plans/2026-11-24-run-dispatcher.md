# Command index and dispatcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `node scripts/run.mjs` lists every runnable script grouped by audience, shows per-command help, and runs a command as a shorthand for `node scripts/<name>.mjs`.

**Architecture:** `scripts/commands.json` is the single source of truth (summary, audience, flags, exit codes, example per command). `scripts/run.mjs` reads it, prints the overview or help, or starts the matching script with the caller's flags and cwd and returns its exit code. A test keeps the JSON and the `scripts/` directory in sync.

**Tech Stack:** Node 22 ESM (`.mjs`), `node:test`, no dependencies. Style follows the existing scripts (double quotes, header comment with usage).

**Spec:** `docs/superpowers/specs/2026-11-24-run-dispatcher-design.md`

## Global Constraints

- No root `package.json`, no new dependencies (spec non-goals).
- Dispatcher and data live in `scripts/` (agentic layer, synced); `layers.json` is not changed.
- CI and hooks keep calling scripts directly; `.github/workflows/` and `.claude/` are protected paths and are not edited.
- `commands.json` is the single source of truth; no parsing of script headers.
- Exit code of `run.mjs <name>` equals the child's exit code; unknown name exits 1.
- `tests/release.test.mjs` and `tests/agents.test.mjs` are template-only, and so is `scripts/release.mjs`: `commands.json` and `run.mjs` must keep working in a spawned project where `release.mjs` is absent.
- Code, comments, commit messages and docs are in English. Keep the diff small.

## Review Focus

- A name like `../init`, `__proto__`, `constructor` or an empty string must not run anything: exit 1 with the overview.
- A command whose script file is absent (the `release` entry in a spawned project) is hidden from the overview, and `run.mjs release` exits 1 with a clear message instead of a Node stack trace.
- A child killed by a signal (exit status `null`) must not become exit 0.
- Run from another working directory, relative `--root` paths still resolve against the caller's cwd (inherited), not the `scripts/` directory.
- `run.mjs --help`, `-h`, `help` and `run.mjs <name> --help` show help instead of running the script.

---

### Task 1: commands.json and the overview/help output

**Files:**
- Create: `scripts/commands.json`
- Create: `scripts/run.mjs`
- Test: `tests/run.test.mjs`

**Interfaces:**
- Produces `scripts/commands.json`, shape:
  `{ "schemaVersion": 1, "notCommands": string[], "audiences": { [key]: label }, "commands": { [name]: { summary: string, audience: key, flags: { flag: string, description: string }[], exitCodes: { code: number, meaning: string }[], example: string, templateOnly?: true } } }`
  - `notCommands` = `["run", "layers", "validate", "placeholders"]` (scripts that are libraries or the dispatcher itself).
  - `audiences` keys in display order: `you` ("Run by you"), `automated` ("Run by CI or hooks, not for manual use"), `template-maintainer` ("Template maintainers only").
  - Commands, with audience: `init`, `check`, `vendor`, `staleness` → `you`; `trim-skills`, `telemetry` → `automated`; `release` → `template-maintainer` with `"templateOnly": true`.
  - Read each script's header comment for the real flags, exit codes and an example. `--root <dir>` and `--offline` belong in `flags` wherever the script accepts them.
- Produces `run.mjs` behaviour: no args, `--help` or `-h` print the overview and exit 0; `help <name>` prints one command's entry and exits 0, an unknown or missing-script name exits 1. The module has no exports; it is a CLI.

- [ ] **Step 1: Write the failing tests** in `tests/run.test.mjs` (same helper style as `tests/vendor.test.mjs`: `SCRIPT = fileURLToPath(new URL("../scripts/run.mjs", import.meta.url))`, `spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" })`):
  - `commands.json matches the scripts directory`: every `scripts/*.mjs` whose basename is not in `notCommands` has an entry; every entry without `templateOnly` has a file; every `notCommands` item has a file; every entry has a non-empty `summary`, an `audience` that exists in `audiences`, and an `example` that starts with `node scripts/`.
  - `no arguments lists every available command grouped by audience`: exit 0, stdout contains each audience label and each command name, labels appear in the order of `audiences`.
  - `-h and --help are the same as no arguments` (exit 0, identical stdout).
  - `help <name> shows summary, flags, exit codes and example`: for `staleness`, stdout contains its summary, every flag string, every exit code meaning and the example.
  - `help with an unknown name exits 1 and shows the overview`: `help nope`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/run.test.mjs`
Expected: FAIL (`scripts/commands.json` / `scripts/run.mjs` missing).

- [ ] **Step 3: Create `scripts/commands.json`** with the schema above and entries for all seven current commands, filled from the script headers. The summaries are one line each, no trailing period.

- [ ] **Step 4: Create `scripts/run.mjs`.** Header comment in the style of the other scripts (purpose, usage block with the four invocations, note that it never interprets `--root`). Load `commands.json` from the dispatcher's own directory (`new URL("./commands.json", import.meta.url)`). A command is *available* when its script file exists next to `run.mjs`. Overview: usage line, then per audience (in `audiences` order, skipping empty groups) the label and an aligned `name  summary` list of available commands, then a hint line `node scripts/run.mjs help <command>` for details. `help <name>` prints summary, example, flags and exit codes of one available command.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/run.test.mjs`
Expected: PASS (all five).

- [ ] **Step 6: Commit**

```bash
git add scripts/commands.json scripts/run.mjs tests/run.test.mjs
git commit -m "Add run.mjs command index with per-command help"
```

---

### Task 2: dispatching a command

**Files:**
- Modify: `scripts/run.mjs`
- Test: `tests/run.test.mjs`

**Interfaces:**
- Consumes: the available-command lookup from Task 1 (`Object.hasOwn(commands, name)` plus the script file existing).
- Produces: `run.mjs <name> [args...]` starts `process.execPath scripts/<name>.mjs ...args` with `stdio: "inherit"` and the caller's cwd, then exits with the child's status (`1` when the status is `null`). `run.mjs <name> --help|-h` shows that command's help instead of running it.

- [ ] **Step 1: Write the failing tests** in `tests/run.test.mjs`. Reuse the `setup()` idea from `tests/vendor.test.mjs` (temp dir with a `vendor.json` whose component is not installed) and run the dispatcher against the real `vendor` script:
  - `runs the script and passes flags through`: `vendor list --root <tmp>` exits 0 and prints the component name.
  - `returns the exit code of the script`: `vendor verify --root <tmp>` (component missing) exits 1, and the stdout/stderr equals what `node scripts/vendor.mjs verify --root <tmp>` prints.
  - `a relative --root resolves against the caller's cwd`: spawn with `cwd: <tmp parent>` and `--root <tmp basename>`; exit 0 for `vendor list`.
  - `a command name is not a path`: for each of `../init`, `__proto__`, `constructor`, `""`: exit 1, stdout lists the commands, nothing was run (no `init` output such as "--name").
  - `help flag on a command shows help instead of running`: `vendor --help` exits 0 and prints the vendor summary, and does not print a vendor `list` result (run against `--root <tmp>` after the `--help`).
  - `an entry without a script file exits 1 with a message`: copy `scripts/run.mjs` and `scripts/commands.json` to a temp `scripts/` dir (no other scripts) and run `release` from it; exit 1, stderr names the command, no `Error:` stack trace.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/run.test.mjs`
Expected: the six new tests FAIL (a command name is not dispatched yet); Task 1's tests still pass.

- [ ] **Step 3: Implement dispatch in `scripts/run.mjs`.** Resolve the name with `Object.hasOwn`, reject unknown names with the overview and exit 1, reject entries whose script is missing with `run: "<name>" is not available here` on stderr and exit 1, use `spawnSync` with `stdio: "inherit"`, exit with `r.status ?? 1`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/run.test.mjs`
Expected: PASS (all eleven).

- [ ] **Step 5: Commit**

```bash
git add scripts/run.mjs tests/run.test.mjs
git commit -m "run.mjs: dispatch a command and pass flags and exit code through"
```

---

### Task 3: documentation and full check

**Files:**
- Modify: `README.md` (new "Commands" section after "Spawning a new project", before "Checking for updates")
- Modify: `CHANGELOG.md` (entry under `[Unreleased]` / `### Agentic layer`, and extend the **Action required** line)
- Modify: `docs/superpowers/specs/2026-11-24-run-dispatcher-design.md` (only if the implementation deviated; otherwise untouched)
- Test: `tests/run.test.mjs`

**Interfaces:**
- Consumes: the final CLI behaviour of Tasks 1 and 2.

- [ ] **Step 1: Write the failing test** `README links the dispatcher`: `README.md` contains `node scripts/run.mjs`.

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/run.test.mjs`
Expected: FAIL on the new test only.

- [ ] **Step 3: Write the README "Commands" section.** Short: what `node scripts/run.mjs` shows, the shorthand (`node scripts/run.mjs staleness`), `help <command>`, that CI and hooks keep calling scripts directly, and the one-line `package.json` alias a spawned Node project can add itself (`"agentic": "node scripts/run.mjs"`). Do not duplicate the command list.

- [ ] **Step 4: Add the CHANGELOG entry** (what and why in one bullet, tests named) and append to the **Action required** line: "(6) none required; `node scripts/run.mjs` is new and optional". Keep the existing numbering.

- [ ] **Step 5: Run the whole suite**

Run: `node --test "tests/**/*.test.mjs"`
Expected: all tests pass, none skipped except those that were already skipped before this branch.

- [ ] **Step 6: Commit**

```bash
git add README.md CHANGELOG.md tests/run.test.mjs docs/superpowers
git commit -m "Document run.mjs in the README and changelog"
```

---

## Self-review notes
- Spec coverage: overview, help, dispatch, JSON as source of truth, drift test, README section, automated commands marked, unknown name exit 1, layers unchanged: all covered. Two refinements to the spec, recorded in the design doc: `templateOnly` entries (so a spawned project without `release.mjs` still passes the drift test) and `-h/--help` handling.
- Not in the plan on purpose: `sync.mjs` does not exist yet; the drift test forces its `commands.json` entry when it lands.
