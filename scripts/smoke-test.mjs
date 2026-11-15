// Drives the built app in a hidden Electron window: example schema, diagram clicks, both popup editors, the Mermaid tab,
// then the folder tree, file tabs, the three editor modes and the menu bar.
// Run `npm run build` first. VDOO_SMOKE_SHOTS=folder also saves screenshots there.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { _electron } from "playwright-core";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "vdoo-smoke-"));
const shots = process.env.VDOO_SMOKE_SHOTS;
// A folder for the explorer. The app reopens the folder from its last run, so it is "remembered" here up front.
const folder = fs.mkdtempSync(path.join(os.tmpdir(), "vdoo-smoke-files-"));
fs.mkdirSync(path.join(folder, "docs"));
fs.writeFileSync(path.join(folder, "docs", "inner.txt"), "inside a sub-folder\n");
fs.writeFileSync(path.join(folder, "notes.md"), "# Title\n\nsome text\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n");
fs.writeFileSync(path.join(folder, "page.html"), "<h2>Hello</h2><p onclick=\"x()\">para</p><script>window.pwned = 1</script>");
fs.writeFileSync(path.join(folder, "plain.txt"), "line one\nline <two>\n");
fs.writeFileSync(path.join(folder, "image.bin"), Buffer.from([1, 0, 2, 0]));
fs.writeFileSync(path.join(userData, "workspace.json"), JSON.stringify({ folder }));
const env = { ...process.env, VDOO_TEST_HIDDEN: shots ? "0" : "1", VDOO_TEST_USER_DATA: userData };
delete env.ELECTRON_RUN_AS_NODE; // see scripts/start.mjs
const app = await _electron.launch({ executablePath: require("electron"), args: [root], env });
const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, name + ".png") }); };

