// "Export as PDF": the page sends a finished, self-contained HTML document (src/exportPdf.tsx); it is rendered here
// in a hidden window with JavaScript off and an in-memory session that refuses every request except the document
// itself, then printed to PDF and saved where the user chose.
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const MAX_HTML_CHARS = 50 * 1024 * 1024; // rich text can hold data: images
const RENDER_TIMEOUT_MS = 30_000;
const PARTITION = "vdoo-pdf"; // no "persist:" prefix, so nothing is written to disk

/** Paper size from the system locale: Letter where it is the norm, A4 elsewhere. */
const paperFor = (locale) => (/^(en-(US|CA|PH)|es-(US|MX|CO|VE|CL)|fr-CA)$/i.test(String(locale)) ? "Letter" : "A4");

/** A file name that is safe for the save dialog and ends in .pdf. */
const pdfFileName = (name) => {
  const base = String(name || "Untitled").replace(/[\\/:*?"<>|]/g, "_").replace(/\.pdf$/i, "").trim() || "Untitled";
  return `${base}.pdf`;
};

const allowed = new Set();
let sessionReady = null;
function pdfSession(session) {
  if (sessionReady) return sessionReady;
  const ses = session.fromPartition(PARTITION, { cache: false });
  ses.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !allowed.has(details.url) }));
  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  sessionReady = ses;
  return ses;
}

/** Renders `html` and returns the PDF bytes. */
async function renderPdf(html, { BrowserWindow, session, pageSize = "A4" }) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "vdoo-pdf-"));
  const file = path.join(dir, "document.html");
  const url = pathToFileURL(file).href;
  let win = null;
  try {
    await fsp.writeFile(file, html, "utf8");
    allowed.add(url);
    win = new BrowserWindow({
      show: false, width: 900, height: 1200,
      webPreferences: { session: pdfSession(session), javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false,
        webSecurity: true, images: true, spellcheck: false },
    });
    const contents = win.webContents;
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event) => event.preventDefault());
    let timer;
    await Promise.race([
      win.loadURL(url),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("The document took too long to render.")), RENDER_TIMEOUT_MS); }),
    ]).finally(() => clearTimeout(timer));
    return await contents.printToPDF({
      pageSize, printBackground: true,
      margins: { top: 0.75, bottom: 0.75, left: 0.75, right: 0.75 }, // inches
      generateDocumentOutline: true, generateTaggedPDF: true,
    });
  } finally {
    allowed.delete(url);
    if (win && !win.isDestroyed()) win.destroy();
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function register(handle, { dialog, getWindow, BrowserWindow, session, locale, startDir = () => null }) {
  // Asks where first, so nothing is rendered when the dialog is cancelled. Returns null when it is.
  handle("vdoo:export-pdf", async (_event, { html, suggestedName }) => {
    if (typeof html !== "string" || !html || html.length > MAX_HTML_CHARS) throw new Error("Nothing to export.");
    const result = await dialog.showSaveDialog(getWindow(), {
      title: "Export as PDF", defaultPath: startDir() ? path.join(startDir(), pdfFileName(suggestedName)) : pdfFileName(suggestedName), filters: [{ name: "PDF document", extensions: ["pdf"] }],
    });
    if (result.canceled || !result.filePath) return null;
    const target = /\.pdf$/i.test(result.filePath) ? result.filePath : `${result.filePath}.pdf`;
    const pdf = await renderPdf(html, { BrowserWindow, session, pageSize: paperFor(locale()) });
    await fsp.writeFile(target + ".tmp", pdf);
    await fsp.rename(target + ".tmp", target);
    return { path: target, name: path.basename(target) };
  });
}

module.exports = { register, renderPdf, paperFor, pdfFileName };
