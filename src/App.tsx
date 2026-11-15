import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Diagram } from "./Diagram";
import { TableEditor } from "./TableEditor";
import { RelationEditor } from "./RelationEditor";
import { AiPanel } from "./AiPanel";
import { Settings } from "./Settings";
import { type Schema, CARDINALITY, deserialize, emptySchema, foreignKeysOf, newTable, serialize, tableById, validate } from "./model";
import { fromMermaid, toMermaid } from "./mermaid";
import { toSql } from "./sql";
import { EXAMPLE } from "./example";
import { readSetting, writeSetting } from "./preferences";
import { type Menu, MenuBar } from "./MenuBar";
import { Explorer } from "./Explorer";
import { type Doc, DocEditor, FIND_EVENT } from "./DocEditor";
import { docToPrintHtml, pdfName, printInBrowser } from "./exportPdf";
import { highlight } from "./ColorPicker";
import { type DocMode, DEFAULT_NAMES, MODE_LABELS, baseName, isSchemaPath, modeForPath } from "./textEdit";

const desktop = window.vdooDesktop;
const MODES: DocMode[] = ["text", "rich", "markdown"];
/** The tab that holds the schema and its diagram; every other tab is a file, identified by its Doc id. */
const SCHEMA_TAB = "schema";
const DOC_ZOOM_MIN = 0.5, DOC_ZOOM_MAX = 3;
const clampDocZoom = (z: number) => Math.min(DOC_ZOOM_MAX, Math.max(DOC_ZOOM_MIN, z));
type Editing = { kind: "table"; id: string } | { kind: "relation"; id: string | null } | { kind: "settings" } | null;

/** Undo history: every committed change is a new snapshot. */
function useHistory(initial: Schema) {
  const [state, setState] = useState({ past: [] as Schema[], present: initial, future: [] as Schema[] });
  const commit = useCallback((next: Schema) => setState((s) => (next === s.present ? s : { past: [...s.past.slice(-199), s.present], present: next, future: [] })), []);
  const undo = useCallback(() => setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s)), []);
  const redo = useCallback(() => setState((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s)), []);
  const reset = useCallback((schema: Schema) => setState({ past: [], present: schema, future: [] }), []);
  return { schema: state.present, canUndo: state.past.length > 0, canRedo: state.future.length > 0, commit, undo, redo, reset };
}

