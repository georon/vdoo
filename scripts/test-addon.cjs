// Studio's addon export: only safe relative paths are written, and they land inside the addon folder.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { writeAddon, checkFiles } = require("../electron/addon.cjs");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "vdoo-addon-test-"));

test("writes the files inside the addon folder", async () => {
  const root = tmp();
  try {
    const dir = await writeAddon(root, "x_demo", [{ path: "__manifest__.py", content: "{}\n" }, { path: "models/x_demo_thing.py", content: "# model\n" }]);
    assert.strictEqual(dir, path.join(root, "x_demo"));
    assert.strictEqual(fs.readFileSync(path.join(dir, "models", "x_demo_thing.py"), "utf8"), "# model\n");
    assert.deepStrictEqual(fs.readdirSync(path.join(dir, "models")), ["x_demo_thing.py"]); // no .tmp left behind
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("refuses paths that leave the addon folder", () => {
  for (const bad of ["../evil.py", "models/../../evil.py", "/etc/passwd", "a\\..\\b", "models//x.py", ".hidden/x", ""])
    assert.throws(() => checkFiles("x_demo", [{ path: bad, content: "" }]), /Refusing|malformed/, bad);
});

test("refuses bad module names and malformed lists", () => {
  for (const name of ["", "X_Demo", "../x", "x-demo", 5]) assert.throws(() => checkFiles(name, [{ path: "a.py", content: "" }]));
  assert.throws(() => checkFiles("x_demo", []));
  assert.throws(() => checkFiles("x_demo", [{ path: "a.py" }]));
  assert.throws(() => checkFiles("x_demo", [{ path: "a.py", content: "" }, { path: "a.py", content: "" }]), /twice/);
});
