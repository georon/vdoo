// Turns a file tab into a standalone, print-styled HTML page for "Export as PDF". The desktop shell renders that page
// with JavaScript off and no network (electron/pdf.cjs); the browser build prints it from a sandboxed frame.
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import DOMPurify from "dompurify";
import { type DocMode, looksLikeHtml, plainToHtml } from "./textEdit";

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The file name without its extension, used as the PDF's title and suggested file name. */
export const pdfName = (name: string) => `${name.replace(/\.[^./\\]+$/, "") || "Untitled"}.pdf`;

/** The body of the page: Markdown rendered as in the preview, rich text sanitized, plain text kept as it is. */
export function docBodyHtml(content: string, mode: DocMode): string {
  if (mode === "markdown") {
    // Same rendering as the preview: GitHub-flavoured Markdown, embedded HTML skipped.
    return renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{content}</ReactMarkdown>);
  }
  if (mode === "rich") return DOMPurify.sanitize(looksLikeHtml(content) ? content : plainToHtml(content));
  return `<pre class="plain">${escapeHtml(content)}</pre>`;
}

// Light, print-friendly styles whatever the app theme is. Kept short: the page has no other stylesheet.
const PRINT_CSS = `
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: #1d1f24; background: #fff; font: 11pt/1.55 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; overflow-wrap: break-word; }
h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.3em 0 0.5em; break-after: avoid; page-break-after: avoid; }
h1 { font-size: 1.9em; border-bottom: 1px solid #d8dbe2; padding-bottom: 0.25em; }
h2 { font-size: 1.45em; border-bottom: 1px solid #e6e8ed; padding-bottom: 0.2em; }
h3 { font-size: 1.2em; }
body > :first-child { margin-top: 0; }
p, ul, ol, blockquote, pre, table { margin: 0 0 0.9em; }
ul, ol { padding-left: 1.6em; }
li + li { margin-top: 0.2em; }
li > input[type=checkbox] { margin: 0 0.4em 0 -1.2em; vertical-align: middle; }
li:has(> input[type=checkbox]) { list-style: none; }
a { color: #1f5fbf; text-decoration: underline; }
blockquote { margin-left: 0; padding: 0.1em 1em; border-left: 3px solid #c9cdd6; color: #4a4f5a; }
code, pre { font-family: ui-monospace, "Cascadia Code", Menlo, Consolas, monospace; font-size: 0.9em; }
code { background: #f1f2f5; border-radius: 3px; padding: 0.1em 0.3em; }
pre { background: #f6f7f9; border: 1px solid #e3e5ea; border-radius: 4px; padding: 0.7em 0.9em; white-space: pre-wrap; break-inside: avoid; }
pre code { background: none; padding: 0; font-size: 1em; }
pre.plain { background: none; border: none; padding: 0; font-size: 10pt; line-height: 1.45; break-inside: auto; }
table { border-collapse: collapse; width: auto; max-width: 100%; }
th, td { border: 1px solid #cfd3db; padding: 0.35em 0.6em; text-align: left; vertical-align: top; }
th { background: #f1f2f5; }
tr { break-inside: avoid; }
img { max-width: 100%; height: auto; }
hr { border: none; border-top: 1px solid #d8dbe2; margin: 1.5em 0; }
`;

/**
 * The whole page. Its CSP allows only inline styles and data: images, so nothing in the document (an image link,
 * a stylesheet) can reach the network or local files while it is rendered.
 */
export function printDocument(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">
<title>${escapeHtml(title)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

/** The print page for one file tab. */
export const docToPrintHtml = (doc: { name: string; content: string; mode: DocMode }) =>
  printDocument(doc.name.replace(/\.[^./\\]+$/, "") || "Untitled", docBodyHtml(doc.content, doc.mode));

/** Browser build only: prints the page from a hidden frame that can't run scripts; the user picks "Save as PDF". */
export function printInBrowser(html: string) {
  const frame = Object.assign(document.createElement("iframe"), { srcdoc: html });
  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden";
  frame.onload = () => {
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  };
  document.body.appendChild(frame);
}