export function App() {
  const { schema, canUndo, canRedo, commit, undo, redo, reset } = useHistory(emptySchema());
  const [file, setFile] = useState<{ path: string | null; name: string } | null>(null);
  const [saved, setSaved] = useState<Schema>(schema);
  const [editing, setEditing] = useState<Editing>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [active, setActive] = useState(SCHEMA_TAB);
  const [folder, setFolder] = useState<string | null>(null);
  const [treeVersion, setTreeVersion] = useState(0);
  const [tab, setTab] = useState<"files" | "tables" | "source">("tables");
  const [sideOpen, setSideOpen] = useState(() => readSetting("vdoo:sidebar-open") !== "false");
  const [aiOpen, setAiOpen] = useState(() => readSetting("vdoo:ai-open") !== "false");
  const [diagramComments, setDiagramComments] = useState(() => readSetting("vdoo:diagram-comments") !== "false");
  /** Text size of the file editors, as a zoom factor shared by every file tab. */
  const [docZoom, setDocZoom] = useState(() => clampDocZoom(Number(readSetting("vdoo:doc-zoom")) || 1));
  const zoomDocs = (factor: number) => setDocZoom((z) => clampDocZoom(Math.round(z * factor * 100) / 100));
  /** Bumped whenever another schema is opened, so the diagram fits it to the window. */
  const [fitKey, setFitKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const svg = useRef("");
  const counter = useRef(0);
  const opening = useRef(new Set<string>());
  const doc = docs.find((d) => d.id === active) ?? null;
  const onSchema = !doc;
  const dirty = schema !== saved;
  const dirtyDocs = docs.filter((d) => d.content !== d.saved);
  const schemaName = file?.name ?? "Unsaved schema";
  const problems = useMemo(() => validate(schema), [schema]);

  useEffect(() => { writeSetting("vdoo:ai-open", String(aiOpen)); }, [aiOpen]);
  useEffect(() => { writeSetting("vdoo:sidebar-open", String(sideOpen)); }, [sideOpen]);
  useEffect(() => { writeSetting("vdoo:diagram-comments", String(diagramComments)); }, [diagramComments]);
  useEffect(() => { writeSetting("vdoo:doc-zoom", String(docZoom)); }, [docZoom]);
  useEffect(() => {
    const name = doc ? doc.name : file?.name ?? schema.name;
    document.title = `${(doc ? doc.content !== doc.saved : dirty) ? "• " : ""}${name} — vdoo`;
  }, [dirty, file, schema.name, doc]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), 4000); return () => clearTimeout(t); }, [notice]);
  useEffect(() => { void desktop?.files.workspace().then((dir) => { if (dir) setFolder(dir); }); }, []);

  const confirmDiscard = useCallback(() => !dirty || window.confirm("Discard the unsaved changes to this schema?"), [dirty]);
  const confirmQuit = useCallback(() => {
    const names = [...(dirty ? [schemaName] : []), ...dirtyDocs.map((d) => d.name)];
    return !names.length || window.confirm(`Discard the unsaved changes to ${names.join(", ")}?`);
  }, [dirty, schemaName, dirtyDocs]);

  const load = useCallback((loaded: SchemaFile) => {
    try {
      const next = /\.(mmd|mermaid)$/i.test(loaded.name)
        ? { ...fromMermaid(loaded.text), name: loaded.name.replace(/\.(mmd|mermaid)$/i, "") } : deserialize(loaded.text);
      reset(next); setSaved(next); setEditing(null); setActive(SCHEMA_TAB); setFitKey((k) => k + 1);
      setFile({ path: /\.vdoo$/i.test(loaded.name) ? loaded.path : null, name: /\.vdoo$/i.test(loaded.name) ? loaded.name : `${next.name}.vdoo` });
    } catch (e) { setNotice(`Couldn't open ${loaded.name}: ${e instanceof Error ? e.message : "unreadable file"}`); }
  }, [reset]);

  useEffect(() => {
    if (!desktop) return;
    const offOpen = desktop.onOpenFile((f) => { if (confirmDiscard()) load(f); });
    const offClose = desktop.onCloseRequested(() => { if (confirmQuit()) void desktop.close(); });
    return () => { offOpen(); offClose(); };
  }, [load, confirmDiscard, confirmQuit]);
  useEffect(() => { void desktop?.pendingFile().then((f) => f && load(f)); }, [load]);

  // --- File tabs ---
  const addDoc = (path: string | null, name: string, content: string) => {
    const created: Doc = { id: `doc-${++counter.current}`, path, name, content, saved: content, mode: modeForPath(name) };
    setDocs((all) => [...all, created]);
    setActive(created.id);
  };
  const newDoc = () => addDoc(null, `Untitled-${docs.filter((d) => !d.path).length + 1}`, "");
  /** Opens a file the user chose: a schema goes to the Schema tab, anything else gets a tab of its own. */
  const openPath = async (path: string) => {
    if (!desktop || opening.current.has(path)) return;
    const existing = docs.find((d) => d.path === path);
    if (existing) { setActive(existing.id); return; }
    if (isSchemaPath(path) && !confirmDiscard()) return;
    opening.current.add(path);
    try {
      const result = await desktop.files.read(path);
      if ("error" in result) setNotice(`${baseName(path)}: ${result.error}`);
      else if (isSchemaPath(path)) load(result);
      else addDoc(result.path, result.name, result.text);
    } catch (e) { setNotice(`Couldn't open ${baseName(path)}: ${e instanceof Error ? e.message : "unknown error"}`); }
    finally { opening.current.delete(path); }
  };
  const openFiles = async () => {
    if (desktop) { for (const path of await desktop.files.pick()) await openPath(path); return; }
    const input = Object.assign(document.createElement("input"), { type: "file", multiple: true });
    input.onchange = async () => {
      for (const f of input.files ?? []) {
        const text = await f.text();
        if (!isSchemaPath(f.name)) addDoc(null, f.name, text);
        else if (confirmDiscard()) load({ path: f.name, name: f.name, text });
      }
    };
    input.click();
  };
  const openFolder = async () => {
    const dir = await desktop?.files.chooseFolder();
    if (dir) { setFolder(dir); setTab("files"); setSideOpen(true); }
  };
  const changeDoc = useCallback((id: string, content: string) => setDocs((all) => all.map((d) => (d.id === id ? { ...d, content } : d))), []);
  const setMode = (mode: DocMode) => { if (doc) setDocs((all) => all.map((d) => (d.id === doc.id ? { ...d, mode } : d))); };
  const closeDoc = (id: string) => {
    const index = docs.findIndex((d) => d.id === id);
    const closing = docs[index];
    if (!closing || (closing.content !== closing.saved && !window.confirm(`Discard the unsaved changes to ${closing.name}?`))) return;
    const rest = docs.filter((d) => d.id !== id);
    setDocs(rest);
    if (active === id) setActive(rest[Math.min(index, rest.length - 1)]?.id ?? SCHEMA_TAB);
  };

  const download = (text: string, name: string) => {
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text])), download: name });
    a.click(); URL.revokeObjectURL(a.href);
  };
  const saveDoc = async (target: Doc, asNew: boolean) => {
    const { content } = target;
    let result: { path: string | null; name: string } | null;
    if (!desktop) { download(content, target.name); result = { path: null, name: target.name }; }
    else {
      try { result = await desktop.files.write({ text: content, file: asNew ? null : target.path, suggestedName: target.path ? target.name : DEFAULT_NAMES[target.mode] }); }
      catch (e) { setNotice(`Couldn't save: ${e instanceof Error ? e.message : "unknown error"}`); return; }
    }
    if (!result) return;
    const { path, name } = result;
    setDocs((all) => all.map((d) => (d.id === target.id ? { ...d, path, name, saved: content } : d)));
    if (path !== target.path) setTreeVersion((v) => v + 1);
    setNotice(`Saved ${name}`);
  };

  /** Exports the file tab as it looks in its mode: Markdown rendered, rich text formatted, plain text as is. */
  const exportPdf = async (target: Doc) => {
    let html: string;
    try { html = docToPrintHtml(target); }
    catch (e) { setNotice(`Couldn't export: ${e instanceof Error ? e.message : "unknown error"}`); return; }
    if (!desktop) { printInBrowser(html); return; }
    setNotice("Exporting PDF…");
    try {
      const result = await desktop.exportPdf({ html, suggestedName: pdfName(target.name) });
      setNotice(result ? `Exported ${result.name}` : null);
      if (result) setTreeVersion((v) => v + 1);
    } catch (e) { setNotice(`Couldn't export: ${e instanceof Error ? e.message : "unknown error"}`); }
  };

  // --- The schema ---
  const write = async (kind: "vdoo" | "mermaid" | "sql" | "svg", text: string, asNew: boolean) => {
    const ext = { vdoo: "vdoo", mermaid: "mmd", sql: "sql", svg: "svg" }[kind];
    const suggestedName = `${(file?.name ?? schema.name).replace(/\.vdoo$/i, "")}.${ext}`;
    if (!desktop) { download(text, suggestedName); return { path: null, name: suggestedName }; }
    try {
      const result = await desktop.save({ text, kind, suggestedName, file: asNew ? null : file?.path });
      if (result) setTreeVersion((v) => v + 1);
      return result;
    } catch (e) { setNotice(`Couldn't save: ${e instanceof Error ? e.message : "unknown error"}`); return null; }
  };
  const saveSchema = async (asNew = false) => {
    const result = await write("vdoo", serialize(schema), asNew);
    if (!result) return;
    const name = result.name.replace(/\.vdoo$/i, "");
    const next = schema.name === name ? schema : { ...schema, name };
    if (next !== schema) commit(next);
    setSaved(next); setFile(result);
    setNotice(`Saved ${result.name}`);
  };
  const exportAs = async (kind: "mermaid" | "sql" | "svg") => {
    if (kind === "svg" && !svg.current) { setNotice("Add a table first."); return; }
    const text = kind === "mermaid" ? toMermaid(schema).text : kind === "sql" ? toSql(schema) : svg.current;
    const result = await write(kind, text, true);
    if (result) setNotice(`Exported ${result.name}`);
  };
  const newSchema = () => { if (confirmDiscard()) { const s = emptySchema(); reset(s); setSaved(s); setFile(null); setEditing(null); setActive(SCHEMA_TAB); setFitKey((k) => k + 1); } };
  const addTable = () => { const t = newTable(schema); commit({ ...schema, tables: [...schema.tables, t] }); setActive(SCHEMA_TAB); setEditing({ kind: "table", id: t.id }); };
  const addRelation = () => { setActive(SCHEMA_TAB); setEditing({ kind: "relation", id: null }); };
  const applyMermaid = (text: string) => {
    try { commit({ ...fromMermaid(text, schema), name: schema.name }); setActive(SCHEMA_TAB); setNotice("Applied to the diagram. Undo with Ctrl+Z."); return null; }
    catch (e) { const message = e instanceof Error ? e.message : "Couldn't read that diagram."; setNotice(message); return message; }
  };

  // --- Commands shared by the menu bar, the toolbar and the keyboard ---
  const save = (asNew = false) => void (doc ? saveDoc(doc, asNew) : saveSchema(asNew));
  /** Cut, copy, paste and the like act on whatever has the focus; in a file tab so do undo and redo. */
  const editCommand = (command: EditCommand) => void (desktop ? desktop.edit(command) : document.execCommand(command));
  const undoActive = () => (onSchema ? undo() : editCommand("undo"));
  const redoActive = () => (onSchema ? redo() : editCommand("redo"));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || editing) return;
      const typing = (event.target as HTMLElement)?.closest("input, textarea, select, [contenteditable]");
      const key = event.key.toLowerCase();
      const mode = event.altKey ? ({ KeyT: "text", KeyR: "rich", KeyM: "markdown" } as Record<string, DocMode>)[event.code] : undefined;
      if (mode) { event.preventDefault(); setMode(mode); }
      else if (event.altKey) return;
      else if (key === "s") { event.preventDefault(); save(event.shiftKey); }
      else if (key === "o") { event.preventDefault(); void (event.shiftKey ? openFolder() : openFiles()); }
      else if (key === "n") { event.preventDefault(); if (event.shiftKey) newSchema(); else newDoc(); }
      else if (key === "p" && !event.shiftKey) { event.preventDefault(); if (doc) void exportPdf(doc); }
      else if (key === "w") { event.preventDefault(); if (doc) closeDoc(doc.id); }
      else if (key === "f" && !event.shiftKey) { event.preventDefault(); if (doc) window.dispatchEvent(new Event(FIND_EVENT)); }
      else if (key === "b" && event.shiftKey) { event.preventDefault(); setSideOpen((v) => !v); }
      else if (!onSchema) return;
      else if (!typing && key === "z" && !event.shiftKey) { event.preventDefault(); undo(); }
      else if (!typing && (key === "y" || (key === "z" && event.shiftKey))) { event.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const showPanel = (panel: typeof tab) => { setTab(panel); setSideOpen(true); };
  const menus: Menu[] = [
    { label: "File", items: [
      { label: "New file", shortcut: "Ctrl+N", onSelect: newDoc },
      { label: "New schema", shortcut: "Ctrl+Shift+N", onSelect: newSchema },
      "separator",
      { label: "Open file…", shortcut: "Ctrl+O", onSelect: () => void openFiles() },
      { label: "Open folder…", shortcut: "Ctrl+Shift+O", disabled: !desktop, onSelect: () => void openFolder() },
      "separator",
      { label: "Save", shortcut: "Ctrl+S", onSelect: () => save() },
      { label: "Save as…", shortcut: "Ctrl+Shift+S", onSelect: () => save(true) },
      "separator",
      { label: "Export as PDF…", shortcut: "Ctrl+P", disabled: !doc, onSelect: () => { if (doc) void exportPdf(doc); } },
      { label: "Export schema as Mermaid…", onSelect: () => void exportAs("mermaid") },
      { label: "Export schema as SQL…", onSelect: () => void exportAs("sql") },
      { label: "Export schema as image (SVG)…", onSelect: () => void exportAs("svg") },
      "separator",
      { label: "Close tab", shortcut: "Ctrl+W", disabled: onSchema, onSelect: () => { if (doc) closeDoc(doc.id); } },
      { label: "Settings…", onSelect: () => setEditing({ kind: "settings" }) },
      ...(desktop ? ["separator" as const, { label: "Exit", onSelect: () => window.close() }] : []),
    ] },
    { label: "Edit", items: [
      { label: "Undo", shortcut: "Ctrl+Z", disabled: onSchema && !canUndo, onSelect: undoActive },
      { label: "Redo", shortcut: "Ctrl+Y", disabled: onSchema && !canRedo, onSelect: redoActive },
      "separator",
      { label: "Cut", shortcut: "Ctrl+X", onSelect: () => editCommand("cut") },
      { label: "Copy", shortcut: "Ctrl+C", onSelect: () => editCommand("copy") },
      { label: "Paste", shortcut: "Ctrl+V", disabled: !desktop, onSelect: () => editCommand("paste") },
      { label: "Select all", shortcut: "Ctrl+A", onSelect: () => editCommand("selectAll") },
      "separator",
      { label: "Find…", shortcut: "Ctrl+F", disabled: !doc, onSelect: () => window.dispatchEvent(new Event(FIND_EVENT)) },
    ] },
    { label: "Schema", items: [
      { label: "Add table", onSelect: addTable },
      { label: "Add relationship", disabled: !schema.tables.length, onSelect: addRelation },
    ] },
    { label: "Mode", items: MODES.map((mode) => ({ label: MODE_LABELS[mode], shortcut: `Ctrl+Alt+${mode[0].toUpperCase()}`, disabled: !doc, checked: doc?.mode === mode, onSelect: () => setMode(mode) })) },
    { label: "View", items: [
      { label: "Sidebar", shortcut: "Ctrl+Shift+B", checked: sideOpen, onSelect: () => setSideOpen(!sideOpen) },
      { label: "Ask AI", checked: aiOpen, onSelect: () => setAiOpen(!aiOpen) },
      { label: "Column comments in diagram", checked: diagramComments, onSelect: () => setDiagramComments(!diagramComments) },
      "separator",
      { label: "Files", checked: sideOpen && tab === "files", onSelect: () => showPanel("files") },
      { label: "Tables", checked: sideOpen && tab === "tables", onSelect: () => showPanel("tables") },
      { label: "Mermaid source", checked: sideOpen && tab === "source", onSelect: () => showPanel("source") },
    ] },
  ];

  const selected = editing?.kind === "table" ? { kind: "table" as const, id: editing.id }
    : editing?.kind === "relation" && editing.id ? { kind: "relation" as const, id: editing.id } : null;
  const sideTab = (id: typeof tab, label: string) =>
    <button role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>;

  return <div className="app">
    <header className="topbar">
      <span className="brand">vdoo</span>
      <MenuBar menus={menus} />
    </header>
    {/* Pressing a toolbar button keeps the focus (and the selection) in the editor. */}
    <div className="toolbar" role="toolbar" aria-label="Main" onMouseDown={(event) => { if (!(event.target as HTMLElement).closest("select")) event.preventDefault(); }}>
      <button className="btn ghost" title="New file (Ctrl+N)" onClick={newDoc}>New file</button>
      <button className="btn ghost" title="Open file (Ctrl+O)" onClick={() => void openFiles()}>Open</button>
      {desktop && <button className="btn ghost" title="Open folder (Ctrl+Shift+O)" onClick={() => void openFolder()}>Open folder</button>}
      <button className="btn ghost" title="Save (Ctrl+S)" onClick={() => save()}>Save</button>
      <span className="sep" />
      <button className="btn ghost" title="Undo (Ctrl+Z)" disabled={onSchema && !canUndo} onClick={undoActive}>Undo</button>
      <button className="btn ghost" title="Redo (Ctrl+Y)" disabled={onSchema && !canRedo} onClick={redoActive}>Redo</button>
      <span className="sep" />
      {doc ? <div className="segmented" role="group" aria-label="Editor mode">
        {MODES.map((mode) => <button key={mode} className={`btn ghost${doc.mode === mode ? " active" : ""}`} aria-pressed={doc.mode === mode}
          title={`${MODE_LABELS[mode]} mode (Ctrl+Alt+${mode[0].toUpperCase()})`} onClick={() => setMode(mode)}>{MODE_LABELS[mode]}</button>)}
      </div> : null}
      {doc && <div className="segmented" role="group" aria-label="Editor zoom">
        <button className="btn ghost" title="Zoom out" aria-label="Zoom out" disabled={docZoom <= DOC_ZOOM_MIN} onClick={() => zoomDocs(1 / 1.1)}>−</button>
        <button className="btn ghost" title="Reset zoom" aria-label={`Zoom ${Math.round(docZoom * 100)}%, reset`} onClick={() => setDocZoom(1)}>{Math.round(docZoom * 100)}%</button>
        <button className="btn ghost" title="Zoom in" aria-label="Zoom in" disabled={docZoom >= DOC_ZOOM_MAX} onClick={() => zoomDocs(1.1)}>+</button>
      </div>}
      {doc && <button className="btn ghost" title="Export as PDF (Ctrl+P)" onClick={() => void exportPdf(doc)}>Export PDF</button>}
      {!doc && <>
        <button className="btn primary" onClick={addTable}>+ Table</button>
        <button className="btn ghost" disabled={!schema.tables.length} onClick={addRelation}>+ Relationship</button>
        <select className="btn ghost" aria-label="Export" value="" onChange={(e) => { const v = e.target.value; e.target.value = ""; if (v) void exportAs(v as "mermaid" | "sql" | "svg"); }}>
          <option value="">Export…</option><option value="mermaid">Mermaid (.mmd)</option><option value="sql">SQL (.sql)</option><option value="svg">Image (.svg)</option>
        </select>
      </>}
      <span className="spacer" />
      <button className={`btn ghost${aiOpen ? " active" : ""}`} aria-pressed={aiOpen} onClick={() => setAiOpen(!aiOpen)}>Ask AI</button>
      <button className="btn ghost" onClick={() => setEditing({ kind: "settings" })}>Settings</button>
    </div>

    <div className="workspace">
      {sideOpen && <aside className="sidebar">
        <div className="tabs" role="tablist" aria-label="Sidebar">{sideTab("files", "Files")}{sideTab("tables", "Tables")}{sideTab("source", "Mermaid")}</div>
        {tab === "files" ? <Explorer folder={folder} activePath={doc ? doc.path : file?.path ?? null} version={treeVersion}
          onOpenFile={(path) => void openPath(path)} onChooseFolder={() => void openFolder()} onRefresh={() => setTreeVersion((v) => v + 1)} />
          : tab === "tables" ? <Outline schema={schema} onTable={(id) => setEditing({ kind: "table", id })} onRelation={(id) => setEditing({ kind: "relation", id })}
            onExample={() => { if (confirmDiscard()) { const s = fromMermaid(EXAMPLE); reset({ ...s, name: "Example shop" }); setSaved(emptySchema()); setFile(null); setActive(SCHEMA_TAB); setFitKey((k) => k + 1); } }} />
            : <Source schema={schema} onApply={applyMermaid} />}
      </aside>}

      <main className="main">
        <div className="doc-tabs" role="tablist" aria-label="Open files">
          <div className={`doc-tab${onSchema ? " active" : ""}`}>
            <button role="tab" aria-selected={onSchema} className="doc-tab-name" title={file?.path ?? "The schema and its diagram"} onClick={() => setActive(SCHEMA_TAB)}>
              <span className="doc-tab-kind" aria-hidden="true">◈</span>{schemaName}{dirty && <span className="dirty" aria-label="Unsaved changes"> •</span>}
            </button>
            {/* Closing the schema leaves an empty one: the first tab is always the schema. */}
            {(file || schema.tables.length > 0) && <button className="doc-tab-close" title="Close schema" aria-label={`Close ${schemaName}`} onClick={newSchema}>×</button>}
          </div>
          {docs.map((d) => <div key={d.id} className={`doc-tab${d.id === active ? " active" : ""}`}
            onAuxClick={(event) => { if (event.button === 1) closeDoc(d.id); }}>
            <button role="tab" aria-selected={d.id === active} className="doc-tab-name" title={d.path ?? "Not saved yet"} onClick={() => setActive(d.id)}>
              {d.name}{d.content !== d.saved && <span className="dirty" aria-label="Unsaved changes"> •</span>}
            </button>
            <button className="doc-tab-close" title="Close tab (Ctrl+W)" aria-label={`Close ${d.name}`} onClick={() => closeDoc(d.id)}>×</button>
          </div>)}
        </div>
        <div className="canvas" hidden={!onSchema}>
          <Diagram schema={schema} selected={selected} comments={diagramComments} fitKey={fitKey} onSvg={(s) => { svg.current = s; }}
            onTable={(id) => setEditing({ kind: "table", id })} onRelation={(id) => setEditing({ kind: "relation", id })} />
        </div>
        {docs.map((d) => <DocEditor key={d.id} doc={d} hidden={d.id !== active} zoom={docZoom} onChange={changeDoc} />)}
        <div className="statusbar">
          {doc ? <><span>{MODE_LABELS[doc.mode]}</span><span className="status-path">{doc.path ?? "Not saved yet"}</span></>
            : <><span>{schema.tables.length} tables · {schema.relations.length} relationships</span>
              {problems.length > 0 && <span className="warn" title={problems.join("\n")}>{problems.length} problem{problems.length > 1 ? "s" : ""}: {problems[0]}</span>}</>}
        </div>
        {notice && <div className="toast" role="status">{notice}</div>}
      </main>

      {aiOpen && <AiPanel schema={schema} onApply={(text) => void applyMermaid(text)} onSettings={() => setEditing({ kind: "settings" })} onClose={() => setAiOpen(false)} />}
    </div>

    {editing?.kind === "table" && tableById(schema, editing.id) && <TableEditor key={editing.id} schema={schema} tableId={editing.id} onSave={commit}
      onOpenRelation={(id) => setEditing({ kind: "relation", id })} onClose={() => setEditing(null)} />}
    {editing?.kind === "relation" && <RelationEditor key={editing.id ?? "new"} schema={schema} relationId={editing.id} onSave={commit}
      onOpenTable={(id) => setEditing({ kind: "table", id })} onClose={() => setEditing(null)} />}
    {editing?.kind === "settings" && <Settings onClose={() => setEditing(null)} />}
  </div>;
}

