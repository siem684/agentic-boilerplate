import { test } from "node:test";
import assert from "node:assert/strict";
import { validateInputs, ownerExists } from "../scripts/validate.mjs";

const OK = { PROJECT_NAME: "Demo", PROJECT_DESCRIPTION: "A demo app.", OWNER: "@acme", CHECK_COMMANDS: "npm test" };
const errorsFor = (over) => validateInputs({ ...OK, ...over });

test("valid inputs produce no errors, for a user and for an org team", () => {
  assert.deepEqual(validateInputs(OK), []);
  assert.deepEqual(errorsFor({ OWNER: "@acme/core-team" }), []);
});

test("name: rejects blank, multi-line, over-long and placeholder-like values", () => {
  assert.match(errorsFor({ PROJECT_NAME: "   " }).join(), /--name/);
  assert.match(errorsFor({ PROJECT_NAME: "a\nb" }).join(), /--name/);
  assert.match(errorsFor({ PROJECT_NAME: "x".repeat(101) }).join(), /--name/);
  assert.match(errorsFor({ PROJECT_NAME: "{{OWNER}}" }).join(), /--name/);
});

test("description: rejects blank, multi-line and over-long values", () => {
  assert.match(errorsFor({ PROJECT_DESCRIPTION: " " }).join(), /--description/);
  assert.match(errorsFor({ PROJECT_DESCRIPTION: "a\nb" }).join(), /--description/);
  assert.match(errorsFor({ PROJECT_DESCRIPTION: "x".repeat(301) }).join(), /--description/);
});

test("owner: must be @user or @org/team", () => {
  for (const bad of ["acme", "@", "@me", "@-acme", "@ac me", "@acme/", "@acme/a/b", "@acme-", "@a--b"]) {
    assert.match(errorsFor({ OWNER: bad }).join(), /--owner/, bad);
  }
});

test("owner: @me gets a hint to use a real handle", () => {
  assert.match(errorsFor({ OWNER: "@me" }).join(), /real GitHub/i);
});

test("all problems are reported at once", () => {
  const e = errorsFor({ PROJECT_NAME: "", OWNER: "nope" });
  assert.equal(e.length, 2);
});

test("ownerExists asks GitHub for the user (or the org of a team)", () => {
  const calls = [];
  const gh = (a) => (calls.push(a), { status: 0 });
  assert.equal(ownerExists("@acme", gh), true);
  assert.equal(ownerExists("@acme/core", gh), true);
  assert.deepEqual(calls, [["api", "users/acme"], ["api", "users/acme"]]);
});

test("ownerExists is false on a 404 and unknown (null) when GitHub cannot be asked", () => {
  assert.equal(ownerExists("@ghost", () => ({ status: 1, stderr: "gh: Not Found (HTTP 404)" })), false);
  assert.equal(ownerExists("@acme", () => ({ status: 1, stderr: "gh auth login required" })), null);
  assert.equal(ownerExists("@acme", () => ({ error: new Error("ENOENT"), status: null })), null);
});
