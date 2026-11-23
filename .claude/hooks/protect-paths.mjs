// PreToolUse hook: second layer behind permissions.deny for protected paths.
// Exit code 2 blocks the tool call and feeds stderr back to the model.
import { relative, resolve, sep } from "node:path";

const PROTECTED = [
  /^_bmad\//,
  /^_bmad-output\//,
  /^\.claude\//,
  /^\.github\/workflows\//,
  // Add project-specific paths here, e.g. test snapshot baselines.
];

let input = "";
for await (const chunk of process.stdin) input += chunk;

let filePath;
try {
  filePath = JSON.parse(input).tool_input?.file_path;
} catch {
  process.exit(0);
}
if (!filePath) process.exit(0);

const root = resolve(process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
const rel = relative(root, resolve(root, filePath)).split(sep).join("/");

if (PROTECTED.some((re) => re.test(rel))) {
  console.error(
    `Blocked: ${rel} is a protected path (see docs/agentic/adr/0004-protected-paths.md). ` +
      "Ask a human to make this change."
  );
  process.exit(2);
}
