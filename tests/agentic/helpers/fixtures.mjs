// Shared helpers for the sync tests: a hand-made tar builder (Node has no tar writer),
// small file-tree helpers and a minimal layers.json.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";

export const LAYERS = JSON.stringify({
  schemaVersion: 1,
  layers: {
    agentic: { owner: "template", sync: true, paths: ["scripts/**", "tests/agentic/**", "layers.json"], exclude: ["scripts/release.mjs"] },
    project: { owner: "project", sync: false, paths: ["src/**", "tests/**", "boilerplate.lock"], exclude: ["tests/agentic/**"] },
  },
});

const TYPEFLAG = { file: "0", dir: "5", symlink: "2", pax: "x", longname: "L", "pax-global": "g" };

function put(block, text, offset, length) {
  block.write(text.slice(0, length), offset, "utf8");
}

function header({ name, size = 0, type, linkname = "", prefix = "" }) {
  const h = Buffer.alloc(512);
  put(h, name, 0, 100);
  put(h, "0000644\0", 100, 8);
  put(h, "0000000\0", 108, 8);
  put(h, "0000000\0", 116, 8);
  put(h, size.toString(8).padStart(11, "0") + "\0", 124, 12);
  put(h, "00000000000\0", 136, 12);
  h.fill(0x20, 148, 156); // checksum counts as spaces
  put(h, TYPEFLAG[type], 156, 1);
  put(h, linkname, 157, 100);
  put(h, "ustar\0", 257, 6);
  put(h, "00", 263, 2);
  put(h, prefix, 345, 155);
  const sum = h.reduce((a, b) => a + b, 0);
  put(h, sum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
  return h;
}

function paxRecord(key, value) {
  const body = ` ${key}=${value}\n`;
  let len = Buffer.byteLength(body) + 1;
  while (String(len).length + Buffer.byteLength(body) !== len) len = String(len).length + Buffer.byteLength(body);
  return `${len}${body}`;
}

// Build a gzip-compressed tarball. `pax` entries carry a `path` record (in `name`) for the
// entry that follows; `longname` is a GNU long-name entry (also `name`); a plain file with a
// name over 100 characters is written with the ustar prefix field.
export function makeTar(entries) {
  const blocks = [];
  const add = (head, data = Buffer.alloc(0)) => {
    blocks.push(head, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  };
  for (const e of entries) {
    const type = e.type ?? "file";
    if (type === "pax" || type === "longname" || type === "pax-global") {
      const data = Buffer.from(
        type === "pax" ? paxRecord("path", e.name) : type === "longname" ? e.name + "\0" : paxRecord("comment", "0123456789abcdef"),
      );
      add(header({ name: type === "longname" ? "././@LongLink" : "PaxHeader/x", size: data.length, type }), data);
      continue;
    }
    const data = Buffer.from(e.data ?? "");
    let { name } = e;
    let prefix = "";
    if (type === "file" && name.length > 100) {
      const cut = name.lastIndexOf("/", name.length - 1);
      prefix = name.slice(0, cut);
      name = name.slice(cut + 1);
    }
    add(header({ name, size: type === "file" ? data.length : 0, type, linkname: e.linkname, prefix }), type === "file" ? data : Buffer.alloc(0));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

export function writeTree(dir, files) {
  for (const [path, content] of Object.entries(files)) {
    const file = join(dir, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
}

// Every file below `dir` (except .git) as latin1 text keyed by forward-slash relative path.
export function snapshot(dir) {
  const out = {};
  const walk = (rel) => {
    for (const name of readdirSync(join(dir, rel))) {
      if (name === ".git") continue;
      const path = rel ? `${rel}/${name}` : name;
      if (statSync(join(dir, path)).isDirectory()) walk(path);
      else out[path] = readFileSync(join(dir, path)).toString("latin1");
    }
  };
  walk("");
  return out;
}
