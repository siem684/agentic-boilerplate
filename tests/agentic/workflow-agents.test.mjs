import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { actionSteps, agentOf } from "./helpers/workflow-steps.mjs";

const ROOT = new URL("../../", import.meta.url);
const WORKFLOWS = fileURLToPath(new URL(".github/workflows/", ROOT));
const AGENTS = fileURLToPath(new URL(".claude/agents/", ROOT));

test("actionSteps finds the claude-code-action steps and agentOf reads their --agent", () => {
  const yaml = [
    "jobs:",
    "  a:",
    "    steps:",
    "      - uses: actions/checkout@abc",
    "      - uses: anthropics/claude-code-action@abc # v1",
    "        with:",
    "          prompt: |",
    "            - a dash line inside the prompt",
    "          claude_args: |",
    "            --agent one-agent",
    "            --max-turns 5",
    "      - name: Named step",
    "        id: claude",
    "        uses: anthropics/claude-code-action@abc",
    "        with:",
    "          claude_args: --model x",
    "      - name: After",
    "        run: echo --agent not-this-one",
  ].join("\n");
  const steps = actionSteps(yaml);
  assert.equal(steps.length, 2);
  assert.equal(agentOf(steps[0]), "one-agent");
  assert.equal(agentOf(steps[1]), null);
});

test("every claude-code-action step in a workflow starts an agent defined in .claude/agents/", () => {
  for (const file of readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))) {
    for (const step of actionSteps(readFileSync(WORKFLOWS + file, "utf8"))) {
      const agent = agentOf(step);
      assert.ok(agent, `${file}: a claude-code-action step has no --agent. Its behaviour would be defined only by an inline prompt; put it in an agent file.`);
      assert.ok(existsSync(`${AGENTS}${agent}.md`), `${file}: --agent ${agent} has no file .claude/agents/${agent}.md`);
    }
  }
});
