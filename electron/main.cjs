// vdoo desktop shell: one window, the editor served over app://vdoo/, schema files read and written here.
const { app, BrowserWindow, protocol, net, ipcMain, dialog, shell, Menu } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const ai = require("./ai.cjs");
const { csp } = require("./csp.cjs");

const DIST = path.join(__dirname, "..", "dist");
// Development only (e.g. VDOO_DEV_URL=http://localhost:5173); ignored by installed builds.
const DEV_URL = !app.isPackaged && process.env.VDOO_DEV_URL ? new URL(process.env.VDOO_DEV_URL).origin : null;
if (!app.isPackaged && process.env.VDOO_TEST_USER_DATA) app.setPath("userData", process.env.VDOO_TEST_USER_DATA);
const TEST_HIDDEN = !app.isPackaged && process.env.VDOO_TEST_HIDDEN === "1";
const isAppUrl = (url) => {
  try { return url.startsWith("app://vdoo/") || (!!DEV_URL && new URL(url).origin === DEV_URL); } catch { return false; }
};
const CSP = csp();
const SCHEMA_FILE = /\.vdoo$/i;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let win = null;
const pendingFiles = process.argv.slice(app.isPackaged ? 1 : 2).filter((arg) => SCHEMA_FILE.test(arg) && fs.existsSync(arg));
let closeConfirmed = false;

function isTrustedSender(event) {
  return !!win && event.sender === win.webContents && isAppUrl(event.senderFrame?.url ?? "");
}

// vdoo's own links open without asking; anything else (a link in an AI answer) asks first.
const OWN_LINKS = new Set(["https://chatgpt.com/settings/usage", "https://claude.com/claude-code"]);
let askingAboutLink = false;
async function openLink(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { return; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (!OWN_LINKS.has(url.href)) {
    if (askingAboutLink || !win) return;
    askingAboutLink = true;
    const { response } = await dialog.showMessageBox(win, {
      type: "question", title: "Open link?", message: `Open ${url.host} in your browser?`,
      detail: url.href.length > 300 ? url.href.slice(0, 300) + "…" : url.href, buttons: ["Open link", "Cancel"], defaultId: 0, cancelId: 1,
    }).finally(() => { askingAboutLink = false; });
    if (response !== 0) return;
  }
  await shell.openExternal(url.href);
}

// Asked here rather than in the page before a custom endpoint on this computer or the local network is used.
async function confirmLocalAddress(url, addresses) {
  const { response } = await dialog.showMessageBox(win, {
    type: "warning", title: "Connect to a local address?", message: `Connect to ${url.host}?`,
    detail: `Allow ${url.origin} to connect to the following resolved addresses?\n\n${addresses.join(", ")}`,
    buttons: ["Connect", "Cancel"], defaultId: 1, cancelId: 1,
  });
  return response === 0;
}

function readSchemaFile(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error("That file is too large or isn't a regular file.");
  return { path: file, name: path.basename(file), text: fs.readFileSync(file, "utf8") };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 720, minHeight: 480, show: false, title: "vdoo",
    backgroundColor: "#16171b",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true,
      ...(TEST_HIDDEN ? { backgroundThrottling: false } : {}),
    },
  });
  Menu.setApplicationMenu(process.platform === "darwin" ? Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }]) : null);
  win.webContents.setWindowOpenHandler(({ url }) => { void openLink(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (event, url) => { if (!isAppUrl(url)) { event.preventDefault(); void openLink(url); } });
  win.webContents.session.setPermissionRequestHandler((contents, permission, callback) =>
    callback(contents === win?.webContents && permission === "clipboard-sanitized-write"));
  win.once("ready-to-show", () => { if (!TEST_HIDDEN) win.show(); });
  // The page knows whether there are unsaved changes; it confirms and then calls vdoo:close.
  win.on("close", (event) => {
    if (closeConfirmed || !win) return;
    event.preventDefault();
    win.webContents.send("vdoo:close-requested");
  });
  win.on("closed", () => { win = null; closeConfirmed = false; });
  void win.loadURL(DEV_URL ? DEV_URL + "/" : "app://vdoo/index.html");
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", (_event, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const file = argv.find((arg) => SCHEMA_FILE.test(arg) && fs.existsSync(arg));
    if (file) try { win.webContents.send("vdoo:open-file", readSchemaFile(file)); } catch {}
  });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
  app.on("activate", () => { if (!win && app.isReady()) createWindow(); });

  app.whenReady().then(() => {
    protocol.handle("app", async (req) => {
      const { host, pathname } = new URL(req.url);
      if (host !== "vdoo") return new Response("Not found", { status: 404 });
      let file;
      try { file = path.normalize(path.join(DIST, decodeURIComponent(pathname))); } catch { return new Response("Bad request", { status: 400 }); }
      if (!file.startsWith(DIST + path.sep)) return new Response("Forbidden", { status: 403 });
      const response = await net.fetch(pathToFileURL(file).toString());
      const headers = new Headers(response.headers);
      headers.set("Content-Security-Policy", CSP);
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    });

    // Only vdoo's own page may call into the main process.
    const handle = (channel, listener) => ipcMain.handle(channel, (event, ...args) => {
      if (!isTrustedSender(event)) throw new Error("Untrusted sender");
      return listener(event, ...args);
    });
    ai.register(handle, (channel, payload) => win?.webContents.send(channel, payload), { confirmLocal: confirmLocalAddress });

    handle("vdoo:pending-file", () => {
      const file = pendingFiles.shift();
      try { return file ? readSchemaFile(file) : null; } catch { return null; }
    });
    handle("vdoo:open", async () => {
      const result = await dialog.showOpenDialog(win, { title: "Open schema", properties: ["openFile"],
        filters: [{ name: "vdoo schema", extensions: ["vdoo"] }, { name: "Mermaid ER diagram", extensions: ["mmd", "mermaid"] }] });
      if (result.canceled || !result.filePaths[0]) return null;
      return readSchemaFile(result.filePaths[0]);
    });
    // Saves to `file` when the page already has one (it came from an open or save dialog), else asks where.
    handle("vdoo:save", async (_event, { text, file, suggestedName, kind }) => {
      if (typeof text !== "string" || text.length > MAX_FILE_BYTES) throw new Error("Nothing to save.");
      const filters = {
        vdoo: [{ name: "vdoo schema", extensions: ["vdoo"] }],
        mermaid: [{ name: "Mermaid ER diagram", extensions: ["mmd"] }],
        sql: [{ name: "SQL script", extensions: ["sql"] }],
        svg: [{ name: "SVG image", extensions: ["svg"] }],
      }[kind];
      if (!filters) throw new Error("Unknown file type.");
      let target = kind === "vdoo" && typeof file === "string" && SCHEMA_FILE.test(file) && path.isAbsolute(file) ? file : null;
      if (!target) {
        const result = await dialog.showSaveDialog(win, { title: "Save", defaultPath: String(suggestedName || "schema").replace(/[\\/:*?"<>|]/g, "_"), filters });
        if (result.canceled || !result.filePath) return null;
        target = result.filePath;
      }
      fs.writeFileSync(target + ".tmp", text, "utf8");
      fs.renameSync(target + ".tmp", target);
      return { path: target, name: path.basename(target) };
    });
    handle("vdoo:open-link", (_event, url) => openLink(url));
    handle("vdoo:close", () => { closeConfirmed = true; win?.close(); });

    createWindow();
  });
}
