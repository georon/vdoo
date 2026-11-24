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
import { type DocMode, DEFAULT_NAMES, MODE_LABELS, baseName, isAppPath, isSchemaPath, modeForPath } from "./textEdit";
import { type StudioPage, NewAppDialog, StudioView } from "./studio/StudioView";
import { type OdooApp, addModel, modelById, newApp } from "./odoo/studioModel";
import { appToSchema, schemaToApp } from "./odoo/convert";
import { validateApp } from "./odoo/validateApp";
import { generateAddon } from "./odoo/generateAddon";
import { exampleApp } from "./odoo/exampleApp";
import { type Theme, THEMES, applyTheme, savedTheme } from "./theme";

const desktop = window.vdooDesktop;
const MODES: DocMode[] = ["text", "rich", "markdown"];
/** The tab that holds the ER schema (a .vdoo file) and its diagram; every file tab is identified by its Doc id. */
const SCHEMA_TAB = "schema";
/** The two tabs of the Odoo app (a .vdooapp file), shown while one is open: the Studio designer and the app's diagram. */
const STUDIO_TAB = "studio";
const APP_DIAGRAM_TAB = "app-diagram";
const DOC_ZOOM_MIN = 0.5, DOC_ZOOM_MAX = 3;
const clampDocZoom = (z: number) => Math.min(DOC_ZOOM_MAX, Math.max(DOC_ZOOM_MIN, z));
type Editing = { kind: "table"; id: string } | { kind: "relation"; id: string | null } | { kind: "settings" } | { kind: "new-app"; fromDiagram: boolean } | null;
type FileRef = { path: string | null; name: string };
/** The two documents that can be open side by side: the ER schema and the Odoo app. */
type Slot = "schema" | "app";
const stem = (name: string) => name.replace(/\.(vdooapp|vdoo|mmd|mermaid)$/i, "");
const isModelPath = (path: string) => isSchemaPath(path) || isAppPath(path);
/** The document an Odoo app is kept in: the app plus the tables drawn from it. */
const appDocument = (app: OdooApp): Schema => ({ ...emptySchema(app.name), ...appToSchema(app), odoo: app });

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
  // The ER schema and the Odoo app are separate documents, each with its own file, undo history and saved state.
  const sh = useHistory(emptySchema());
  const [schemaFile, setSchemaFile] = useState<FileRef | null>(null);
  const [schemaSaved, setSchemaSaved] = useState<Schema>(sh.schema);
  const ah = useHistory(emptySchema());
  const [appFile, setAppFile] = useState<FileRef | null>(null);
  const [appSaved, setAppSaved] = useState<Schema>(ah.schema);
  const [editing, setEditing] = useState<Editing>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [active, setActive] = useState(SCHEMA_TAB);
  const [folder, setFolder] = useState<string | null>(null);
  const [treeVersion, setTreeVersion] = useState(0);
  const [tab, setTab] = useState<"files" | "tables" | "source">("tables");
  const [sideOpen, setSideOpen] = useState(() => readSetting("vdoo:sidebar-open") !== "false");
  const [aiOpen, setAiOpen] = useState(() => readSetting("vdoo:ai-open") !== "false");
  const [diagramComments, setDiagramComments] = useState(() => readSetting("vdoo:diagram-comments") !== "false");
  /** View › Theme: System follows the operating system. */
  const [theme, setTheme] = useState<Theme>(savedTheme);
  const chooseTheme = (next: Theme) => { setTheme(next); applyTheme(next); };
  /** Text size of the file editors, as a zoom factor shared by every file tab. */
  const [docZoom, setDocZoom] = useState(() => clampDocZoom(Number(readSetting("vdoo:doc-zoom")) || 1));
  const zoomDocs = (factor: number) => setDocZoom((z) => clampDocZoom(Math.round(z * factor * 100) / 100));
  /** Bumped whenever another schema or app is opened, so its diagram fits it to the window. */
  const [schemaFit, setSchemaFit] = useState(0);
  const [appFit, setAppFit] = useState(0);
  /** A diagram can't fit itself while its tab is hidden, so a newly opened app's diagram fits when its tab is first shown. */
  const appNeedsFit = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const schemaSvg = useRef("");
  const appSvg = useRef("");
  const counter = useRef(0);
  const opening = useRef(new Set<string>());
  const [studioPage, setStudioPage] = useState<StudioPage | null>(null);
  /** Which document the menus act on while a file tab is active: the one shown last. */
  const [lastSlot, setLastSlot] = useState<Slot>("schema");

  const schema = sh.schema;
  const appSchema = ah.schema;
  const app = appSchema.odoo;
  const doc = docs.find((d) => d.id === active) ?? null;
  const onModel = !doc;
  const onStudio = active === STUDIO_TAB && !!app;
  const onAppDiagram = active === APP_DIAGRAM_TAB && !!app;
  const tabSlot: Slot | null = active === SCHEMA_TAB ? "schema" : onStudio || onAppDiagram ? "app" : null;
  const slot: Slot = tabSlot ?? (lastSlot === "app" && app ? "app" : "schema");
  const schemaDirty = schema !== schemaSaved;
  const appDirty = !!app && appSchema !== appSaved;
  const schemaName = schemaFile?.name ?? "Unsaved schema";
  const appName = appFile?.name ?? `${app?.name ?? "app"}.vdooapp`;
  const cur = slot === "app" ? { h: ah, file: appFile, dirty: appDirty, svg: appSvg, name: appName }
    : { h: sh, file: schemaFile, dirty: schemaDirty, svg: schemaSvg, name: schemaName };
  const curSchema = cur.h.schema;
  const dirtyDocs = docs.filter((d) => d.content !== d.saved);
  const appProblems = useMemo(() => (app ? validateApp(app) : []), [app]);
  const schemaProblems = useMemo(() => validate(schema), [schema]);
  const problems = slot === "app" ? appProblems.map((p) => p.message) : schemaProblems;

  useEffect(() => { writeSetting("vdoo:ai-open", String(aiOpen)); }, [aiOpen]);
  useEffect(() => { writeSetting("vdoo:sidebar-open", String(sideOpen)); }, [sideOpen]);
  useEffect(() => { writeSetting("vdoo:diagram-comments", String(diagramComments)); }, [diagramComments]);
  useEffect(() => { writeSetting("vdoo:doc-zoom", String(docZoom)); }, [docZoom]);
  useEffect(() => { if (tabSlot) setLastSlot(tabSlot); }, [tabSlot]);
  useEffect(() => {
    const name = doc ? doc.name : cur.name;
    document.title = `${(doc ? doc.content !== doc.saved : cur.dirty) ? "• " : ""}${name} — vdoo`;
  });
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), 4000); return () => clearTimeout(t); }, [notice]);
  useEffect(() => { void desktop?.files.workspace().then((dir) => { if (dir) setFolder(dir); }); }, []);
  // Closing the app leaves its tabs with nothing to show.
  useEffect(() => { if ((active === STUDIO_TAB || active === APP_DIAGRAM_TAB) && !app) setActive(SCHEMA_TAB); }, [active, app]);

  const confirmDiscardSchema = () => !schemaDirty || window.confirm("Discard the unsaved changes to this schema?");
  const confirmDiscardApp = () => !appDirty || window.confirm(`Discard the unsaved changes to the Odoo app ${appName}?`);
  const confirmQuit = () => {
    const names = [...(schemaDirty ? [schemaName] : []), ...(appDirty ? [appName] : []), ...dirtyDocs.map((d) => d.name)];
    return !names.length || window.confirm(`Discard the unsaved changes to ${names.join(", ")}?`);
  };

  /** Puts an app in the Studio tabs, asking first when the open one has unsaved changes. False when the user said no. */
  const openApp = (next: Schema, file: FileRef | null, saved: Schema) => {
    if (!confirmDiscardApp()) return false;
    ah.reset(next); setAppSaved(saved); setAppFile(file); setStudioPage(null); setEditing(null);
    appNeedsFit.current = true; setActive(STUDIO_TAB);
    return true;
  };
  const showAppDiagram = () => {
    if (appNeedsFit.current) { appNeedsFit.current = false; setAppFit((k) => k + 1); }
    setActive(APP_DIAGRAM_TAB);
  };

  /** Opens a schema or app file: one holding an Odoo app goes to the Studio tabs, any other to the schema tab. */
  const load = (loaded: SchemaFile) => {
    let next: Schema;
    try {
      next = /\.(mmd|mermaid)$/i.test(loaded.name) ? { ...fromMermaid(loaded.text), name: stem(loaded.name) } : deserialize(loaded.text);
    } catch (e) { setNotice(`Couldn't open ${loaded.name}: ${e instanceof Error ? e.message : "unreadable file"}`); return; }
    if (next.odoo) {
      // An app saved in a .vdoo file (before .vdooapp existed) still opens; its first Save asks for a .vdooapp name.
      const legacy = !isAppPath(loaded.name);
      if (openApp(next, { path: legacy ? null : loaded.path, name: `${stem(loaded.name)}.vdooapp` }, next) && legacy)
        setNotice(`${loaded.name} holds an Odoo app, so it opened in Studio. Save stores it as ${stem(loaded.name)}.vdooapp.`);
    } else if (isAppPath(loaded.name)) setNotice(`Couldn't open ${loaded.name}: it has no Odoo app in it.`);
    else if (confirmDiscardSchema()) {
      const isVdoo = /\.vdoo$/i.test(loaded.name);
      sh.reset(next); setSchemaSaved(next); setEditing(null); setActive(SCHEMA_TAB); setSchemaFit((k) => k + 1);
      setSchemaFile({ path: isVdoo ? loaded.path : null, name: isVdoo ? loaded.name : `${next.name}.vdoo` });
    }
  };

  // The desktop shell's callbacks are registered once; they call the current load and quit check.
  const latest = useRef({ load, confirmQuit });
  useEffect(() => { latest.current = { load, confirmQuit }; });
  useEffect(() => {
    if (!desktop) return;
    const offOpen = desktop.onOpenFile((f) => latest.current.load(f));
    const offClose = desktop.onCloseRequested(() => { if (latest.current.confirmQuit()) void desktop.close(); });
    return () => { offOpen(); offClose(); };
  }, []);
  useEffect(() => { void desktop?.pendingFile().then((f) => f && latest.current.load(f)); }, []);

  // --- File tabs ---
  const addDoc = (path: string | null, name: string, content: string) => {
    const created: Doc = { id: `doc-${++counter.current}`, path, name, content, saved: content, mode: modeForPath(name) };
    setDocs((all) => [...all, created]);
    setActive(created.id);
  };
  const newDoc = () => addDoc(null, `Untitled-${docs.filter((d) => !d.path).length + 1}`, "");
  /** Opens a file the user chose: a schema goes to the schema tab, an app to the Studio tabs, anything else gets a tab of its own. */
  const openPath = async (path: string) => {
    if (!desktop || opening.current.has(path)) return;
    const existing = docs.find((d) => d.path === path);
    if (existing) { setActive(existing.id); return; }
    if (path === schemaFile?.path) { setActive(SCHEMA_TAB); return; }
    if (path === appFile?.path) { setActive(STUDIO_TAB); return; }
    opening.current.add(path);
    try {
      const result = await desktop.files.read(path);
      if ("error" in result) setNotice(`${baseName(path)}: ${result.error}`);
      else if (isModelPath(path)) load(result);
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
        if (isModelPath(f.name)) latest.current.load({ path: f.name, name: f.name, text });
        else addDoc(null, f.name, text);
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

  // --- The schema and the app ---
  type SaveKind = "vdoo" | "vdooapp" | "mermaid" | "sql" | "svg";
  const write = async (target: Slot, kind: SaveKind, text: string, asNew: boolean) => {
    const ext = { vdoo: "vdoo", vdooapp: "vdooapp", mermaid: "mmd", sql: "sql", svg: "svg" }[kind];
    const file = target === "app" ? appFile : schemaFile;
    const suggestedName = `${stem(file?.name ?? (target === "app" ? app?.name ?? "app" : schema.name))}.${ext}`;
    if (!desktop) { download(text, suggestedName); return { path: null, name: suggestedName }; }
    try {
      const result = await desktop.save({ text, kind, suggestedName, file: asNew ? null : file?.path });
      if (result) setTreeVersion((v) => v + 1);
      return result;
    } catch (e) { setNotice(`Couldn't save: ${e instanceof Error ? e.message : "unknown error"}`); return null; }
  };
  /** Saves the schema as .vdoo or the app as .vdooapp. */
  const saveModel = async (target: Slot, asNew = false) => {
    const h = target === "app" ? ah : sh;
    const current = h.schema;
    const result = await write(target, target === "app" ? "vdooapp" : "vdoo", serialize(current), asNew);
    if (!result) return;
    const name = stem(result.name);
    const next = current.name === name ? current : { ...current, name };
    if (next !== current) h.commit(next);
    if (target === "app") { setAppSaved(next); setAppFile(result); } else { setSchemaSaved(next); setSchemaFile(result); }
    setNotice(`Saved ${result.name}`);
  };
  const exportAs = async (kind: "mermaid" | "sql" | "svg") => {
    if (kind === "svg" && !cur.svg.current) { setNotice("Add a table first."); return; }
    const text = kind === "mermaid" ? toMermaid(curSchema).text : kind === "sql" ? toSql(curSchema) : cur.svg.current;
    const result = await write(slot, kind, text, true);
    if (result) setNotice(`Exported ${result.name}`);
  };
  const newSchema = () => {
    if (!confirmDiscardSchema()) return;
    const s = emptySchema(); sh.reset(s); setSchemaSaved(s); setSchemaFile(null); setEditing(null); setActive(SCHEMA_TAB); setSchemaFit((k) => k + 1);
  };
  const addTable = () => {
    if (slot === "app" && app) { const { app: next, model } = addModel(app, "New model"); commitApp(next); openStudio({ kind: "model", modelId: model.id, tab: "fields" }); return; }
    const t = newTable(schema); sh.commit({ ...schema, tables: [...schema.tables, t] }); setActive(SCHEMA_TAB); setEditing({ kind: "table", id: t.id });
  };
  const addRelation = () => { setActive(SCHEMA_TAB); setEditing({ kind: "relation", id: null }); };
  /** Mermaid text (from the sidebar or the AI) always goes to the schema tab; the app is only edited in Studio. */
  const applyMermaid = (text: string) => {
    if (slot === "app" && schema.tables.length
      && !window.confirm("This draws the Mermaid diagram in the schema tab, replacing its tables (Undo brings them back). The Odoo app isn't changed. Apply?")) return "Not applied.";
    try {
      sh.commit({ ...fromMermaid(text, schema), name: schema.name }); setActive(SCHEMA_TAB);
      setNotice(slot === "app" ? "Applied to the schema tab; the app is unchanged. Undo with Ctrl+Z." : "Applied to the diagram. Undo with Ctrl+Z.");
      return null;
    } catch (e) { const message = e instanceof Error ? e.message : "Couldn't read that diagram."; setNotice(message); return message; }
  };

  // --- Studio: an Odoo app whose tables its diagram draws ---
  const commitApp = useCallback((next: OdooApp) => ah.commit({ ...appSchema, odoo: next, ...appToSchema(next, appSchema) }), [ah.commit, appSchema]);
  const openStudio = (page: StudioPage | null = studioPage) => { setStudioPage(page); setActive(STUDIO_TAB); };
  const loadApp = (next: OdooApp) => openApp(appDocument(next), null, emptySchema());
  const createApp = ({ name, model, version }: { name: string; model: string; version: OdooApp["odooVersion"] }, fromDiagram: boolean) => {
    setEditing(null);
    const next = fromDiagram ? { ...schemaToApp(schema, name), odooVersion: version } : newApp(name, model, version);
    if (loadApp(next) && fromDiagram) setNotice(`Made ${next.models.length} models from the diagram. The schema tab is unchanged.`);
  };
  /** Puts a copy of the app's diagram in the schema tab, as plain tables; the app stays open. */
  const copyAppDiagram = () => {
    if (!app || !confirmDiscardSchema()) return;
    const s = { ...emptySchema(app.name), ...appToSchema(app, appSchema) };
    sh.reset(s); setSchemaSaved(emptySchema()); setSchemaFile(null); setEditing(null); setActive(SCHEMA_TAB); setSchemaFit((k) => k + 1);
    setNotice(`Copied ${s.tables.length} tables to the schema tab.`);
  };
  const closeApp = () => {
    if (!app || !confirmDiscardApp()) return;
    const s = emptySchema(); ah.reset(s); setAppSaved(s); setAppFile(null); setStudioPage(null);
    if (tabSlot === "app") setActive(SCHEMA_TAB);
  };
  const exportAddon = async () => {
    if (!app) return;
    if (appProblems.length && !window.confirm(`The app has ${appProblems.length} problem${appProblems.length > 1 ? "s" : ""}, so Odoo may refuse to install it. Export anyway?`)) return;
    const files = generateAddon(app);
    if (!desktop) { setNotice("Exporting an addon needs the desktop app. Copy the files from Studio › Generated code."); openStudio({ kind: "code" }); return; }
    try {
      const result = await desktop.exportAddon({ name: app.technicalName, files });
      if (result) setNotice(`Exported ${result.count} files to ${result.path}`);
    } catch (e) { setNotice(`Couldn't export: ${e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : "unknown error"}`); }
  };
  /** In the schema, tables and lines open their editors; in the app's diagram, the model and field they come from. */
  const openTable = (id: string, target: Slot = slot) => {
    if (target === "schema") { setEditing({ kind: "table", id }); return; }
    const model = app && id.startsWith("t_") ? modelById(app, id.slice(2)) : undefined;
    if (model) openStudio({ kind: "model", modelId: model.id, tab: "fields" });
    else setNotice("That table belongs to Odoo or is created by a many2many field; it isn't edited in this app.");
  };
  const openRelation = (id: string, target: Slot = slot) => {
    if (target === "schema") { setEditing({ kind: "relation", id }); return; }
    const m = /^(?:r|m2m)_([^_]+)_([^_]+)/.exec(id);
    if (app && m && modelById(app, m[1])) openStudio({ kind: "model", modelId: m[1], tab: "fields", fieldId: m[2] });
  };

  // --- Commands shared by the menu bar, the toolbar and the keyboard ---
  const save = (asNew = false) => void (doc ? saveDoc(doc, asNew) : saveModel(slot, asNew));
  /** Cut, copy, paste and the like act on whatever has the focus; in a file tab so do undo and redo. */
  const editCommand = (command: EditCommand) => void (desktop ? desktop.edit(command) : document.execCommand(command));
  const undoActive = () => (onModel ? cur.h.undo() : editCommand("undo"));
  const redoActive = () => (onModel ? cur.h.redo() : editCommand("redo"));
  const closeActive = () => { if (doc) closeDoc(doc.id); else if (tabSlot === "app") closeApp(); };

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
      else if (key === "w") { event.preventDefault(); closeActive(); }
      else if (key === "f" && !event.shiftKey) { event.preventDefault(); if (doc) window.dispatchEvent(new Event(FIND_EVENT)); }
      else if (key === "b" && event.shiftKey) { event.preventDefault(); setSideOpen((v) => !v); }
      else if (!onModel) return;
      else if (!typing && key === "z" && !event.shiftKey) { event.preventDefault(); cur.h.undo(); }
      else if (!typing && (key === "y" || (key === "z" && event.shiftKey))) { event.preventDefault(); cur.h.redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const showPanel = (panel: typeof tab) => { setTab(panel); setSideOpen(true); };
  const onAppSlot = slot === "app";
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
      { label: `Export ${onAppSlot ? "app diagram" : "schema"} as Mermaid…`, onSelect: () => void exportAs("mermaid") },
      { label: `Export ${onAppSlot ? "app diagram" : "schema"} as SQL…`, onSelect: () => void exportAs("sql") },
      { label: `Export ${onAppSlot ? "app diagram" : "schema"} as image (SVG)…`, onSelect: () => void exportAs("svg") },
      { label: "Export Odoo addon…", disabled: !app, onSelect: () => void exportAddon() },
      "separator",
      { label: "Close tab", shortcut: "Ctrl+W", disabled: active === SCHEMA_TAB, onSelect: closeActive },
      { label: "Settings…", onSelect: () => setEditing({ kind: "settings" }) },
      ...(desktop ? ["separator" as const, { label: "Exit", onSelect: () => window.close() }] : []),
    ] },
    { label: "Edit", items: [
      { label: "Undo", shortcut: "Ctrl+Z", disabled: onModel && !cur.h.canUndo, onSelect: undoActive },
      { label: "Redo", shortcut: "Ctrl+Y", disabled: onModel && !cur.h.canRedo, onSelect: redoActive },
      "separator",
      { label: "Cut", shortcut: "Ctrl+X", onSelect: () => editCommand("cut") },
      { label: "Copy", shortcut: "Ctrl+C", onSelect: () => editCommand("copy") },
      { label: "Paste", shortcut: "Ctrl+V", disabled: !desktop, onSelect: () => editCommand("paste") },
      { label: "Select all", shortcut: "Ctrl+A", onSelect: () => editCommand("selectAll") },
      "separator",
      { label: "Find…", shortcut: "Ctrl+F", disabled: !doc, onSelect: () => window.dispatchEvent(new Event(FIND_EVENT)) },
    ] },
    { label: "Schema", items: [
      { label: onAppSlot ? "Add model" : "Add table", onSelect: addTable },
      { label: "Add relationship", disabled: !schema.tables.length || onAppSlot, onSelect: addRelation },
    ] },
    { label: "Studio", items: [
      { label: "New Odoo app…", onSelect: () => setEditing({ kind: "new-app", fromDiagram: false }) },
      { label: "Make an Odoo app from the schema diagram…", disabled: !schema.tables.length, onSelect: () => setEditing({ kind: "new-app", fromDiagram: true }) },
      { label: "Open the example app", onSelect: () => loadApp(exampleApp()) },
      "separator",
      { label: "Open Studio", disabled: !app, onSelect: () => openStudio() },
      { label: "Open the app's diagram", disabled: !app, onSelect: showAppDiagram },
      { label: "Export Odoo addon…", disabled: !app, onSelect: () => void exportAddon() },
      "separator",
      { label: "Copy the app's diagram to the schema tab", disabled: !app, onSelect: copyAppDiagram },
      { label: "Close the app", disabled: !app, onSelect: closeApp },
    ] },
    { label: "Mode", items: MODES.map((mode) => ({ label: MODE_LABELS[mode], shortcut: `Ctrl+Alt+${mode[0].toUpperCase()}`, disabled: !doc, checked: doc?.mode === mode, onSelect: () => setMode(mode) })) },
    { label: "View", items: [
      { label: "Sidebar", shortcut: "Ctrl+Shift+B", checked: sideOpen, onSelect: () => setSideOpen(!sideOpen) },
      { label: "Ask AI", checked: aiOpen, onSelect: () => setAiOpen(!aiOpen) },
      { label: "Column comments in diagram", checked: diagramComments, onSelect: () => setDiagramComments(!diagramComments) },
      "separator",
      ...THEMES.map(({ theme: t, label }) => ({ label: `${label} theme`, checked: theme === t, onSelect: () => chooseTheme(t) })),
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
  const dot = <span className="dirty" aria-label="Unsaved changes"> •</span>;

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
      <button className="btn ghost" title="Undo (Ctrl+Z)" disabled={onModel && !cur.h.canUndo} onClick={undoActive}>Undo</button>
      <button className="btn ghost" title="Redo (Ctrl+Y)" disabled={onModel && !cur.h.canRedo} onClick={redoActive}>Redo</button>
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
      {onStudio && <button className="btn primary" onClick={() => void exportAddon()}>Export addon…</button>}
      {!doc && !onStudio && <>
        <button className="btn primary" onClick={addTable}>{onAppSlot ? "+ Model" : "+ Table"}</button>
        {!onAppSlot && <button className="btn ghost" disabled={!schema.tables.length} onClick={addRelation}>+ Relationship</button>}
        <select className="btn ghost" aria-label="Export" value="" onChange={(e) => { const v = e.target.value; e.target.value = ""; if (v) void exportAs(v as "mermaid" | "sql" | "svg"); }}>
          <option value="">Export…</option><option value="mermaid">Mermaid (.mmd)</option><option value="sql">SQL (.sql)</option><option value="svg">Image (.svg)</option>
        </select>
      </>}
      <span className="spacer" />
      <button className={`btn ghost${aiOpen ? " active" : ""}`} aria-pressed={aiOpen} onClick={() => setAiOpen(!aiOpen)}>Ask AI</button>
      <button className="btn ghost" onClick={() => setEditing({ kind: "settings" })}>Settings</button>
    </div>

    <div className="workspace">
      {/* Studio has its own navigation, so the sidebar steps aside to give the designer room. */}
      {sideOpen && !onStudio && <aside className="sidebar">
        <div className="tabs" role="tablist" aria-label="Sidebar">{sideTab("files", "Files")}{sideTab("tables", "Tables")}{sideTab("source", "Mermaid")}</div>
        {tab === "files" ? <Explorer folder={folder} activePath={doc ? doc.path : cur.file?.path ?? null} version={treeVersion}
          onOpenFile={(path) => void openPath(path)} onChooseFolder={() => void openFolder()} onRefresh={() => setTreeVersion((v) => v + 1)} />
          : tab === "tables" ? <Outline schema={curSchema} onTable={(id) => openTable(id)} onRelation={(id) => openRelation(id)}
            onExample={() => { if (confirmDiscardSchema()) { const s = fromMermaid(EXAMPLE); sh.reset({ ...s, name: "Example shop" }); setSchemaSaved(emptySchema()); setSchemaFile(null); setActive(SCHEMA_TAB); setSchemaFit((k) => k + 1); } }} />
            : <Source schema={curSchema} onApply={applyMermaid} />}
      </aside>}

      <main className="main">
        <div className="doc-tabs" role="tablist" aria-label="Open files">
          <div className={`doc-tab${active === SCHEMA_TAB ? " active" : ""}`}>
            <button role="tab" aria-selected={active === SCHEMA_TAB} className="doc-tab-name" title={schemaFile?.path ?? "The schema and its diagram"} onClick={() => setActive(SCHEMA_TAB)}>
              <span className="doc-tab-kind" aria-hidden="true">◈</span>{schemaName}{schemaDirty && dot}
            </button>
            {/* Closing the schema leaves an empty one: the first tab is always the schema. */}
            {(schemaFile || schema.tables.length > 0) && <button className="doc-tab-close" title="Close schema" aria-label={`Close ${schemaName}`} onClick={newSchema}>×</button>}
          </div>
          {app && <>
            <div className={`doc-tab${onStudio ? " active" : ""}`} onAuxClick={(event) => { if (event.button === 1) closeApp(); }}>
              <button role="tab" aria-selected={onStudio} className="doc-tab-name" title={appFile?.path ?? "Design the Odoo app's models, views and menus (not saved yet)"} onClick={() => openStudio()}>
                <span className="doc-tab-kind" aria-hidden="true">◧</span>Studio: {app.name}{appDirty && dot}</button>
              <button className="doc-tab-close" title="Close the app (Ctrl+W)" aria-label={`Close app ${app.name}`} onClick={closeApp}>×</button>
            </div>
            <div className={`doc-tab${onAppDiagram ? " active" : ""}`}>
              <button role="tab" aria-selected={onAppDiagram} className="doc-tab-name" title="The tables the app's models create" onClick={showAppDiagram}>
                <span className="doc-tab-kind" aria-hidden="true">◈</span>Diagram: {app.name}</button>
            </div>
          </>}
          {docs.map((d) => <div key={d.id} className={`doc-tab${d.id === active ? " active" : ""}`}
            onAuxClick={(event) => { if (event.button === 1) closeDoc(d.id); }}>
            <button role="tab" aria-selected={d.id === active} className="doc-tab-name" title={d.path ?? "Not saved yet"} onClick={() => setActive(d.id)}>
              {d.name}{d.content !== d.saved && dot}
            </button>
            <button className="doc-tab-close" title="Close tab (Ctrl+W)" aria-label={`Close ${d.name}`} onClick={() => closeDoc(d.id)}>×</button>
          </div>)}
        </div>
        <div className="canvas" hidden={active !== SCHEMA_TAB}>
          <Diagram schema={schema} selected={selected} comments={diagramComments} fitKey={schemaFit} onSvg={(s) => { schemaSvg.current = s; }}
            onTable={(id) => openTable(id, "schema")} onRelation={(id) => openRelation(id, "schema")} />
        </div>
        {app && <div className="canvas" hidden={!onAppDiagram}>
          <Diagram schema={appSchema} selected={null} comments={diagramComments} fitKey={appFit} onSvg={(s) => { appSvg.current = s; }}
            onTable={(id) => openTable(id, "app")} onRelation={(id) => openRelation(id, "app")} />
        </div>}
        {app && onStudio && <StudioView app={app} onApp={commitApp} problems={appProblems} onExport={() => void exportAddon()} page={studioPage} onPage={setStudioPage} />}
        {docs.map((d) => <DocEditor key={d.id} doc={d} hidden={d.id !== active} zoom={docZoom} onChange={changeDoc} />)}
        <div className="statusbar">
          {doc ? <><span>{MODE_LABELS[doc.mode]}</span><span className="status-path">{doc.path ?? "Not saved yet"}</span></>
            : <><span>{onAppSlot && app ? `Odoo app ${app.technicalName} · ${app.models.length} models · ` : ""}{curSchema.tables.length} tables · {curSchema.relations.length} relationships</span>
              {problems.length > 0 && <span className="warn" title={problems.join("\n")}>{problems.length} problem{problems.length > 1 ? "s" : ""}: {problems[0]}</span>}</>}
        </div>
        {notice && <div className="toast" role="status">{notice}</div>}
      </main>

      {aiOpen && <AiPanel schema={curSchema} onApply={(text) => void applyMermaid(text)} onSettings={() => setEditing({ kind: "settings" })} onClose={() => setAiOpen(false)} />}
    </div>

    {editing?.kind === "table" && tableById(schema, editing.id) && <TableEditor key={editing.id} schema={schema} tableId={editing.id} onSave={sh.commit}
      onOpenRelation={(id) => setEditing({ kind: "relation", id })} onClose={() => setEditing(null)} />}
    {editing?.kind === "relation" && <RelationEditor key={editing.id ?? "new"} schema={schema} relationId={editing.id} onSave={sh.commit}
      onOpenTable={(id) => setEditing({ kind: "table", id })} onClose={() => setEditing(null)} />}
    {editing?.kind === "settings" && <Settings theme={theme} onTheme={chooseTheme} onClose={() => setEditing(null)} />}
    {editing?.kind === "new-app" && <NewAppDialog fromDiagram={editing.fromDiagram} onClose={() => setEditing(null)} onCreate={(input) => createApp(input, editing.fromDiagram)} />}
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
