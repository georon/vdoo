// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { docBodyHtml, docToPrintHtml, pdfName, printDocument } from "./exportPdf";

describe("docBodyHtml", () => {
  test("renders Markdown with GitHub extensions, as in the preview", () => {
    const html = docBodyHtml("# Title\n\n**bold** and ~~gone~~\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done", "markdown");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<del>gone</del>");
    expect(html).toContain("<table>");
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*checked/);
  });

  test("skips HTML embedded in Markdown", () => {
    const html = docBodyHtml("hi <script>alert(1)</script> <img src=x onerror=alert(1)>", "markdown");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
  });

  test("sanitizes rich text and keeps its formatting", () => {
    const html = docBodyHtml('<p><b>bold</b><img src="x" onerror="alert(1)"></p><script>alert(2)</script>', "rich");
    expect(html).toContain("<b>bold</b>");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("<script");
  });

  test("rich text that is still plain text keeps its line breaks, escaped", () => {
    expect(docBodyHtml("a < b\nnext", "rich")).toBe("a &lt; b<br>next");
  });

  test("plain text is escaped into a pre block", () => {
    expect(docBodyHtml("List<String> & <b>", "text")).toBe('<pre class="plain">List&lt;String&gt; &amp; &lt;b&gt;</pre>');
  });
});

test("the page has a locked-down CSP and an escaped title", () => {
  const page = printDocument('Notes <"x">', "<p>hi</p>");
  expect(page).toContain("default-src 'none'");
  expect(page).toContain("<title>Notes &lt;&quot;x&quot;&gt;</title>");
  expect(page).toContain("<p>hi</p>");
  expect(docToPrintHtml({ name: "readme.md", content: "# Hi", mode: "markdown" })).toContain("<title>readme</title>");
});

test("pdfName swaps the extension for .pdf", () => {
  expect(pdfName("notes.md")).toBe("notes.pdf");
  expect(pdfName("Untitled-1")).toBe("Untitled-1.pdf");
  expect(pdfName(".md")).toBe("Untitled.pdf");
});
