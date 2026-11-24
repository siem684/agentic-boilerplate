// Reads GitHub workflow files as text. No YAML parser: the template has no dependencies.

// The text of every step that uses claude-code-action, from its list dash to the next step.
export function actionSteps(yaml) {
  const lines = yaml.split(/\r?\n/);
  const isItem = (line) => /^\s*-\s/.test(line);
  const indentOf = (line) => line.search(/\S/);
  const steps = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*(-\s+)?uses:\s*anthropics\/claude-code-action@/.test(lines[i])) continue;
    let start = i;
    if (!isItem(lines[i])) {
      while (start > 0 && !isItem(lines[start])) start--;
    }
    const dash = indentOf(lines[start]);
    let end = i + 1;
    while (end < lines.length && (lines[end].trim() === "" || indentOf(lines[end]) > dash)) end++;
    steps.push(lines.slice(start, end).join("\n"));
  }
  return steps;
}

// The agent a step starts with `--agent <name>`, or null when it names none.
export function agentOf(step) {
  const m = step.match(/--agent\s+([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}
