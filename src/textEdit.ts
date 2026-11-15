// Pure helpers for the file tabs (no DOM, no Electron): which editor a file opens in, and the Markdown toolbar edits.

export type DocMode = "text" | "rich" | "markdown";

export const MODE_LABELS: Record<DocMode, string> = { text: "Text", rich: "Rich text", markdown: "Markdown" };
export const DEFAULT_NAMES: Record<DocMode, string> = { text: "Untitled.txt", rich: "Untitled.html", markdown: "Untitled.md" };

export const modeForPath = (path: string | null | undefined): DocMode =>
  /\.html?$/i.test(path ?? "") ? "rich" : /\.(md|markdown)$/i.test(path ?? "") ? "markdown" : "text";

/** Files that hold a schema open in the diagram editor instead of a file tab. */
export const isSchemaPath = (path: string) => /\.(vdoo|mmd|mermaid)$/i.test(path);

export const baseName = (path: string | null | undefined) => (path ? path.split(/[\\/]/).pop()! : "Untitled");

// Only real HTML tags count, so plain text such as "List<String>" or "<two>" is not mistaken for markup and dropped.
const HTML_TAG = /<\/?(html|head|body|div|span|p|br|hr|h[1-6]|b|i|u|s|em|strong|strike|font|a|img|ul|ol|li|table|tr|td|th|blockquote|pre|code|sub|sup)\b[^<>]*>/i;
export const looksLikeHtml = (content: string) => HTML_TAG.test(content);

/** Plain text as HTML for the rich text view: escaped, line breaks kept. */
export const plainToHtml = (content: string) =>
  content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");

/** Replaces value[start, end) with `text`, then selects [start + selStart, start + selEnd] in the new value. */
export interface TextEdit { start: number; end: number; text: string; selStart: number; selEnd: number }

const edit = (start: number, end: number, text: string, selStart: number, selEnd: number): TextEdit => ({ start, end, text, selStart, selEnd });

export const applyEdit = (value: string, e: TextEdit) => value.slice(0, e.start) + e.text + value.slice(e.end);

function wrapSelection(value: string, s: number, e: number, before: string, after: string, placeholder: string) {
  const sel = value.slice(s, e) || placeholder;
  return edit(s, e, before + sel + after, before.length, before.length + sel.length);
}

// Toggles a per-line marker over the lines the selection touches: when every line already matches `is` the marker
// is removed; otherwise any existing marker is stripped and `make(i)` is added.
function prefixLines(value: string, s: number, e: number, make: (index: number) => string, is: RegExp, strip: RegExp) {
  const start = value.lastIndexOf("\n", s - 1) + 1;
  let end = value.indexOf("\n", e);
  if (end === -1) end = value.length;
  const lines = value.slice(start, end).split("\n");
  const allMarked = lines.every((l) => is.test(l));
  const text = lines.map((l, i) => (allMarked ? l.replace(strip, "") : make(i) + l.replace(strip, ""))).join("\n");
  return edit(start, end, text, 0, text.length);
}

// Inserts a block, starting on a new line when the cursor is mid-line.
function insertBlock(value: string, s: number, e: number, text: string, selFrom = 0, selTo = 0) {
  const lead = s > 0 && value[s - 1] !== "\n" ? "\n" : "";
  return edit(s, e, lead + text, lead.length + selFrom, lead.length + (selTo || text.length));
}

const LIST_MARK = /^(- \[[ xX]\] |[-*+] |\d+\. )/;
type Action = (value: string, s: number, e: number) => TextEdit;
const heading = (n: number): Action => (v, s, e) => prefixLines(v, s, e, () => "#".repeat(n) + " ", new RegExp(`^#{${n}} `), /^#{1,6} /);

const markdownActions: Record<string, Action> = {
  bold: (v, s, e) => wrapSelection(v, s, e, "**", "**", "bold"),
  italic: (v, s, e) => wrapSelection(v, s, e, "*", "*", "italic"),
  strike: (v, s, e) => wrapSelection(v, s, e, "~~", "~~", "text"),
  code: (v, s, e) => wrapSelection(v, s, e, "`", "`", "code"),
  h1: heading(1),
  h2: heading(2),
  h3: heading(3),
  ul: (v, s, e) => prefixLines(v, s, e, () => "- ", /^- (?!\[)/, LIST_MARK),
  ol: (v, s, e) => prefixLines(v, s, e, (i) => `${i + 1}. `, /^\d+\. /, LIST_MARK),
  task: (v, s, e) => prefixLines(v, s, e, () => "- [ ] ", /^- \[[ xX]\] /, LIST_MARK),
  quote: (v, s, e) => prefixLines(v, s, e, () => "> ", /^> /, /^> ?/),
  link: (v, s, e) => {
    const label = v.slice(s, e) || "link text";
    return edit(s, e, `[${label}](url)`, label.length + 3, label.length + 6); // selects "url" so it can be typed over
  },
  image: (v, s, e) => wrapSelection(v, s, e, "![", "](url)", "alt text"),
  codeblock: (v, s, e) => {
    const sel = v.slice(s, e) || "code";
    return insertBlock(v, s, e, "```\n" + sel + "\n```\n", 4, 4 + sel.length);
  },
  table: (v, s, e) => insertBlock(v, s, e, "| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |\n", 2, 10),
  hr: (v, s, e) => insertBlock(v, s, e, "\n---\n"),
};

/** The edit for a Markdown toolbar action, or null when `action` isn't a text edit. */
export const markdownEdit = (action: string, value: string, s: number, e: number): TextEdit | null =>
  Object.hasOwn(markdownActions, action) ? markdownActions[action](value, s, e) : null;

export interface TextMatch { index: number; length: number; wrapped: boolean }

/**
 * Where `query` occurs next in `text`, ignoring case. Forwards, the first match starting at or after `from`;
 * backwards, the last match ending at or before `from`. With none left in that direction the search carries on from
 * the other end of the text (`wrapped`). Null when the text doesn't contain the query.
 */
export function findMatch(text: string, query: string, from: number, backwards = false): TextMatch | null {
  if (!query) return null;
  const matches = [...text.matchAll(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"))];
  if (!matches.length) return null;
  const found = backwards ? matches.findLast((m) => m.index + m[0].length <= from) : matches.find((m) => m.index >= from);
  const match = found ?? (backwards ? matches[matches.length - 1] : matches[0]);
  return { index: match.index, length: match[0].length, wrapped: !found };
}
