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

const desktop = window.vdooDesktop;
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
  const [tab, setTab] = useState<"tables" | "source">("tables");
  const [aiOpen, setAiOpen] = useState(() => readSetting("vdoo:ai-open") !== "false");
  const [notice, setNotice] = useState<string | null>(null);
  const svg = useRef("");
  const dirty = schema !== saved;
  const problems = useMemo(() => validate(schema), [schema]);

  useEffect(() => { writeSetting("vdoo:ai-open", String(aiOpen)); }, [aiOpen]);
  useEffect(() => { document.title = `${dirty ? "• " : ""}${file?.name ?? schema.name} — vdoo`; }, [dirty, file, schema.name]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), 4000); return () => clearTimeout(t); }, [notice]);

  const confirmDiscard = useCallback(() => !dirty || window.confirm("Discard the unsaved changes to this schema?"), [dirty]);

  const load = useCallback((loaded: SchemaFile) => {
    try {
      const next = /\.(mmd|mermaid)$/i.test(loaded.name)
        ? { ...fromMermaid(loaded.text), name: loaded.name.replace(/\.(mmd|mermaid)$/i, "") } : deserialize(loaded.text);
      reset(next); setSaved(next); setEditing(null);
      setFile({ path: /\.vdoo$/i.test(loaded.name) ? loaded.path : null, name: /\.vdoo$/i.test(loaded.name) ? loaded.name : `${next.name}.vdoo` });
    } catch (e) { setNotice(`Couldn't open ${loaded.name}: ${e instanceof Error ? e.message : "unreadable file"}`); }
  }, [reset]);

  useEffect(() => {
    if (!desktop) return;
    void desktop.pendingFile().then((f) => f && load(f));
    const offOpen = desktop.onOpenFile((f) => { if (confirmDiscard()) load(f); });
    const offClose = desktop.onCloseRequested(() => { if (confirmDiscard()) void desktop.close(); });
    return () => { offOpen(); offClose(); };
  }, [load, confirmDiscard]);

  const open = async () => {
    if (!confirmDiscard()) return;
    if (desktop) { const f = await desktop.open(); if (f) load(f); return; }
    const input = Object.assign(document.createElement("input"), { type: "file", accept: ".vdoo,.mmd,.mermaid" });
    input.onchange = async () => { const f = input.files?.[0]; if (f) load({ path: f.name, name: f.name, text: await f.text() }); };
    input.click();
  };

  const write = async (kind: "vdoo" | "mermaid" | "sql" | "svg", text: string, asNew: boolean) => {
    const ext = { vdoo: "vdoo", mermaid: "mmd", sql: "sql", svg: "svg" }[kind];
    const suggestedName = `${(file?.name ?? schema.name).replace(/\.vdoo$/i, "")}.${ext}`;
    if (!desktop) {
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text])), download: suggestedName });
      a.click(); URL.revokeObjectURL(a.href);
      return { path: null, name: suggestedName };
    }
    try { return await desktop.save({ text, kind, suggestedName, file: asNew ? null : file?.path }); }
    catch (e) { setNotice(`Couldn't save: ${e instanceof Error ? e.message : "unknown error"}`); return null; }
  };
  const save = async (asNew = false) => {
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
  const newSchema = () => { if (confirmDiscard()) { const s = emptySchema(); reset(s); setSaved(s); setFile(null); setEditing(null); } };
  const addTable = () => { const t = newTable(schema); commit({ ...schema, tables: [...schema.tables, t] }); setEditing({ kind: "table", id: t.id }); };
  const applyMermaid = (text: string) => {
    try { commit({ ...fromMermaid(text, schema), name: schema.name }); setNotice("Applied to the diagram. Undo with Ctrl+Z."); return null; }
    catch (e) { const message = e instanceof Error ? e.message : "Couldn't read that diagram."; setNotice(message); return message; }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || editing) return;
      const typing = (event.target as HTMLElement)?.closest("input, textarea, select");
      const key = event.key.toLowerCase();
      if (key === "s") { event.preventDefault(); void save(event.shiftKey); }
      else if (key === "o") { event.preventDefault(); void open(); }
      else if (key === "n") { event.preventDefault(); newSchema(); }
      else if (!typing && key === "z" && !event.shiftKey) { event.preventDefault(); undo(); }
      else if (!typing && (key === "y" || (key === "z" && event.shiftKey))) { event.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const selected = editing?.kind === "table" ? { kind: "table" as const, id: editing.id }
    : editing?.kind === "relation" && editing.id ? { kind: "relation" as const, id: editing.id } : null;

  return <div className={`app${aiOpen ? " with-ai" : ""}`}>
    <header className="topbar">
      <span className="brand">vdoo</span>
      <span className="file-name" title={file?.path ?? undefined}>{file?.name ?? "Unsaved schema"}{dirty && <span className="dirty" aria-label="Unsaved changes"> •</span>}</span>
      <nav className="toolbar" aria-label="File">
        <button className="btn ghost" title="New (Ctrl+N)" onClick={newSchema}>New</button>
        <button className="btn ghost" title="Open (Ctrl+O)" onClick={() => void open()}>Open</button>
        <button className="btn ghost" title="Save (Ctrl+S)" onClick={() => void save()}>Save</button>
        <button className="btn ghost" title="Save as (Ctrl+Shift+S)" onClick={() => void save(true)}>Save as</button>
        <select className="btn ghost" aria-label="Export" value="" onChange={(e) => { const v = e.target.value; e.target.value = ""; if (v) void exportAs(v as "mermaid" | "sql" | "svg"); }}>
          <option value="">Export…</option><option value="mermaid">Mermaid (.mmd)</option><option value="sql">SQL (.sql)</option><option value="svg">Image (.svg)</option>
        </select>
      </nav>
      <nav className="toolbar" aria-label="Edit">
        <button className="btn ghost" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>Undo</button>
        <button className="btn ghost" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo}>Redo</button>
        <button className="btn primary" onClick={addTable}>+ Table</button>
        <button className="btn ghost" disabled={!schema.tables.length} onClick={() => setEditing({ kind: "relation", id: null })}>+ Relationship</button>
      </nav>
      <span className="spacer" />
      <button className={`btn ghost${aiOpen ? " active" : ""}`} aria-pressed={aiOpen} onClick={() => setAiOpen(!aiOpen)}>Ask AI</button>
      <button className="btn ghost" onClick={() => setEditing({ kind: "settings" })}>Settings</button>
    </header>

    <aside className="sidebar">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "tables"} className={tab === "tables" ? "active" : ""} onClick={() => setTab("tables")}>Tables</button>
        <button role="tab" aria-selected={tab === "source"} className={tab === "source" ? "active" : ""} onClick={() => setTab("source")}>Mermaid</button>
      </div>
      {tab === "tables" ? <Outline schema={schema} onTable={(id) => setEditing({ kind: "table", id })} onRelation={(id) => setEditing({ kind: "relation", id })}
        onExample={() => { if (confirmDiscard()) { const s = fromMermaid(EXAMPLE); reset({ ...s, name: "Example shop" }); setSaved(emptySchema()); setFile(null); } }} />
        : <Source schema={schema} onApply={applyMermaid} />}
    </aside>

    <main className="canvas">
      <Diagram schema={schema} selected={selected} onSvg={(s) => { svg.current = s; }}
        onTable={(id) => setEditing({ kind: "table", id })} onRelation={(id) => setEditing({ kind: "relation", id })} />
      <div className="statusbar">
        <span>{schema.tables.length} tables · {schema.relations.length} relationships</span>
        {problems.length > 0 && <span className="warn" title={problems.join("\n")}>{problems.length} problem{problems.length > 1 ? "s" : ""}: {problems[0]}</span>}
      </div>
      {notice && <div className="toast" role="status">{notice}</div>}
    </main>

    {aiOpen && <AiPanel schema={schema} onApply={(text) => void applyMermaid(text)} onSettings={() => setEditing({ kind: "settings" })} onClose={() => setAiOpen(false)} />}

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
      return <li key={t.id}><button className="outline-item" onClick={() => onTable(t.id)}>
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