function Outline({ schema, onTable, onRelation, onExample }: { schema: Schema; onTable: (id: string) => void; onRelation: (id: string) => void; onExample: () => void }) {
  if (!schema.tables.length) return <div className="outline empty">
    <p>Add a table with <strong>+ Table</strong>, paste Mermaid in the Mermaid tab, or ask AI to design a schema.</p>
    <button className="btn ghost" onClick={onExample}>Open an example</button>
  </div>;
  return <div className="outline">
    <h3>Tables</h3>
    <ul>{schema.tables.map((t) => {
      const fks = foreignKeysOf(schema, t);
      return <li key={t.id}><button className="outline-item" style={t.color ? { background: highlight(t.color) } : undefined} onClick={() => onTable(t.id)}>
        <strong>{t.name}</strong>
        <span className="outline-cols">{t.columns.map((c) => <span key={c.id} className={c.pk ? "is-pk" : fks.has(c.id) ? "is-fk" : ""}>
          {c.pk ? "🔑 " : fks.has(c.id) ? "↗ " : ""}{c.name}<small> {c.type}</small></span>)}</span>
      </button></li>;
    })}</ul>
    <h3>Relationships</h3>
    {schema.relations.length ? <ul>{schema.relations.map((r) => {
      const p = tableById(schema, r.parent), c = tableById(schema, r.child);
      return <li key={r.id}><button className="outline-item" onClick={() => onRelation(r.id)}>
        <strong>{p?.name} → {c?.name}</strong>
        <small>{r.label ? `${r.label} · ` : ""}{CARDINALITY[r.parentCard].toLowerCase()} to {CARDINALITY[r.childCard].toLowerCase()}</small>
      </button></li>;
    })}</ul> : <p className="hint">None yet. Use + Relationship.</p>}
  </div>;
}

/** The schema as Mermaid text. Edits apply when you choose Apply, so a half-typed line never breaks the diagram. */
function Source({ schema, onApply }: { schema: Schema; onApply: (text: string) => string | null }) {
  const generated = useMemo(() => toMermaid(schema).text, [schema]);
  const [text, setText] = useState(generated);
  const [error, setError] = useState<string | null>(null);
  const [edited, setEdited] = useState(false);
  useEffect(() => { if (!edited) setText(generated); }, [generated, edited]);
  return <div className="source">
    <textarea aria-label="Mermaid source" spellCheck={false} value={text} onChange={(e) => { setText(e.target.value); setEdited(true); setError(null); }}
      onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); const err = onApply(text); setError(err); if (!err) setEdited(false); } }} />
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="source-actions">
      <button className="btn primary" disabled={!edited} onClick={() => { const err = onApply(text); setError(err); if (!err) setEdited(false); }}>Apply (Ctrl+Enter)</button>
      <button className="btn ghost" disabled={!edited} onClick={() => { setText(generated); setEdited(false); setError(null); }}>Revert</button>
      <button className="link small" onClick={() => void navigator.clipboard.writeText(text)}>Copy</button>
    </div>
  </div>;
}
