import { memo, useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import DOMPurify from "dompurify";
import { type DocMode, looksLikeHtml, markdownEdit, plainToHtml } from "./textEdit";

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

  // The editors are uncontrolled (the browser keeps their undo history); the one for the new mode is filled here.
  useLayoutEffect(() => {
    if (mode === "rich") { if (rich.current) rich.current.innerHTML = toDisplayHtml(doc.content); }
    else if (text.current && text.current.value !== doc.content) text.current.value = doc.content;
  }, [mode]); // only when the mode changes: typing must not refill the editor

  useEffect(() => { if (!hidden) (mode === "rich" ? rich.current : text.current)?.focus(); }, [hidden, mode]);

  useEffect(() => {
    if (hidden || mode !== "rich") return;
    const update = () => {
      if (!rich.current?.contains(document.getSelection()?.anchorNode ?? null)) return;
      const next = RICH_STATES.filter((command) => document.queryCommandState(command));
      setStates((was) => (was.join() === next.join() ? was : next));
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [hidden, mode]);

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
    {/* The zoom scales the text (source, preview and rich text) while the panes keep filling the tab. */}
    <div className="doc-split" style={{ zoom }}>
      <textarea ref={text} className="doc-text" hidden={mode === "rich"} spellCheck={false} aria-label={`${doc.name} text`} defaultValue={doc.content}
        onInput={(event) => onChange(doc.id, event.currentTarget.value)}
        onKeyDown={(event) => {
          if (mode !== "markdown" || !(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
          const action = ({ b: "bold", i: "italic", k: "link" } as Record<string, string>)[event.key.toLowerCase()];
          if (action) { event.preventDefault(); runMarkdown(action); }
        }} />
      {mode === "markdown" && <Preview text={doc.content} />}
      <div ref={rich} className="doc-rich prose" hidden={mode !== "rich"} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true"
        aria-label={`${doc.name} rich text`} onInput={(event) => onChange(doc.id, event.currentTarget.innerHTML)}
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
