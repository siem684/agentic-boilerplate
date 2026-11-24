import { test } from "node:test";
import assert from "node:assert/strict";
import { readTarball } from "../../scripts/tar.mjs";
import { makeTar } from "./helpers/fixtures.mjs";

const keys = (map) => [...map.keys()].sort();

test("strips the top-level directory", () => {
  const map = readTarball(makeTar([{ name: "acme-tpl-abc/scripts/a.mjs", data: "hello" }]));
  assert.deepEqual(keys(map), ["scripts/a.mjs"]);
  assert.equal(map.get("scripts/a.mjs").toString(), "hello");
});

test("reads files larger than one block and keeps exact bytes", () => {
  const bytes = Buffer.from(Array.from({ length: 1300 }, (_, i) => (i * 7) % 256));
  const map = readTarball(makeTar([{ name: "top/bin.dat", data: bytes }, { name: "top/after.txt", data: "x" }]));
  assert.ok(map.get("bin.dat").equals(bytes));
  assert.equal(map.get("after.txt").toString(), "x");
});

test("reads GNU long names", () => {
  const long = "top/" + "d/".repeat(70) + "file.txt";
  const map = readTarball(makeTar([{ type: "longname", name: long }, { name: "top/placeholder", data: "long" }]));
  assert.deepEqual(keys(map), [long.slice(4)]);
  assert.equal(map.get(long.slice(4)).toString(), "long");
});

test("reads the pax path record", () => {
  const long = "top/" + "p/".repeat(70) + "file.txt";
  const map = readTarball(makeTar([{ type: "pax", name: long }, { name: "top/placeholder", data: "pax" }]));
  assert.deepEqual(keys(map), [long.slice(4)]);
});

test("reads the ustar prefix field", () => {
  const long = "top/" + "u/".repeat(60) + "file.txt";
  const map = readTarball(makeTar([{ name: long, data: "prefixed" }]));
  assert.deepEqual(keys(map), [long.slice(4)]);
});

test("ignores the global pax header and directory entries", () => {
  const map = readTarball(makeTar([{ type: "pax-global", name: "pax_global_header" }, { type: "dir", name: "top/" }, { type: "dir", name: "top/scripts/" }, { name: "top/scripts/a.mjs", data: "a" }]));
  assert.deepEqual(keys(map), ["scripts/a.mjs"]);
});

test("ignores symlinks", () => {
  const map = readTarball(makeTar([{ type: "symlink", name: "top/x/link", linkname: "../../etc/passwd" }, { name: "top/x/real", data: "r" }]));
  assert.deepEqual(keys(map), ["x/real"]);
});

test("ignores paths that escape the root", () => {
  const map = readTarball(
    makeTar([
      { name: "top/../../evil", data: "1" },
      { name: "top/a/../../../evil", data: "2" },
      { name: "/abs/evil", data: "3" },
      { type: "pax", name: "top/../x" },
      { name: "top/placeholder", data: "4" },
      { name: "top/ok.txt", data: "fine" },
    ]),
  );
  assert.deepEqual(keys(map), ["ok.txt"]);
});

test("rejects data that is not a gzip tarball", () => {
  assert.throws(() => readTarball(Buffer.from("nope")));
});
