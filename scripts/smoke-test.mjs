// Drives the built app in a hidden Electron window: example schema, diagram clicks, both popup editors, the Mermaid tab.
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
const env = { ...process.env, VDOO_TEST_HIDDEN: shots ? "0" : "1", VDOO_TEST_USER_DATA: userData };
delete env.ELECTRON_RUN_AS_NODE; // see scripts/start.mjs
const app = await _electron.launch({ executablePath: require("electron"), args: [root], env });
const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, name + ".png") }); };

try {
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
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

  // Uses your real AI provider (and a little of your plan), so only when asked: VDOO_SMOKE_AI=1.
  if (process.env.VDOO_SMOKE_AI === "1") {
    const composer = page.getByPlaceholder("Ask about this schema…");
    await composer.waitFor({ timeout: 30_000 });
    await composer.fill("Add a review table for products with a 1-5 rating and the customer who wrote it. Reply with the full revised schema.");
    await page.keyboard.press("Enter");
    const apply = page.getByRole("button", { name: "Apply to diagram" });
    await apply.waitFor({ timeout: 240_000 });
    await shot(page, "4-ai-answer");
    await apply.click();
    await page.waitForFunction(() => [...document.querySelectorAll(".diagram [data-vdoo-table]")].some((n) => /review/i.test(n.getAttribute("aria-label"))), null, { timeout: 30_000 });
    console.log("ok  AI answer applies to the diagram");
    await shot(page, "5-ai-applied");
  }

  assert.deepEqual(errors.filter((e) => !/Autofill|DevTools/.test(e)), []);
  console.log("ok  no page errors");
} finally {
  await app.close();
  fs.rmSync(userData, { recursive: true, force: true });
}
