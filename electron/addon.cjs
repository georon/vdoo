// Studio › Export addon: writes the generated Odoo addon as a folder inside a directory the user picks.
// Every path is checked here, not trusted from the page: only plain relative paths inside the addon folder are written.
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const MODULE = /^[a-z][a-z0-9_]*$/;
const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const MAX_FILES = 500;
const MAX_BYTES = 20 * 1024 * 1024;

/** Throws unless `files` is a list of { path, content } with safe relative paths. */
function checkFiles(name, files) {
  if (typeof name !== "string" || !MODULE.test(name)) throw new Error("The technical name may contain only lowercase letters, digits and underscores.");
  if (!Array.isArray(files) || !files.length || files.length > MAX_FILES) throw new Error("There is nothing to export.");
  let total = 0;
  const seen = new Set();
  for (const f of files) {
    if (!f || typeof f.path !== "string" || typeof f.content !== "string") throw new Error("A file of the addon is malformed.");
    const parts = f.path.split("/");
    if (!parts.every((p) => SEGMENT.test(p) && p !== "." && p !== "..")) throw new Error(`Refusing to write "${f.path}".`);
    if (seen.has(f.path)) throw new Error(`"${f.path}" appears twice.`);
    seen.add(f.path);
    total += Buffer.byteLength(f.content, "utf8");
  }
  if (total > MAX_BYTES) throw new Error("The addon is too large.");
}

/** Writes the files under `root/name`, creating folders. Each file is written whole or not at all. */
async function writeAddon(root, name, files) {
  checkFiles(name, files);
  const dir = path.join(root, name);
  for (const f of files) {
    const target = path.join(dir, ...f.path.split("/"));
    const rel = path.relative(dir, target);
    if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`Refusing to write "${f.path}".`);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target + ".tmp", f.content, "utf8");
    await fsp.rename(target + ".tmp", target);
  }
  return dir;
}

function register(handle, { dialog, getWindow, startDir }) {
  handle("vdoo:export-addon", async (_event, { name, files }) => {
    checkFiles(name, files);
    const start = startDir();
    const pick = await dialog.showOpenDialog(getWindow(), { title: `Choose where to put the ${name} addon folder`, buttonLabel: "Export here",
      properties: ["openDirectory", "createDirectory"], ...(start ? { defaultPath: start } : {}) });
    if (pick.canceled || !pick.filePaths[0]) return null;
    // Choosing the addon folder itself (to update it) means its parent.
    let root = pick.filePaths[0];
    if (path.basename(root) === name && fs.existsSync(path.join(root, "__manifest__.py"))) root = path.dirname(root);
    const dir = path.join(root, name);
    if (fs.existsSync(dir) && fs.readdirSync(dir).length) {
      const answer = await dialog.showMessageBox(getWindow(), { type: "question", buttons: ["Replace files", "Cancel"], defaultId: 0, cancelId: 1,
        message: `${dir} already exists.`, detail: "The addon's files are written over the ones there. Other files in the folder are left alone." });
      if (answer.response !== 0) return null;
    }
    return { path: await writeAddon(root, name, files), count: files.length };
  });
}

module.exports = { register, writeAddon, checkFiles };
