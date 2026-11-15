// Tests for the PDF export helpers. Run with: node --test scripts/test-pdf.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { paperFor, pdfFileName } = require("../electron/pdf.cjs");

test("paperFor picks Letter in Letter countries and A4 elsewhere", () => {
  assert.equal(paperFor("en-US"), "Letter");
  assert.equal(paperFor("en-CA"), "Letter");
  assert.equal(paperFor("en-GB"), "A4");
  assert.equal(paperFor("de"), "A4");
  assert.equal(paperFor(undefined), "A4");
});

test("pdfFileName makes a safe .pdf name", () => {
  assert.equal(pdfFileName("notes.pdf"), "notes.pdf");
  assert.equal(pdfFileName("a/b:c"), "a_b_c.pdf");
  assert.equal(pdfFileName(""), "Untitled.pdf");
});
