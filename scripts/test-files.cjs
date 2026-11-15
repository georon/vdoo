// Tests for the explorer's main-process helpers. Run with: node --test scripts/test-files.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createAccess, listDir, readText, sortEntries, isBinary } = require("../electron/files.cjs");

const names = (list) => list.map((e) => e.name);

test("sortEntries puts folders first, ignores case and sorts numbers naturally", () => {
  const input = [{ name: "file10.md", isDir: false }, { name: "zeta", isDir: true }, { name: "File2.md", isDir: false }, { name: "alpha", isDir: true }];
  assert.deepEqual(names(sortEntries(input)), ["alpha", "zeta", "File2.md", "file10.md"]);
  assert.equal(input[0].name, "file10.md", "the input is not reordered");
});

test("isBinary detects a NUL byte and accepts UTF-8 text", () => {
  assert.equal(isBinary(Buffer.from([0x89, 0x50, 0x00, 0x47])), true);
  assert.equal(isBinary(Buffer.from("hello\nwörld ✓")), false);
  assert.equal(isBinary(Buffer.alloc(0)), false);
});

test("only the opened folder and picked files are allowed", () => {
  const root = path.resolve(os.tmpdir(), "vdoo-root");
  const access = createAccess();
  assert.equal(access.allows(path.join(root, "a.txt")), false, "nothing is allowed before a folder is opened");
  access.setFolder(root);
  assert.equal(access.allows(root), true);
  assert.equal(access.allows(path.join(root, "sub", "a.txt")), true);
  assert.equal(access.allows(path.join(root, "..", "other.txt")), false);
  assert.equal(access.allows(root + "-sibling"), false);
  assert.equal(access.allows(path.join(root, "..name")), true, "a name that only starts with dots is inside");
  assert.equal(access.allows("relative.txt"), false);
  assert.equal(access.allows(undefined), false);
  const picked = path.resolve(os.tmpdir(), "elsewhere", "picked.txt");
  access.addFile(picked);
  assert.equal(access.allows(picked), true);
  assert.equal(access.allows(path.join(path.dirname(picked), "neighbour.txt")), false);
});

test("the folder is remembered for the next start, if it still exists", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vdoo-files-"));
  try {
    const state = path.join(dir, "workspace.json");
    assert.equal(createAccess(state).restore(), null);
    createAccess(state).setFolder(dir);
    assert.equal(createAccess(state).restore(), dir);
    fs.writeFileSync(state, JSON.stringify({ folder: path.join(dir, "gone") }));
    assert.equal(createAccess(state).restore(), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the default directory is remembered, starts dialogs when it exists, and grants no access", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vdoo-files-"));
  try {
    const state = path.join(dir, "workspace.json");
    const docs = path.join(dir, "docs"), work = path.join(dir, "work");
    fs.mkdirSync(docs); fs.mkdirSync(work);
    createAccess(state).setFolder(work);
    const first = createAccess(state); // a new start: nothing restored yet
    assert.equal(first.defaultDir, null);
    assert.equal(first.setDefaultDir(docs), docs);
    assert.equal(first.allows(path.join(docs, "a.txt")), false, "a start folder for dialogs is not permission to read it");
    const next = createAccess(state);
    assert.equal(next.defaultDir, docs);
    assert.equal(next.restore(), work, "setting the default directory kept the remembered folder");
    assert.equal(next.startDir(), docs, "the default directory comes before the open folder");
    fs.rmSync(docs, { recursive: true });
    assert.equal(next.startDir(), work, "a missing default directory falls back to the open folder");
    assert.equal(next.setDefaultDir(null), null);
    assert.equal(createAccess(state).defaultDir, null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("listDir and readText", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vdoo-files-"));
  try {
    fs.mkdirSync(path.join(dir, "sub"));
    fs.writeFileSync(path.join(dir, "a.txt"), "héllo");
    fs.writeFileSync(path.join(dir, "b.bin"), Buffer.from([1, 0, 2]));
    assert.deepEqual(await listDir(dir), [
      { name: "sub", path: path.join(dir, "sub"), isDir: true },
      { name: "a.txt", path: path.join(dir, "a.txt"), isDir: false },
      { name: "b.bin", path: path.join(dir, "b.bin"), isDir: false },
    ]);
    assert.deepEqual(await readText(path.join(dir, "a.txt")), { path: path.join(dir, "a.txt"), name: "a.txt", text: "héllo" });
    assert.match((await readText(path.join(dir, "b.bin"))).error, /binary/);
    assert.match((await readText(path.join(dir, "sub"))).error, /regular file/);
    assert.ok((await readText(path.join(dir, "missing.txt"))).error);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
