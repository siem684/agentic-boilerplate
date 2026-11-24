// sync-plan.mjs: the decision table of sync.mjs, free of I/O so it can be tested on its own.
//
// planSync compares three trees for every path the agentic layer owns:
//   oldTree  the template at the project's based_on version  (Map path -> Buffer)
//   newTree  the template at the target version               (Map path -> Buffer)
//   read(p)  the project's bytes for a path, or null when absent
// and returns the sorted changes: { path, action: "add" | "update" | "delete", reason? }.
// An item with a `reason` is a conflict (the project changed the file); its `action` is what
// --force would do. Files that exist only in the project are never in the result.
import { owns } from "./layers.mjs";

export function planSync({ oldTree, newTree, oldLayers, newLayers, read }) {
  const items = [];
  const inScope = (layers, path) => Boolean(layers?.agentic) && owns(layers.agentic, path);

  for (const path of [...new Set([...oldTree.keys(), ...newTree.keys()])].sort()) {
    const was = oldTree.get(path);
    const next = newTree.get(path);
    const mine = read(path);

    if (next) {
      if (!inScope(newLayers, path)) continue;
      if (mine?.equals(next)) continue; // already current
      if (was?.equals(next)) continue; // template did not change it; local state stays
      if (!mine && !was) items.push({ path, action: "add" });
      else if (mine && was?.equals(mine)) items.push({ path, action: "update" });
      else if (!mine) items.push({ path, action: "add", reason: "deleted locally" });
      else items.push({ path, action: "update", reason: was ? "edited locally" : "exists locally but not in your base version" });
    } else {
      if (!inScope(oldLayers, path) || !mine) continue;
      if (was.equals(mine)) items.push({ path, action: "delete" });
      else items.push({ path, action: "delete", reason: "removed by the template, edited locally" });
    }
  }
  return items;
}
