// validate.mjs: input checks for init.mjs.
import { spawnSync } from "node:child_process";

const LOGIN = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/; // GitHub login: no leading/trailing/double hyphen
const TEAM = /^[A-Za-z0-9._-]+$/;

// Returns a list of problems (empty when everything is fine).
export function validateInputs({ PROJECT_NAME: name, PROJECT_DESCRIPTION: desc, OWNER: owner, CHECK_COMMANDS: check }) {
  const errors = [];
  const line = (flag, v, max) => {
    if (!v?.trim()) errors.push(`${flag}: must not be blank`);
    else if (/[\x00-\x1f\x7f]/.test(v)) errors.push(`${flag}: must be a single line without control characters`);
    else if (v.length > max) errors.push(`${flag}: at most ${max} characters (got ${v.length})`);
    else if (/\{\{|\}\}/.test(v)) errors.push(`${flag}: must not contain "{{" or "}}" (reserved for placeholders)`);
  };
  line("--name", name, 100);
  line("--description", desc, 300);
  line("--check", check, 300); // lands in CLAUDE.md and ci.yml: a newline there would inject workflow YAML

  if (owner === "@me") {
    errors.push("--owner: use your real GitHub handle, not @me (GitHub does not expand it in CODEOWNERS)");
  } else {
    const [login, team, ...rest] = owner?.startsWith("@") ? owner.slice(1).split("/") : [""];
    const ok = login.length <= 39 && LOGIN.test(login) && !rest.length && (team === undefined || TEAM.test(team));
    if (!ok) errors.push(`--owner: expected @user or @org/team, got "${owner}"`);
  }
  return errors;
}

const ghApi = (args) => spawnSync("gh", args, { encoding: "utf8" });

// true: exists; false: GitHub says it does not (404); null: could not find out.
// For @org/team only the org is checked: team lookups need org membership.
export function ownerExists(owner, run = ghApi) {
  const login = owner.slice(1).split("/")[0];
  const r = run(["api", `users/${login}`]);
  if (r.error) return null;
  if (r.status === 0) return true;
  return /404|Not Found/i.test(r.stderr ?? "") ? false : null;
}
