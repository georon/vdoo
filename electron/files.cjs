// The file explorer and the file tabs: folders are listed and text files read and written here, for the page.
// The page can only reach what the user picked in a dialog: a folder (and everything under it) or single files.
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const MAX_TEXT_BYTES = 10 * 1024 * 1024;

/** Folders first, then files, each alphabetically (case-insensitive, numbers in order). */
const sortEntries = (entries) => [...entries].sort((a, b) =>
  Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));

/** A NUL byte in the first 8 KB is a reliable sign the file isn't text. */
const isBinary = (bytes) => bytes.subarray(0, 8192).includes(0);

const isInside = (root, target) => {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel));
};

const isDir = (dir) => { try { return typeof dir === "string" && path.isAbsolute(dir) && fs.statSync(dir).isDirectory(); } catch { return false; } };

/**
 * Tracks what the user has picked. `statePath` (optional) remembers the folder and the default directory for the
 * next start. The default directory is only where the Open and Save dialogs start: it grants no access by itself.
 */
function createAccess(statePath) {
  let folder = null;
  let defaultDir = null;
  const files = new Set();
  const readState = () => { try { return JSON.parse(fs.readFileSync(statePath, "utf8")) ?? {}; } catch { return {}; } };
  const remember = () => {
    if (!statePath) return;
    // The folder of the last run stays remembered until this run opens one of its own.
    try { fs.writeFileSync(statePath, JSON.stringify({ folder: folder ?? readState().folder ?? null, defaultDir }), "utf8"); } catch {}
  };
  if (statePath) { const saved = readState().defaultDir; if (typeof saved === "string" && path.isAbsolute(saved)) defaultDir = saved; }
  return {
    get folder() { return folder; },
    setFolder(dir) { folder = path.resolve(dir); remember(); return folder; },
    /** The default directory as saved (shown in Settings even if the drive is not there right now). */
    get defaultDir() { return defaultDir; },
    setDefaultDir(dir) { defaultDir = dir ? path.resolve(dir) : null; remember(); return defaultDir; },
    /** Where a dialog should start: the default directory when it exists, else `fallback` (the open folder). */
    startDir(fallback = folder) { return isDir(defaultDir) ? defaultDir : fallback || null; },
    /** The folder from the last run, when it still exists. */
    restore() {
      if (!statePath) return null;
      const saved = readState().folder;
      if (isDir(saved)) folder = saved;
      return folder;
    },
    addFile(file) { const resolved = path.resolve(file); files.add(resolved); return resolved; },
    allows(target) {
      if (typeof target !== "string" || !path.isAbsolute(target)) return false;
      const resolved = path.resolve(target);
      return files.has(resolved) || (!!folder && isInside(folder, resolved));
    },
  };
}

async function listDir(dir) {
  const dirents = await fsp.readdir(dir, { withFileTypes: true });
  const entries = await Promise.all(dirents.map(async (d) => {
    const full = path.join(dir, d.name);
    let isDir = d.isDirectory();
    if (d.isSymbolicLink()) isDir = await fsp.stat(full).then((s) => s.isDirectory(), () => false);
    return { name: d.name, path: full, isDir };
  }));
  return sortEntries(entries);
}

/** Reads one text file. Returns { error } instead of throwing so the page can show it. */
async function readText(file) {
  try {
    const stat = await fsp.stat(file);
    if (!stat.isFile()) return { error: "That isn't a regular file." };
    if (stat.size > MAX_TEXT_BYTES) return { error: "The file is too large to open (over 10 MB)." };
    const bytes = await fsp.readFile(file);
    if (isBinary(bytes)) return { error: "This looks like a binary file, so it was not opened." };
    return { path: file, name: path.basename(file), text: bytes.toString("utf8") };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The file couldn't be read." };
  }
}

function register(handle, { dialog, getWindow, statePath }) {
  const access = createAccess(statePath);
  const guard = (target) => { if (!access.allows(target)) throw new Error("That file is outside the folders and files you opened."); return path.resolve(target); };

  handle("vdoo:files-workspace", () => access.restore());
  handle("vdoo:files-choose-folder", async () => {
    const start = access.startDir();
    const result = await dialog.showOpenDialog(getWindow(), { title: "Open folder", properties: ["openDirectory"], ...(start ? { defaultPath: start } : {}) });
    return result.canceled || !result.filePaths[0] ? null : access.setFolder(result.filePaths[0]);
  });
  handle("vdoo:files-list", (_event, dir) => listDir(guard(dir)));
  handle("vdoo:files-pick", async () => {
    const start = access.startDir();
    const result = await dialog.showOpenDialog(getWindow(), { title: "Open", properties: ["openFile", "multiSelections"],
      ...(start ? { defaultPath: start } : {}) });
    return result.canceled ? [] : result.filePaths.map((file) => access.addFile(file));
  });
  handle("vdoo:files-read", async (_event, file) => {
    if (!access.allows(file)) return { error: "That file is outside the folders and files you opened." };
    return readText(path.resolve(file));
  });
  // Writes to `file` when the page already has it open, else asks where. Returns null when the dialog is cancelled.
  handle("vdoo:files-write", async (_event, { text, file, suggestedName }) => {
    if (typeof text !== "string" || text.length > MAX_TEXT_BYTES) throw new Error("Nothing to save.");
    let target = file ? guard(file) : null;
    if (!target) {
      const name = String(suggestedName || "Untitled.txt").replace(/[\\/:*?"<>|]/g, "_");
      // A new file is most likely meant for the folder that is open; without one, the default directory.
      const start = access.folder || access.startDir();
      const result = await dialog.showSaveDialog(getWindow(), { title: "Save", defaultPath: start ? path.join(start, name) : name });
      if (result.canceled || !result.filePath) return null;
      target = access.addFile(result.filePath);
    }
    await fsp.writeFile(target, text, "utf8");
    return { path: target, name: path.basename(target) };
  });
  // Settings › Default directory.
  handle("vdoo:files-default-dir", () => access.defaultDir);
  handle("vdoo:files-choose-default-dir", async () => {
    const start = access.startDir();
    const result = await dialog.showOpenDialog(getWindow(), { title: "Default directory", buttonLabel: "Use this folder",
      properties: ["openDirectory", "createDirectory"], ...(start ? { defaultPath: start } : {}) });
    return result.canceled || !result.filePaths[0] ? access.defaultDir : access.setDefaultDir(result.filePaths[0]);
  });
  handle("vdoo:files-clear-default-dir", () => access.setDefaultDir(null));
  return access;
}

module.exports = { register, createAccess, listDir, readText, sortEntries, isBinary, isInside };
