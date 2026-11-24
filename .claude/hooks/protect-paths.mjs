// PreToolUse hook: second layer behind permissions.deny for protected paths.
// Exit code 2 blocks the tool call and feeds stderr back to the model.
// Edit, Write, MultiEdit and NotebookEdit are checked exactly (by path).
// Bash is checked best-effort (see docs/agentic/adr/0004-protected-paths.md).
import { relative, resolve, sep } from "node:path";

// Matching is case-insensitive: Windows and macOS file systems are.
const PROTECTED = [
  /^_bmad\//i,
  /^_bmad-output\//i,
  /^\.claude\//i,
  /^\.github\/workflows\//i,
  // Add project-specific paths here, e.g. test snapshot baselines.
];

// A protected directory named anywhere in a shell command.
const MENTIONS_PROTECTED =
  /(?:^|[^\w.-])(?:\.[\\/])?(?:_bmad(?:-output)?|\.claude|\.github[\\/]workflows)(?=[\\/\s"'`;&|)]|$)/i;
// Something in a shell command that can write: a redirect or a mutating command.
const WRITES =
  /(?:>|(?:^|[^\w-])(?:rm|rmdir|mv|cp|tee|touch|truncate|dd|install|patch|rsync|del|erase|rd|move-item|copy-item|remove-item|set-content|add-content|out-file|new-item|rename-item|sed\s+-\w*i|sed\s+--in-place|perl\s+-\w*i|git\s+(?:checkout|restore|apply|rm|mv|clean))(?![\w-]))/i;

let input = "";
for await (const chunk of process.stdin) input += chunk;

let toolInput;
try {
  toolInput = JSON.parse(input).tool_input;
} catch {
  process.exit(0);
}

const root = resolve(process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
const block = (what) => {
  console.error(
    `Blocked: ${what} is a protected path (see docs/agentic/adr/0004-protected-paths.md). ` +
      "Ask a human to make this change."
  );
  process.exit(2);
};

const filePath = toolInput?.file_path ?? toolInput?.notebook_path;
if (filePath) {
  const rel = relative(root, resolve(root, filePath)).split(sep).join("/");
  if (PROTECTED.some((re) => re.test(rel))) block(rel);
}

const command = toolInput?.command;
if (typeof command === "string" && MENTIONS_PROTECTED.test(command)) {
  // Redirects to /dev/null and fd duplication (2>&1) are not writes.
  const stripped = command.replace(/\d*>&\d+|\d*>>?\s*\/dev\/null/g, "");
  if (WRITES.test(stripped)) block("a path in this Bash command");
}
