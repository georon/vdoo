import { memo, useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import DOMPurify from "dompurify";
import { type DocMode, findMatch, looksLikeHtml, markdownEdit, plainToHtml } from "./textEdit";

/** One file tab. `content` is always a string: the file's text, or HTML once it has been edited as rich text. */
export interface Doc { id: string; path: string | null; name: string; content: string; saved: string; mode: DocMode }

const RICH_BUTTONS: ([string, string, string] | null)[] = [
  ["bold", "B", "Bold (Ctrl+B)"], ["italic", "I", "Italic (Ctrl+I)"], ["underline", "U", "Underline (Ctrl+U)"], ["strikeThrough", "S", "Strikethrough"], null,
  ["bigger", "A+", "Bigger font"], ["smaller", "A−", "Smaller font"], null,
  ["insertUnorderedList", "• List", "Bullet list"], ["insertOrderedList", "1. List", "Numbered list"], null,
  ["justifyLeft", "Left", "Align left"], ["justifyCenter", "Center", "Center"], ["justifyRight", "Right", "Align right"], null,
  ["undo", "↶", "Undo"], ["redo", "↷", "Redo"], ["removeFormat", "Clear", "Clear formatting"],
];
const RICH_STATES = ["bold", "italic", "underline", "strikeThrough", "insertUnorderedList", "insertOrderedList", "justifyLeft", "justifyCenter", "justifyRight"];

const MD_BUTTONS: ([string, string, string] | null)[] = [
  ["bold", "B", "Bold (Ctrl+B)"], ["italic", "I", "Italic (Ctrl+I)"], ["strike", "S", "Strikethrough"], ["code", "</>", "Inline code"], null,
  ["h1", "H1", "Heading 1"], ["h2", "H2", "Heading 2"], ["h3", "H3", "Heading 3"], null,
  ["ul", "• List", "Bullet list"], ["ol", "1. List", "Numbered list"], ["task", "☑ Task", "Task list"], ["quote", "❝ Quote", "Quote"], null,
  ["link", "Link", "Link (Ctrl+K)"], ["image", "Image", "Image"], ["codeblock", "{ }", "Code block"], ["table", "Table", "Table"], ["hr", "―", "Horizontal rule"], null,
  ["undo", "↶", "Undo"], ["redo", "↷", "Redo"],
];

/** Asks the file tab that is showing to open its find bar (Ctrl+F, Edit › Find). */
export const FIND_EVENT = "vdoo:find";
const FIND_HIGHLIGHT = "vdoo-find";

/** The text nodes of the rich text editor, in order; their joined text is what Find searches. */
function textNodes(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  return nodes;
}

/** The node and offset inside it for a position in the joined text. A position between two nodes belongs to the later one, unless `end`. */
function pointAt(nodes: Text[], position: number, end = false): [Text, number] {
  let before = 0;
  for (const node of nodes) {
    const here = position - before;
    if (here < node.length || (end && here === node.length)) return [node, here];
    before += node.length;
  }
  const last = nodes[nodes.length - 1];
  return [last, last.length];
}

interface Box { top: number; left: number; width: number; height: number }

/**
 * Scrolls a textarea so value[index, index + length) is in view and returns where that text is drawn, measured from
 * the top left of the textarea's content. A textarea doesn't say where its text is, so the text is laid out in a
 * hidden copy with the same width, font and wrapping.
 */
function scrollTextTo(el: HTMLTextAreaElement, index: number, length: number): Box {
  const style = getComputedStyle(el), copy = document.createElement("div"), mark = document.createElement("span");
  for (const name of ["fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "tabSize", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"] as const) {
    copy.style[name] = style[name];
  }
  Object.assign(copy.style, { position: "absolute", visibility: "hidden", top: "0", left: "0", boxSizing: "border-box", width: `${el.clientWidth}px`,
    whiteSpace: "pre-wrap", overflowWrap: "break-word" });
  copy.textContent = el.value.slice(0, index);
  mark.textContent = el.value.slice(index, index + length);
  copy.append(mark);
  el.parentElement?.append(copy); // beside the textarea, so it is zoomed the same
  const box = { top: mark.offsetTop, left: mark.offsetLeft, width: mark.offsetWidth, height: mark.offsetHeight };
  copy.remove();
  if (box.top < el.scrollTop || box.top + box.height > el.scrollTop + el.clientHeight) el.scrollTop = Math.max(0, box.top - el.clientHeight / 3);
  return box;
}

/** Plain text keeps its line breaks in the rich text view; HTML is sanitized before it is shown. */
const toDisplayHtml = (content: string) => (looksLikeHtml(content) ? DOMPurify.sanitize(content) : plainToHtml(content));

/**
 * The editor for one file tab, in the tab's mode: plain text, rich text (WYSIWYG, saved as HTML) or Markdown with a
 * live preview. Every open tab keeps its editor mounted (hidden when another tab is showing), so each has its own
 * undo history, selection and scroll position. Switching mode never changes the content, only how it is shown.
 */
export const DocEditor = memo(function DocEditor({ doc, hidden, zoom = 1, onChange }: { doc: Doc; hidden: boolean; zoom?: number; onChange: (id: string, content: string) => void }) {
  const text = useRef<HTMLTextAreaElement>(null);
  const rich = useRef<HTMLDivElement>(null);
  const [states, setStates] = useState<string[]>([]);
  const { mode } = doc;
  const findInput = useRef<HTMLInputElement>(null);
  const [finding, setFinding] = useState(false);
  const [findNote, setFindNote] = useState("");
  // Where the cursor or selection is in the rich text, as positions in its joined text. Kept up to date here because
  // the page's selection can't be read back while the find box has the focus.
  const richAt = useRef({ start: 0, end: 0 });
  // The match in the rich text. It is painted as a highlight while the find box has the focus (the page's selection
  // isn't shown then) and becomes the selection when the bar closes.
  const richMatch = useRef<Range | null>(null);
  const showRichMatch = (range: Range | null) => {
    richMatch.current = range;
    if (range) CSS.highlights?.set(FIND_HIGHLIGHT, new Highlight(range)); else CSS.highlights?.delete(FIND_HIGHLIGHT);
  };
  // The match in the text. A textarea doesn't show its selection while the find box has the focus, so a marker is
  // laid over the match and follows the scrolling.
  const textMark = useRef<HTMLDivElement>(null);
  const textMatch = useRef<Box | null>(null);
  const showTextMatch = (box: Box | null = textMatch.current) => {
    const el = text.current, mark = textMark.current;
    textMatch.current = box;
    if (!el || !mark) return;
    const top = box ? box.top - el.scrollTop : 0;
    mark.hidden = !box || top + box.height < 0 || top > el.clientHeight;
    if (box) Object.assign(mark.style, { top: `${el.offsetTop + top}px`, left: `${el.offsetLeft + box.left - el.scrollLeft}px`, width: `${box.width}px`, height: `${box.height}px` });
  };
  // Neither outlives what it was measured for: another tab, mode or zoom, a closed bar, a window of another size.
  useEffect(() => {
    const clear = () => { showRichMatch(null); showTextMatch(null); };
    clear();
    if (hidden || !finding) return;
    window.addEventListener("resize", clear);
    return () => window.removeEventListener("resize", clear);
  }, [hidden, mode, finding, zoom]);

  // The editors are uncontrolled (the browser keeps their undo history); the one for the new mode is filled here.
  useLayoutEffect(() => {
    if (mode === "rich") { if (rich.current) rich.current.innerHTML = toDisplayHtml(doc.content); }
    else if (text.current && text.current.value !== doc.content) text.current.value = doc.content;
  }, [mode]); // only when the mode changes: typing must not refill the editor

  useEffect(() => { if (!hidden) (mode === "rich" ? rich.current : text.current)?.focus(); }, [hidden, mode]);

  useEffect(() => {
    if (hidden || mode !== "rich") return;
    const update = () => {
      const selection = document.getSelection();
      if (!rich.current || !selection?.rangeCount || !rich.current.contains(selection.anchorNode)) return;
      const range = selection.getRangeAt(0), before = document.createRange();
      before.setStart(rich.current, 0);
      before.setEnd(range.startContainer, range.startOffset);
      const start = before.toString().length;
      richAt.current = { start, end: start + range.toString().length };
      const next = RICH_STATES.filter((command) => document.queryCommandState(command));
      setStates((was) => (was.join() === next.join() ? was : next));
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [hidden, mode]);

  // Ctrl+F or Edit › Find: opens the find bar with the selected text, if it is a few words on one line.
  useEffect(() => {
    if (hidden) return;
    const open = () => {
      const el = text.current;
      const selected = mode === "rich" ? (rich.current?.contains(document.getSelection()?.anchorNode ?? null) ? String(document.getSelection()) : "")
        : el ? el.value.slice(el.selectionStart, el.selectionEnd) : "";
      setFinding(true); setFindNote("");
      // After the bar has rendered.
      setTimeout(() => {
        const input = findInput.current;
        if (!input) return;
        if (selected && selected.length <= 200 && !selected.includes("\n")) input.value = selected;
        input.focus(); input.select();
      });
    };
    window.addEventListener(FIND_EVENT, open);
    return () => window.removeEventListener(FIND_EVENT, open);
  }, [hidden, mode]);

  /**
   * Selects the next match below the cursor (or the previous one above it) and scrolls to it. `fromStart` searches
   * from where the selection begins, so a match grows as more of it is typed; otherwise from where it ends.
   */
  const find = (backwards = false, fromStart = false) => {
    const query = findInput.current?.value ?? "";
    if (!query) { setFindNote(""); return; }
    const note = (match: { wrapped: boolean } | null) =>
      setFindNote(!match ? "No matches" : match.wrapped ? (backwards ? "Continued from the bottom" : "Continued from the top") : "");
    if (mode === "rich") {
      const root = rich.current;
      if (!root) return;
      const nodes = textNodes(root), at = richAt.current;
      const match = findMatch(nodes.map((n) => n.data).join(""), query, backwards || fromStart ? at.start : at.end, backwards);
      note(match);
      if (!match) { showRichMatch(null); return; }
      const range = document.createRange();
      range.setStart(...pointAt(nodes, match.index));
      range.setEnd(...pointAt(nodes, match.index + match.length, true));
      showRichMatch(range);
      richAt.current = { start: match.index, end: match.index + match.length };
      // Rectangles are in zoomed pixels, scrollTop is not.
      const found = range.getBoundingClientRect(), box = root.getBoundingClientRect();
      if (found.top < box.top || found.bottom > box.bottom) root.scrollTop += (found.top - box.top - box.height / 3) / zoom;
      return;
    }
    const el = text.current;
    if (!el) return;
    const match = findMatch(el.value, query, backwards || fromStart ? el.selectionStart : el.selectionEnd, backwards);
    note(match);
    if (!match) { showTextMatch(null); return; }
    el.setSelectionRange(match.index, match.index + match.length);
    showTextMatch(scrollTextTo(el, match.index, match.length));
  };
  const closeFind = () => {
    const range = mode === "rich" ? richMatch.current : null;
    setFinding(false); setFindNote("");
    (mode === "rich" ? rich.current : text.current)?.focus();
    if (range) { document.getSelection()?.removeAllRanges(); document.getSelection()?.addRange(range); }
  };

  const runRich = (command: string) => {
    rich.current?.focus();
    if (command === "bigger" || command === "smaller") {
      const size = parseInt(document.queryCommandValue("fontSize"), 10) || 3;
      document.execCommand("fontSize", false, String(Math.min(7, Math.max(1, size + (command === "bigger" ? 1 : -1)))));
    } else document.execCommand(command);
    if (rich.current) onChange(doc.id, rich.current.innerHTML);
  };

  // Applied with insertText so the textarea's own undo history keeps working; that also fires `input`.
  const runMarkdown = (action: string) => {
    const el = text.current;
    if (!el) return;
    el.focus();
    if (action === "undo" || action === "redo") { document.execCommand(action); return; }
    const edit = markdownEdit(action, el.value, el.selectionStart, el.selectionEnd);
    if (!edit) return;
    el.setSelectionRange(edit.start, edit.end);
    document.execCommand("insertText", false, edit.text);
    el.setSelectionRange(edit.start + edit.selStart, edit.start + edit.selEnd);
  };

  const toolbar = (label: string, buttons: typeof RICH_BUTTONS, run: (action: string) => void) =>
    <div className="format-bar" role="toolbar" aria-label={label} onMouseDown={(event) => event.preventDefault()}>
      {buttons.map((button, i) => button === null ? <span key={i} className="sep" />
        : <button key={button[0]} className={`fmt${states.includes(button[0]) && mode === "rich" ? " on" : ""}`} title={button[2]} aria-label={button[2]}
          tabIndex={-1} onClick={() => run(button[0])}>{button[1]}</button>)}
    </div>;

  return <div className="doc" hidden={hidden} data-mode={mode}>
    {mode === "rich" && toolbar("Rich text formatting", RICH_BUTTONS, runRich)}
    {mode === "markdown" && toolbar("Markdown formatting", MD_BUTTONS, runMarkdown)}
    {finding && <div className="find-bar" role="search" onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); closeFind(); }
      else if (event.key === "Enter") { event.preventDefault(); find(event.shiftKey); }
    }}>
      <input ref={findInput} type="search" aria-label="Find in file" placeholder="Find" spellCheck={false} autoComplete="off" onInput={() => find(false, true)} />
      <button className="fmt" title="Previous match (Shift+Enter)" aria-label="Previous match" onClick={() => find(true)}>↑</button>
      <button className="fmt" title="Next match (Enter)" aria-label="Next match" onClick={() => find()}>↓</button>
      <span className="find-note" role="status">{findNote}</span>
      <button className="fmt" title="Close (Esc)" aria-label="Close find" onClick={closeFind}>×</button>
    </div>}
    {/* The zoom scales the text (source, preview and rich text) while the panes keep filling the tab. */}
    <div className="doc-split" style={{ zoom }}>
      <textarea ref={text} className="doc-text" hidden={mode === "rich"} spellCheck={false} aria-label={`${doc.name} text`} defaultValue={doc.content}
        onInput={(event) => { showTextMatch(null); onChange(doc.id, event.currentTarget.value); }}
        onMouseDown={() => showTextMatch(null)} onScroll={() => showTextMatch()}
        onKeyDown={(event) => {
          if (mode !== "markdown" || !(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
          const action = ({ b: "bold", i: "italic", k: "link" } as Record<string, string>)[event.key.toLowerCase()];
          if (action) { event.preventDefault(); runMarkdown(action); }
        }} />
      <div ref={textMark} className="find-mark" hidden />
      {mode === "markdown" && <Preview text={doc.content} />}
      <div ref={rich} className="doc-rich prose" hidden={mode !== "rich"} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true"
        aria-label={`${doc.name} rich text`} onInput={(event) => onChange(doc.id, event.currentTarget.innerHTML)}
        onMouseDown={() => showRichMatch(null)}
        onClick={(event) => { if ((event.target as HTMLElement).closest("a")) event.preventDefault(); }} />
    </div>
  </div>;
});

/** The rendered Markdown. HTML inside the Markdown is not rendered; links open in the browser after asking. */
function Preview({ text }: { text: string }) {
  const deferred = useDeferredValue(text);
  return <div className="doc-preview prose" aria-label="Markdown preview">
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
      a: ({ href, children }) => <a href={href} onClick={(event) => {
        event.preventDefault();
        if (href && /^https?:/i.test(href)) void (window.vdooDesktop?.openLink(href) ?? window.open(href, "_blank", "noopener"));
      }}>{children}</a>,
    }}>{deferred}</ReactMarkdown>
  </div>;
}
