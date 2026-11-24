// layers.mjs: read layers.json and match paths against it. Shared by the scripts that
// need to know who owns a file (staleness.mjs today, sync.mjs next).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Glob subset used in layers.json: `**` matches anything including `/`, `*` matches
// within one path segment, everything else is literal. `dir/**` does not match `dir`.
export function matches(pattern, path) {
  const source = pattern
    .split("**")
    .map((part) => part.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*"))
    .join(".*");
  return new RegExp(`^${source}$`).test(path);
}

// A layer owns a path when a `paths` pattern matches it and no `exclude` pattern does.
export function owns(layer, path) {
  return layer.paths.some((p) => matches(p, path)) && !(layer.exclude ?? []).some((p) => matches(p, path));
}

// The layers object of <root>/layers.json, or null if there is no such file.
export function loadLayers(root) {
  const file = join(root, "layers.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).layers ?? {} : null;
}