try {
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("dialog", (d) => void d.accept());
  await page.setViewportSize?.({ width: 1500, height: 900 });
  await page.getByRole("button", { name: "Open an example" }).click();
  await page.waitForSelector(".diagram svg [data-vdoo-table]");
  console.log("ok  example schema renders");

  const ids = await page.evaluate(() => ({
    tables: [...document.querySelectorAll(".diagram [data-vdoo-table]")].map((n) => n.getAttribute("aria-label")),
    lines: document.querySelectorAll(".diagram .vdoo-hit[data-vdoo-relation]").length,
    labels: document.querySelectorAll(".diagram g.edgeLabel[data-vdoo-relation]").length,
  }));
  assert.deepEqual(ids.tables.sort(), ["Edit table address", "Edit table customer", "Edit table order_item", "Edit table orders", "Edit table product"]);
  assert.equal(ids.lines, 5, "every relationship line is clickable");
  console.log(`ok  5 tables and ${ids.lines} lines (${ids.labels} labels) are mapped to the model`);
  await shot(page, "1-diagram");

  // Table popup: columns, types, PK and FK markers.
  await page.locator('.diagram [aria-label="Edit table order_item"]').click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const rows = await dialog.locator("table.columns tbody tr").evaluateAll((trs) => trs.map((tr) => ({
    name: tr.querySelector('input[aria-label="Column name"]').value,
    type: tr.querySelector('input[aria-label$="data type"]').value,
    pk: tr.querySelector(".badge.pk") !== null, fk: tr.querySelector(".badge.fk") !== null,
    ref: tr.querySelector(".fk-cell").textContent.trim(),
  })));
  assert.deepEqual(rows, [
    { name: "orders_id", type: "int", pk: true, fk: true, ref: "→ orders.id" },
    { name: "product_id", type: "int", pk: true, fk: true, ref: "→ product.id" },
    { name: "quantity", type: "int", pk: false, fk: false, ref: "" },
    { name: "unit_price", type: "decimal(10,2)", pk: false, fk: false, ref: "" },
  ]);
  console.log("ok  table popup lists columns with types, PK and FK (with what each FK references)");
  await shot(page, "2-table-editor");

  // Edit: add a column and save; the diagram redraws with it.
  await dialog.getByRole("button", { name: "+ Add column" }).click();
  await dialog.locator('input[aria-label="Column name"]').last().fill("discount");
  await dialog.getByRole("button", { name: "Save" }).click();
  await page.waitForFunction(() => document.querySelector(".diagram svg")?.textContent.includes("discount"));
  console.log("ok  saving a table redraws the diagram");

  // Relationship popup from a line on the diagram.
  await page.locator(".diagram .vdoo-hit[data-vdoo-relation]").first().click({ force: true });
  await dialog.waitFor();
  const title = await dialog.locator("h2").textContent();
  assert.match(title, /Relationship .+ → .+/);
  const pairs = await dialog.locator("table.pairs tbody tr").count();
  assert.ok(pairs >= 1, "the relationship shows its foreign key columns");
  console.log(`ok  relationship popup opens from a line: ${title}`);
  await shot(page, "3-relation-editor");
  await page.keyboard.press("Escape");

  // Relationship popup from a label too.
  if (ids.labels) {
    await page.locator(".diagram g.edgeLabel[data-vdoo-relation]").first().click({ force: true });
    await dialog.waitFor();
    await page.keyboard.press("Escape");
    console.log("ok  relationship popup opens from a label");
  }

  // Mermaid tab: edit and apply.
  await page.getByRole("tab", { name: "Mermaid" }).click();
  const source = page.getByLabel("Mermaid source");
  const text = await source.inputValue();
  assert.match(text, /^erDiagram/);
  await source.fill(text + "  review {\n    int id PK\n    int product_id FK\n  }\n  product ||--o{ review : has\n");
  await page.getByRole("button", { name: /Apply/ }).click();
  await page.waitForSelector('.diagram [aria-label="Edit table review"]');
  console.log("ok  Mermaid source edits apply to the diagram");

  // Undo removes it again.
  await page.locator(".canvas").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+z");
  await page.waitForFunction(() => !document.querySelector('.diagram [aria-label="Edit table review"]'));
  console.log("ok  undo");

  // View › Column comments hides comments in the drawing only; Fit zooms to show the whole diagram.
  const diagramText = () => page.locator(".diagram svg").textContent();
  assert.match(await diagramText(), /Used to sign in/);
  await page.getByRole("menuitem", { name: "View" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Column comments in diagram" }).click();
  await page.waitForFunction(() => !document.querySelector(".diagram svg")?.textContent.includes("Used to sign in"));
  await page.getByRole("menuitem", { name: "View" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Column comments in diagram" }).click();
  await page.waitForFunction(() => document.querySelector(".diagram svg")?.textContent.includes("Used to sign in"));
  await page.locator(".zoom-level").first().click(); // opening it may have fitted it already
  await page.locator(".zoom").getByRole("button", { name: "Zoom in" }).click();
  await page.locator(".zoom").getByRole("button", { name: "Zoom in" }).click();
  assert.equal(await page.locator(".zoom-level").first().textContent(), "144%");
  await page.locator(".zoom").getByRole("button", { name: "Fit" }).click();
  const fitted = parseInt(await page.locator(".zoom-level").first().textContent(), 10);
  const fits = await page.evaluate(() => {
    const box = document.querySelector(".diagram-scroll"), sizer = document.querySelector(".diagram-sizer");
    return sizer.offsetWidth <= box.clientWidth + 1 && sizer.offsetHeight <= box.clientHeight + 1;
  });
  assert.ok(fitted < 144 && fits, `Fit shows the whole diagram (${fitted}%)`);
  await page.locator(".zoom-level").first().click();
  console.log("ok  column comments can be hidden in the diagram, and Fit shows the whole diagram");

  // Highlight: the table editor's palette colours one table, see-through, in the diagram and the sidebar.
  await page.locator('.diagram [aria-label="Edit table product"]').click();
  await dialog.waitFor();
  await dialog.locator(".color-button").click();
  assert.equal(await dialog.getByRole("radiogroup", { name: "Highlight colour" }).getByRole("radio").count(), 13, "None and twelve colours");
  await dialog.getByRole("radio", { name: "Green" }).click();
  assert.match(await dialog.locator(".color-button").textContent(), /Green/);
  await dialog.getByRole("button", { name: "Save" }).click();
  await page.waitForFunction(() => /fill:\s*(#40c05747|rgba\(64, ?192, ?87)/i.test(document.querySelector('.diagram [aria-label="Edit table product"]')?.innerHTML ?? ""));
  await page.getByRole("tab", { name: "Mermaid" }).click();
  assert.match(await page.getByLabel("Mermaid source").inputValue(), /style product fill:#40c05747/);
  await page.getByRole("tab", { name: "Tables", exact: true }).click();
  assert.match(await page.locator(".outline-item", { hasText: "product" }).first().getAttribute("style"), /background/);
  console.log("ok  a table gets a highlight colour from the palette");

  // A table with many columns: the editor stays inside the window, its body scrolls and Save stays reachable.
  await page.locator('.diagram [aria-label="Edit table product"]').click();
  await dialog.waitFor();
  for (let i = 0; i < 40; i++) await dialog.getByRole("button", { name: "+ Add column" }).click();
  const layout = await page.evaluate(() => {
    const modal = document.querySelector(".modal").getBoundingClientRect(), body = document.querySelector(".modal-body");
    const save = [...document.querySelectorAll(".modal-foot button")].find((b) => b.textContent === "Save").getBoundingClientRect();
    return { inside: modal.top >= 0 && modal.bottom <= window.innerHeight, scrolls: body.scrollHeight > body.clientHeight + 100, saveVisible: save.top >= 0 && save.bottom <= window.innerHeight };
  });
  assert.deepEqual(layout, { inside: true, scrolls: true, saveVisible: true });
  await dialog.getByRole("button", { name: "Save" }).click();
  await dialog.waitFor({ state: "detached" });
  await page.keyboard.press("Control+z"); // drop the 40 columns again
  await page.waitForFunction(() => !document.querySelector(".diagram svg")?.textContent.includes("column_40"));
  console.log("ok  a long table editor scrolls inside the window and Save stays in view");

  // --- Folder tree, file tabs and editor modes ---
  const tabs = page.getByRole("tablist", { name: "Open files" });
  const openTabs = () => tabs.getByRole("tab").allTextContents();
  await page.getByRole("tab", { name: "Files", exact: true }).click();
  const tree = page.getByRole("tree");
  await tree.getByRole("button", { name: "notes.md" }).waitFor();
  assert.deepEqual(await tree.getByRole("button").allTextContents(), ["▸docs", "image.bin", "notes.md", "page.html", "plain.txt"]);
  await tree.getByRole("button", { name: "docs" }).click();
  await tree.getByRole("button", { name: "inner.txt" }).waitFor();
  console.log("ok  the left pane lists the folder (folders first) and opens sub-folders");

  // Markdown: opens in its own tab with a live preview; the toolbar edits the source.
  await tree.getByRole("button", { name: "notes.md" }).click();
  const preview = page.locator(".doc:not([hidden]) .doc-preview");
  await preview.getByRole("heading", { name: "Title" }).waitFor();
  assert.equal(await preview.locator("table td").count(), 2, "tables render in the preview");
  assert.equal(await page.getByRole("group", { name: "Editor mode" }).locator('[aria-pressed="true"]').textContent(), "Markdown");
  const md = page.getByLabel("notes.md text");
  await md.evaluate((el) => el.setSelectionRange(9, 13));
  await page.getByRole("button", { name: "Bold (Ctrl+B)" }).click();
  assert.match(await md.inputValue(), /^# Title\n\n\*\*some\*\* text/);
  await preview.locator("strong", { hasText: "some" }).waitFor();
  assert.match((await openTabs()).join("|"), /notes\.md •/);
  console.log("ok  a Markdown file opens in a tab with a preview, and the toolbar edits it");
  await shot(page, "4-markdown");

  // Editor zoom: + and − scale the text of the file editors; the panes still fill the tab.
  const editorZoom = page.getByRole("group", { name: "Editor zoom" });
  const textWidth = () => preview.getByRole("heading", { name: "Title" }).evaluate((h) => { const r = document.createRange(); r.selectNodeContents(h); return r.getBoundingClientRect().width; });
  const fills = () => page.evaluate(() => { const d = document.querySelector(".doc:not([hidden])"), sp = d.querySelector(".doc-split").getBoundingClientRect(), dr = d.getBoundingClientRect(); return Math.abs(sp.right - dr.right) < 2 && Math.abs(sp.bottom - dr.bottom) < 2; });
  const width100 = await textWidth();
  await editorZoom.getByRole("button", { name: "Zoom in" }).click();
  await editorZoom.getByRole("button", { name: "Zoom in" }).click();
  assert.equal(await editorZoom.getByRole("button", { name: /reset/ }).textContent(), "121%");
  assert.ok(Math.abs((await textWidth()) / width100 - 1.21) < 0.03, "the text is 21% larger");
  assert.ok(await fills(), "the editor still fills the tab when zoomed in");
  await editorZoom.getByRole("button", { name: "Zoom out" }).click();
  await editorZoom.getByRole("button", { name: "Zoom out" }).click();
  await editorZoom.getByRole("button", { name: "Zoom out" }).click();
  assert.equal(await editorZoom.getByRole("button", { name: /reset/ }).textContent(), "91%");
  assert.ok(await fills(), "the editor still fills the tab when zoomed out");
  await editorZoom.getByRole("button", { name: /reset/ }).click();
  assert.ok(Math.abs((await textWidth()) - width100) < 0.5);
  console.log("ok  the editor's + and − buttons zoom the text");

  await page.keyboard.press("Control+s");
  await page.waitForFunction(() => ![...document.querySelectorAll(".doc-tab")].some((t) => t.textContent.includes("•") && t.textContent.includes("notes.md")));
  assert.match(fs.readFileSync(path.join(folder, "notes.md"), "utf8"), /^# Title\n\n\*\*some\*\* text/);
  console.log("ok  Ctrl+S saves the active tab to disk");

  // Text file in a second tab; switching mode does not change the content.
  await tree.getByRole("button", { name: "plain.txt" }).click();
  const plain = page.getByLabel("plain.txt text", { exact: true });
  await plain.waitFor();
  assert.equal(await plain.inputValue(), "line one\nline <two>\n");
  assert.equal((await openTabs()).length, 3, "schema + two files");
  await page.getByRole("group", { name: "Editor mode" }).getByRole("button", { name: "Rich text" }).click();
  const richPlain = page.getByLabel("plain.txt rich text");
  await richPlain.waitFor();
  assert.equal(await richPlain.innerHTML(), "line one<br>line &lt;two&gt;<br>");
  assert.doesNotMatch((await openTabs()).join("|"), /plain\.txt •/, "looking at a file in another mode is not an edit");
  await page.getByRole("menuitem", { name: "Mode" }).click();
  assert.equal(await page.getByRole("menuitemcheckbox", { name: "Rich text" }).getAttribute("aria-checked"), "true");
  await page.getByRole("menuitemcheckbox", { name: "Text", exact: false }).first().click();
  await plain.waitFor();
  assert.equal(await plain.inputValue(), "line one\nline <two>\n");
  console.log("ok  a second file opens in a new tab; Text and Rich text modes switch from the toolbar and the Mode menu");

  // HTML opens as rich text, sanitized; the formatting toolbar edits it.
  await tree.getByRole("button", { name: "page.html" }).click();
  const rich = page.getByLabel("page.html rich text");
  await rich.waitFor();
  assert.equal(await rich.innerHTML(), "<h2>Hello</h2><p>para</p>");
  assert.equal(await page.evaluate(() => window.pwned), undefined);
  await rich.locator("p").selectText();
  await page.getByRole("button", { name: "Bold (Ctrl+B)" }).click();
  assert.match(await rich.innerHTML(), /<p><b>para<\/b><\/p>/);
  console.log("ok  an HTML file opens as rich text without its scripts, and the formatting toolbar works");
  await shot(page, "5-rich-text");

  // Export as PDF: the Save dialog is stubbed in the main process to answer with a path in the folder.
  const pdfOut = path.join(folder, "page-export.pdf");
  await app.evaluate(({ dialog }, out) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: out }); }, pdfOut);
  await page.getByRole("button", { name: "Export PDF" }).click();
  await page.getByRole("status").filter({ hasText: "Exported page-export.pdf" }).waitFor({ timeout: 30_000 });
  const pdfBytes = fs.readFileSync(pdfOut);
  assert.equal(pdfBytes.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdfBytes.length > 1000, "the PDF has content");
  try {
    const { execFileSync } = await import("node:child_process");
    const text = execFileSync("pdftotext", [pdfOut, "-"], { encoding: "utf8" });
    assert.match(text, /Hello[\s\S]*para/);
  } catch (e) { if (e.code !== "ENOENT") throw e; } // pdftotext is optional
  // Even without the page's own CSP, the renderer can't reach the network or local files.
  const http = await import("node:http");
  let hits = 0;
  const server = http.createServer((_req, res) => { hits++; res.end("x"); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await app.evaluate(({ dialog }, out) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: out }); }, path.join(folder, "probe"));
  const probe = await page.evaluate((p) => window.vdooDesktop.exportPdf({ suggestedName: "probe", html:
    `<link rel="stylesheet" href="http://127.0.0.1:${p}/s.css"><img src="http://127.0.0.1:${p}/i.png"><iframe src="file:///etc/hostname"></iframe><p>probe</p>` }), port);
  server.close();
  assert.equal(probe.name, "probe.pdf", ".pdf is added to the chosen name");
  assert.equal(hits, 0, "no request left the PDF renderer");
  await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true }); });
  assert.equal(await page.evaluate(() => window.vdooDesktop.exportPdf({ html: "<p>x</p>", suggestedName: "x" })), null);
  console.log("ok  a file tab exports to PDF, and the PDF renderer can't reach the network");

  // Tabs keep their own content; clicking the tree again goes back to the open tab.
  await tree.getByRole("button", { name: "notes.md" }).click();
  await md.waitFor();
  assert.equal((await openTabs()).length, 4);
  await page.getByRole("button", { name: "Close page.html" }).click(); // unsaved: asks, and the test's dialog handler accepts
  assert.equal((await openTabs()).length, 3);
  console.log("ok  tabs switch and close");

  // Menu bar: File > New file adds an untitled tab; View > Sidebar hides the left pane.
  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "New file" }).click();
  await page.getByLabel("Untitled-1 text").fill("fresh");
  assert.match((await openTabs()).join("|"), /Untitled-1 •/);
  await page.getByRole("menuitem", { name: "View" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Sidebar" }).click();
  assert.equal(await page.locator(".sidebar").count(), 0);
  await page.keyboard.press("Control+Shift+B");
  await page.locator(".sidebar").waitFor();
  await page.keyboard.press("Control+w"); // unsaved Untitled-1: confirm accepted
  assert.equal((await openTabs()).length, 3);
  console.log("ok  the menu bar creates files and toggles the sidebar; Ctrl+W closes the tab");

  // Settings › Default directory: chosen in a dialog, shown in Settings, and where Open then starts.
  const defaultDir = path.join(folder, "docs");
  await app.evaluate(({ dialog }, dir) => {
    globalThis.openDialogs = [];
    dialog.showOpenDialog = async (_win, options) => { globalThis.openDialogs.push(options); return options.title === "Default directory" ? { canceled: false, filePaths: [dir] } : { canceled: true, filePaths: [] }; };
  }, defaultDir);
  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog");
  await settings.getByRole("button", { name: "Choose…" }).click();
  await settings.getByText(defaultDir).waitFor();
  await settings.getByRole("button", { name: "Close" }).click();
  await page.keyboard.press("Control+o");
  await page.keyboard.press("Control+Shift+O");
  await page.waitForFunction(() => true);
  const starts = await app.evaluate(() => globalThis.openDialogs.slice(1).map((o) => [o.title, o.defaultPath]));
  assert.deepEqual(starts, [["Open", defaultDir], ["Open folder", defaultDir]]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(userData, "workspace.json"), "utf8")).defaultDir, defaultDir, "saved for the next start");
  await page.getByRole("button", { name: "Settings" }).click();
  await settings.getByRole("button", { name: "Clear" }).click();
  await settings.getByText(/^Not set/).waitFor();
  await settings.getByRole("button", { name: "Close" }).click();
  console.log("ok  Settings has a default directory, and Open and Open folder start there");

  // Binary files are refused, and the page can't reach files outside what the user opened.
  await tree.getByRole("button", { name: "image.bin" }).click();
  await page.getByRole("status").filter({ hasText: "binary" }).waitFor();
  const outside = await page.evaluate((p) => window.vdooDesktop.files.read(p), path.join(userData, "workspace.json"));
  assert.match(outside.error, /outside/);
  await assert.rejects(page.evaluate((p) => window.vdooDesktop.files.write({ text: "x", file: p, suggestedName: "x" }), path.join(userData, "x.txt")), /outside/);
  console.log("ok  binary files are refused and files outside the opened folder can't be read or written");

  // The schema is still there on its tab.
  await tabs.getByRole("tab").first().click();
  await page.locator('.canvas:not([hidden]) [aria-label="Edit table orders"]').waitFor();
  console.log("ok  the schema tab still shows the diagram");

  // Uses your real AI provider (and a little of your plan), so only when asked: VDOO_SMOKE_AI=1.
  if (process.env.VDOO_SMOKE_AI === "1") {
    const composer = page.getByPlaceholder("Ask about this schema…");
    await composer.waitFor({ timeout: 30_000 });
    await composer.fill("Add a review table for products with a 1-5 rating and the customer who wrote it. Reply with the full revised schema.");
    await page.keyboard.press("Enter");
    const apply = page.getByRole("button", { name: "Apply to diagram" });
    await apply.waitFor({ timeout: 240_000 });
    await shot(page, "6-ai-answer");
    await apply.click();
    await page.waitForFunction(() => [...document.querySelectorAll(".diagram [data-vdoo-table]")].some((n) => /review/i.test(n.getAttribute("aria-label"))), null, { timeout: 30_000 });
    console.log("ok  AI answer applies to the diagram");
    await shot(page, "7-ai-applied");
  }

  // The schema tab's close icon asks (the test accepts) and leaves an empty schema; then there is nothing to close.
  await tabs.getByRole("button", { name: /^Close (Unsaved schema|.*\.vdoo)$/ }).click();
  await page.locator(".diagram-empty").waitFor();
  assert.equal(await tabs.locator(".doc-tab").first().locator(".doc-tab-close").count(), 0);
  console.log("ok  the schema tab's close icon closes the schema");

  // Chromium reports page.html's onclick as blocked by the CSP while the sanitizer parses it; that is the CSP working.
  assert.deepEqual(errors.filter((e) => !/Autofill|DevTools|Executing inline event handler violates/.test(e)), []);
  console.log("ok  no page errors");
} finally {
  await app.close();
  fs.rmSync(userData, { recursive: true, force: true });
  fs.rmSync(folder, { recursive: true, force: true });
}
