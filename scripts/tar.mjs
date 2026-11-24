// tar.mjs: a minimal reader for the gzip tarballs GitHub serves (used by sync.mjs).
// Node has no tar reader, so this walks the 512-byte blocks itself: regular files only,
// ustar prefix, GNU long names (`L`) and pax `path` records (`x`). The top-level directory
// is stripped. Symlinks, directories and any path that could leave the extraction root
// (`..`, absolute, backslash, colon) are ignored. Nothing is written to disk.
import { gunzipSync } from "node:zlib";

const BLOCK = 512;
const text = (buf, from, len) => {
  const slice = buf.subarray(from, from + len);
  const end = slice.indexOf(0);
  return slice.subarray(0, end === -1 ? slice.length : end).toString("utf8");
};

function paxPath(data) {
  let i = 0;
  while (i < data.length) {
    const space = data.indexOf(0x20, i);
    const len = parseInt(data.subarray(i, space).toString(), 10);
    if (!(len > 0) || space === -1) break;
    const record = data.subarray(space + 1, i + len - 1).toString("utf8");
    const eq = record.indexOf("=");
    if (record.slice(0, eq) === "path") return record.slice(eq + 1);
    i += len;
  }
  return null;
}

// "top/scripts/a.mjs" -> "scripts/a.mjs"; null for anything unsafe or without a file part.
function safeKey(name) {
  if (name.startsWith("/")) return null;
  const segments = name.split("/");
  if (segments.some((s) => s === ".." || /[\\:\0]/.test(s))) return null;
  const rest = segments.slice(1).filter((s) => s && s !== ".");
  return rest.length ? rest.join("/") : null;
}

export function readTarball(gz) {
  let buf;
  try {
    buf = gunzipSync(gz);
  } catch {
    throw new Error("not a gzip archive");
  }
  const files = new Map();
  let nextName = null;
  for (let pos = 0; pos + BLOCK <= buf.length; ) {
    const head = buf.subarray(pos, pos + BLOCK);
    if (head.every((b) => b === 0)) break;
    const stored = parseInt(text(head, 148, 8).trim(), 8);
    const actual = head.reduce((sum, b, i) => sum + (i >= 148 && i < 156 ? 0x20 : b), 0);
    if (stored !== actual) throw new Error("not a tar archive (bad header checksum)");
    const size = parseInt(text(head, 124, 12).trim(), 8);
    const data = buf.subarray(pos + BLOCK, pos + BLOCK + size);
    pos += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
    const type = String.fromCharCode(head[156] || 0x30);
    if (type === "x") nextName = paxPath(data) ?? nextName;
    else if (type === "L") nextName = text(data, 0, data.length);
    else if (type === "g") continue;
    else {
      if (type === "0") {
        const prefix = text(head, 345, 155);
        const name = nextName ?? (prefix ? `${prefix}/${text(head, 0, 100)}` : text(head, 0, 100));
        const key = safeKey(name);
        if (key) files.set(key, Buffer.from(data));
      }
      nextName = null;
    }
  }
  return files;
}
