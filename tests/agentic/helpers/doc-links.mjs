import { readdirSync } from "node:fs";
import { join } from "node:path";

// Relative link targets of `[text](target)` in a markdown string. Fenced code blocks and
// inline code are dropped first; absolute URLs, mailto: and pure #anchors are skipped;
// #fragment and ?query are stripped.
export function relativeLinks(markdown) {
  const text = markdown.replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, "").replace(/`[^`\n]*`/g, "");
  const links = [];
  for (const m of text.matchAll(/\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
    const target = m[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) continue;
    const path = target.split("#")[0].split("?")[0];
    if (path) links.push(path);
  }
  return links;
}

// Repo-relative POSIX paths of every .md file below `dir`, recursively.
export function markdownFiles(root, dir) {
  const out = [];
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...markdownFiles(root, rel));
    else if (entry.name.endsWith(".md")) out.push(rel);
  }
  return out.sort();
}
