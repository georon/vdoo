import { useEffect, useMemo, useState } from "react";
import {
  type OdooApp, type OdooMenu, type OdooModel, type OdooVersion, type TType, type ViewMode, type ViewType, type WindowAction,
  ODOO_VERSIONS, MODULE_NAME, TTYPES, VIEW_MODES, VIEW_TYPES, addField, addModel, addView, fieldById, formFieldNodes, isViewMode, modelById, newId, removeField, removeModel,
  replaceField, replaceModel, ttypeLabel, viewLabel, viewOf,
} from "../odoo/studioModel";
import { generateAddon } from "../odoo/generateAddon";
import type { Problem } from "../odoo/validateApp";
import { Check, CommitInput, Prop } from "./controls";
import { FieldProps } from "./FieldProps";
import { FormDesigner, paletteField } from "./FormDesigner";
import { ListDesigner } from "./ListDesigner";
import { KanbanDesigner } from "./KanbanDesigner";
import { CalendarDesigner } from "./CalendarDesigner";
import { PivotDesigner } from "./PivotDesigner";
import { GraphDesigner } from "./GraphDesigner";
import { SearchDesigner } from "./SearchDesigner";
import { Modal } from "../Modal";
import "./studio.css";

export type StudioPage = { kind: "app" } | { kind: "menus" } | { kind: "code" } | { kind: "model"; modelId: string; tab: "fields" | ViewType; fieldId?: string };

interface Props {
  app: OdooApp;
  onApp: (app: OdooApp) => void;
  problems: Problem[];
  onExport: () => void;
  /** Set from outside (a click on the diagram) to open a page; cleared through onPage. */
  page: StudioPage | null;
  onPage: (page: StudioPage) => void;
}

export function StudioView({ app, onApp, problems, onExport, page: wanted, onPage }: Props) {
  const firstModel = app.models.find((m) => !m.extend) ?? app.models[0];
  const [own, setOwn] = useState<StudioPage>(firstModel ? { kind: "model", modelId: firstModel.id, tab: "form" } : { kind: "app" });
  const page = wanted ?? own;
  const go = (p: StudioPage) => { setOwn(p); onPage(p); };
  const [showProblems, setShowProblems] = useState(false);
  // A model that was deleted (or undone away) falls back to the app page.
  useEffect(() => { if (page.kind === "model" && !modelById(app, page.modelId)) go({ kind: "app" }); });
  const model = page.kind === "model" ? modelById(app, page.modelId) : undefined;

  return <div className="studio">
    <nav className="st-nav" aria-label="Studio">
      <div className="st-app-name" title={app.technicalName}>{app.name}<small>{app.technicalName} · Odoo {app.odooVersion}</small></div>
      <NavItem active={page.kind === "app"} onClick={() => go({ kind: "app" })}>⚙ App settings</NavItem>
      <NavItem active={page.kind === "menus"} onClick={() => go({ kind: "menus" })}>☰ Menus & actions</NavItem>
      <h3>Models</h3>
      {app.models.map((m) => {
        const on = page.kind === "model" && page.modelId === m.id;
        const count = problems.filter((p) => p.modelId === m.id).length;
        return <div key={m.id} className={`st-nav-model${on ? " open" : ""}`}>
          <NavItem active={on && page.tab === "fields"} onClick={() => go({ kind: "model", modelId: m.id, tab: on && page.tab !== "fields" ? page.tab : "fields" })}>
            {m.extend ? "⊕ " : ""}{m.description || m.name}{count > 0 && <span className="st-count" title={`${count} problem${count > 1 ? "s" : ""}`}>{count}</span>}
          </NavItem>
          {on && <div className="st-nav-sub">
            <NavItem active={page.tab === "fields"} onClick={() => go({ kind: "model", modelId: m.id, tab: "fields" })}>Fields</NavItem>
            {!m.extend && VIEW_TYPES.filter((t) => viewOf(app, m.id, t.type)).map((t) =>
              <NavItem key={t.type} active={page.tab === t.type} onClick={() => go({ kind: "model", modelId: m.id, tab: t.type })}>{viewLabel(t.type)} view</NavItem>)}
            {!m.extend && <AddView app={app} modelId={m.id} onAdd={(type) => { onApp(addView(app, m.id, type)); go({ kind: "model", modelId: m.id, tab: type }); }} />}
          </div>}
        </div>;
      })}
      <AddModel app={app} onAdd={(next, id) => { onApp(next); go({ kind: "model", modelId: id, tab: "fields" }); }} />
      <span className="spacer" />
      <NavItem active={page.kind === "code"} onClick={() => go({ kind: "code" })}>{"</>"} Generated code</NavItem>
      <button className="btn primary st-export" onClick={onExport}>Export addon…</button>
    </nav>

    <section className="st-main">
      {problems.length > 0 && <div className={`st-problems${showProblems ? " open" : ""}`} role="status">
        <button className="link" onClick={() => setShowProblems(!showProblems)}>⚠ {problems.length} problem{problems.length > 1 ? "s" : ""} to fix before the addon installs{showProblems ? " ▴" : " ▾"}</button>
        {showProblems && <ul>{problems.map((p, i) => <li key={i}>{p.modelId
          ? <button className="link" onClick={() => go({ kind: "model", modelId: p.modelId!, tab: "fields", fieldId: p.fieldId })}>{p.message}</button> : p.message}</li>)}</ul>}
      </div>}
      {page.kind === "app" && <AppSettings app={app} onApp={onApp} onOpen={(id) => go({ kind: "model", modelId: id, tab: "fields" })} />}
      {page.kind === "menus" && <MenusEditor app={app} onApp={onApp} />}
      {page.kind === "code" && <CodeView app={app} problems={problems} onExport={onExport} />}
      {model && page.kind === "model" && page.tab === "fields" && <FieldsPage app={app} model={model} onApp={onApp} focusField={page.fieldId} />}
      {model && page.kind === "model" && page.tab !== "fields" && <ViewPage app={app} model={model} type={page.tab} onApp={onApp} />}
    </section>
  </div>;
}

/** "+ Add view ▾": the view types the model doesn't have yet. */
function AddView({ app, modelId, onAdd }: { app: OdooApp; modelId: string; onAdd: (type: ViewType) => void }) {
  const [open, setOpen] = useState(false);
  const missing = VIEW_TYPES.filter((t) => !viewOf(app, modelId, t.type));
  if (!missing.length) return null;
  return <div className="st-add-view">
    <button className="link small" aria-expanded={open} onClick={() => setOpen(!open)}>+ Add view {open ? "▴" : "▾"}</button>
    {open && <div className="st-add-view-menu" role="menu">{missing.map((t) =>
      <button key={t.type} role="menuitem" className="st-nav-item" onClick={() => { setOpen(false); onAdd(t.type); }}>
        <span className="st-chip-icon" aria-hidden="true">{t.icon}</span>{t.label}</button>)}</div>}
  </div>;
}

const NavItem = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) =>
  <button className={`st-nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined} onClick={onClick}>{children}</button>;

function AddModel({ app, onAdd }: { app: OdooApp; onAdd: (app: OdooApp, modelId: string) => void }) {
  const [mode, setMode] = useState<null | "new" | "extend">(null);
  const [text, setText] = useState("");
  if (!mode) return <div className="st-add-model">
    <button className="link small" onClick={() => { setMode("new"); setText(""); }}>+ New model</button>
    <button className="link small" title="Add fields to an existing Odoo model, such as res.partner" onClick={() => { setMode("extend"); setText(""); }}>+ Extend an Odoo model</button>
  </div>;
  const submit = () => {
    const value = text.trim();
    if (!value) return;
    if (mode === "new") { const { app: next, model } = addModel(app, value); onAdd(next, model.id); }
    else {
      const model: OdooModel = { id: newId(), name: value, description: value, extend: true, chatter: false, order: "", recName: "", fields: [] };
      onAdd({ ...app, models: [...app.models, model] }, model.id);
    }
    setMode(null);
  };
  return <form className="st-add-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
    <input autoFocus value={text} placeholder={mode === "new" ? "Description, e.g. Equipment" : "Model, e.g. res.partner"} aria-label={mode === "new" ? "New model description" : "Model to extend"}
      onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setMode(null); }} />
    <button className="btn primary small" type="submit">Add</button>
  </form>;
}

// ── App settings ─────────────────────────────────────────────────────────────────────────
function AppSettings({ app, onApp, onOpen }: { app: OdooApp; onApp: (app: OdooApp) => void; onOpen: (id: string) => void }) {
  const set = (patch: Partial<OdooApp>) => onApp({ ...app, ...patch });
  return <div className="st-page">
    <h2>App settings</h2>
    <div className="st-form-grid">
      <Prop label="Name"><CommitInput value={app.name} onCommit={(name) => set({ name })} /></Prop>
      <Prop label="Technical name" hint={MODULE_NAME.test(app.technicalName) ? "The addon's folder name." : "Lowercase letters, digits and underscores."}>
        <CommitInput value={app.technicalName} onCommit={(technicalName) => set({ technicalName: technicalName.trim() })} /></Prop>
      <Prop label="Odoo version"><select value={app.odooVersion} onChange={(e) => set({ odooVersion: e.target.value as OdooVersion })}>
        {ODOO_VERSIONS.map((v) => <option key={v} value={v}>Odoo {v}</option>)}</select></Prop>
      <Prop label="Version"><CommitInput value={app.version} onCommit={(version) => set({ version })} /></Prop>
      <Prop label="Summary"><CommitInput value={app.summary} onCommit={(summary) => set({ summary })} /></Prop>
      <Prop label="Category"><CommitInput value={app.category} onCommit={(category) => set({ category })} /></Prop>
      <Prop label="Author"><CommitInput value={app.author} onCommit={(author) => set({ author })} /></Prop>
      <Prop label="License"><select value={app.license} onChange={(e) => set({ license: e.target.value })}>
        {["LGPL-3", "GPL-3", "AGPL-3", "OEEL-1", "OPL-1", "Other proprietary"].map((l) => <option key={l}>{l}</option>)}</select></Prop>
      <Prop label="Other modules it needs" hint="Comma-separated. base, mail and the modules of related models are added automatically.">
        <CommitInput value={app.depends.join(", ")} placeholder="e.g. sale, hr" onCommit={(d) => set({ depends: d.split(",").map((x) => x.trim()).filter(Boolean) })} /></Prop>
    </div>
    <h3>Models</h3>
    <table className="st-table">
      <thead><tr><th>Description</th><th>Technical name</th><th>Fields</th><th /></tr></thead>
      <tbody>{app.models.map((m) => <tr key={m.id}>
        <td><button className="link" onClick={() => onOpen(m.id)}>{m.description || m.name}</button>{m.extend && <span className="st-tag">extends</span>}</td>
        <td><code>{m.name}</code></td><td>{m.fields.length}</td>
        <td className="row-actions"><button className="btn ghost small danger-text" onClick={() => {
          if (window.confirm(`Delete ${m.name} with its fields, views and menus?`)) onApp(removeModel(app, m.id));
        }}>Delete</button></td>
      </tr>)}</tbody>
    </table>
  </div>;
}

// ── Fields ───────────────────────────────────────────────────────────────────────────────
function FieldsPage({ app, model, onApp, focusField }: { app: OdooApp; model: OdooModel; onApp: (app: OdooApp) => void; focusField?: string }) {
  const [sel, setSel] = useState<string | null>(focusField ?? null);
  const [newType, setNewType] = useState<TType>("char");
  useEffect(() => { if (focusField) setSel(focusField); }, [focusField]);
  const field = fieldById(model, sel ?? "");
  const form = viewOf(app, model.id, "form"), list = viewOf(app, model.id, "list");
  const onForm = new Set(form ? [...formFieldNodes(form.arch.body).map((n) => n.fieldId), form.arch.titleFieldId, form.arch.statusbarFieldId] : []);
  const onList = new Set(list?.arch.columns.map((c) => c.fieldId) ?? []);
  const setModel = (patch: Partial<OdooModel>) => onApp(replaceModel(app, { ...model, ...patch }));
  const move = (i: number, by: number) => { const fields = model.fields.slice(); fields.splice(i + by, 0, fields.splice(i, 1)[0]); setModel({ fields }); };

  return <div className="st-split">
    <div className="st-page">
      <h2>{model.description || model.name}</h2>
      {model.extend ? <p className="hint">These fields are added to the existing <code>{model.name}</code> model. Showing them on its existing forms (inherited views) will come in a later version;
        for now they appear in the generated model and can be used by your own views.</p>
        : <div className="st-form-grid">
          <Prop label="Description"><CommitInput value={model.description} onCommit={(description) => setModel({ description })} /></Prop>
          <Prop label="Technical name"><CommitInput value={model.name} onCommit={(name) => setModel({ name: name.trim() })} /></Prop>
          <Prop label="Default order" hint="e.g. date desc, id desc"><CommitInput value={model.order} onCommit={(order) => setModel({ order })} /></Prop>
          <Prop label="Record name"><select value={model.recName} onChange={(e) => setModel({ recName: e.target.value })}>
            <option value="">name (default)</option>{model.fields.filter((f) => f.ttype === "char" && f.name !== "name").map((f) => <option key={f.id} value={f.id}>{f.string || f.name}</option>)}</select></Prop>
          <Check label="Chatter: messages, followers, activities and tracked changes" checked={model.chatter} onChange={(chatter) => setModel({ chatter })} />
        </div>}
      <h3>Fields</h3>
      <table className="st-table st-fields">
        <thead><tr><th>Label</th><th>Technical name</th><th>Type</th><th>Required</th><th>Shown on</th><th /></tr></thead>
        <tbody>{model.fields.map((f, i) => <tr key={f.id} className={sel === f.id ? "selected" : ""} onClick={() => setSel(f.id)}>
          <td><button className="link" onClick={() => setSel(f.id)}>{f.string || f.name}</button></td>
          <td><code>{f.name}</code></td>
          <td>{ttypeLabel(f.ttype)}{f.comodel ? <small> → {f.comodel}</small> : null}</td>
          <td>{f.required ? "Yes" : ""}</td>
          <td>{onForm.has(f.id) && <span className="st-tag">form</span>}{onList.has(f.id) && <span className="st-tag">list</span>}</td>
          <td className="row-actions" onClick={(e) => e.stopPropagation()}>
            <button className="pill-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button className="pill-btn" aria-label="Move down" disabled={i === model.fields.length - 1} onClick={() => move(i, 1)}>↓</button>
            <button className="pill-btn" aria-label={`Delete ${f.name}`} title="Delete the field" onClick={() => {
              if (window.confirm(`Delete the field ${f.name} from the model and every view?`)) { onApp(removeField(app, model.id, f.id)); if (sel === f.id) setSel(null); }
            }}>×</button>
          </td>
        </tr>)}</tbody>
      </table>
      <div className="st-add-field">
        <select aria-label="New field type" value={newType} onChange={(e) => setNewType(e.target.value as TType)}>
          {TTYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}</select>
        <button className="btn ghost" onClick={() => { const f = paletteField(app, model, newType); onApp(addField(app, model.id, f)); setSel(f.id); }}>+ Add field</button>
        <span className="hint">New fields aren't placed on the views: drag them there in the Form and List designers.</span>
      </div>
    </div>
    <aside className="st-props" aria-label="Field properties">
      {field ? <><div className="st-props-head"><h3>{field.string || field.name}</h3></div>
        <FieldProps app={app} model={model} field={field} onChange={(f) => onApp(replaceField(app, model.id, f))} /></>
        : <p className="hint">Choose a field to change it.</p>}
    </aside>
  </div>;
}

function ViewPage({ app, model, type, onApp }: { app: OdooApp; model: OdooModel; type: ViewType; onApp: (app: OdooApp) => void }) {
  const view = app.views.find((v) => v.modelId === model.id && v.type === type);
  if (!view) return <div className="st-page st-empty">
    <p>{model.description} has no {viewLabel(type).toLowerCase()} view.</p>
    <button className="btn primary" onClick={() => onApp(addView(app, model.id, type))}>Add the {viewLabel(type).toLowerCase()} view</button>
  </div>;
  const props = { app, model, onApp };
  switch (view.type) {
    case "form": return <FormDesigner {...props} view={view} />;
    case "list": return <ListDesigner {...props} view={view} />;
    case "kanban": return <KanbanDesigner {...props} view={view} />;
    case "calendar": return <CalendarDesigner {...props} view={view} />;
    case "pivot": return <PivotDesigner {...props} view={view} />;
    case "graph": return <GraphDesigner {...props} view={view} />;
    case "search": return <SearchDesigner {...props} view={view} />;
  }
}

/** The view modes an action of the model can open: the ones it has views for, plus list and form (Odoo can default those), plus any already ticked. */
const actionModes = (app: OdooApp, a: WindowAction): ViewMode[] =>
  VIEW_MODES.filter((m) => m === "list" || m === "form" || !!viewOf(app, a.modelId, m) || a.viewModes.includes(m));

// ── Menus and actions ────────────────────────────────────────────────────────────────────
function MenusEditor({ app, onApp }: { app: OdooApp; onApp: (app: OdooApp) => void }) {
  const [sel, setSel] = useState<string | null>(app.menus[0]?.id ?? null);
  const menu = app.menus.find((m) => m.id === sel);
  const setMenu = (m: OdooMenu) => onApp({ ...app, menus: app.menus.map((x) => (x.id === m.id ? m : x)) });
  const setAction = (a: WindowAction) => onApp({ ...app, actions: app.actions.map((x) => (x.id === a.id ? a : x)) });
  const descendants = (id: string): string[] => app.menus.filter((m) => m.parentId === id).flatMap((m) => [m.id, ...descendants(m.id)]);
  const add = (parentId: string | null) => {
    const siblings = app.menus.filter((m) => m.parentId === parentId);
    const m: OdooMenu = { id: newId(), name: parentId ? "New menu" : "New app menu", parentId, actionId: null, sequence: 10 * (siblings.length + 1) };
    onApp({ ...app, menus: [...app.menus, m] }); setSel(m.id);
  };
  const tree = (parentId: string | null, depth: number): React.ReactNode[] => app.menus.filter((m) => m.parentId === parentId)
    .sort((a, b) => a.sequence - b.sequence).flatMap((m) => [
      <li key={m.id}><button className={`st-menu-row${sel === m.id ? " active" : ""}`} style={{ paddingLeft: 10 + depth * 18 }} onClick={() => setSel(m.id)}>
        {depth === 0 ? "▦ " : ""}{m.name}{m.actionId && <small> → {app.actions.find((a) => a.id === m.actionId)?.name}</small>}</button></li>,
      ...tree(m.id, depth + 1)]);
  return <div className="st-split">
    <div className="st-page">
      <h2>Menus</h2>
      <p className="hint">The top menu is the app's icon on the Odoo home screen; the menus under it open actions.</p>
      <ul className="st-plain st-menus">{tree(null, 0)}</ul>
      <div className="st-move">
        <button className="btn ghost small" onClick={() => add(null)}>+ Top menu</button>
        <button className="btn ghost small" disabled={!menu} onClick={() => menu && add(menu.id)}>+ Submenu under {menu?.name ?? "…"}</button>
      </div>
      <h2>Actions</h2>
      <p className="hint">An action opens a model's records in the views you choose.</p>
      <table className="st-table">
        <thead><tr><th>Name</th><th>Model</th><th>Views</th><th>Default view</th><th>Domain</th><th>Context</th><th /></tr></thead>
        <tbody>{app.actions.map((a) => <tr key={a.id}>
          <td><CommitInput aria-label="Action name" value={a.name} onCommit={(name) => setAction({ ...a, name })} /></td>
          <td><select aria-label="Model" value={a.modelId} onChange={(e) => setAction({ ...a, modelId: e.target.value })}>
            {app.models.map((m) => <option key={m.id} value={m.id}>{m.description || m.name}</option>)}</select></td>
          <td className="st-modes">{actionModes(app, a).map((v) => <Check key={v} label={viewLabel(v).toLowerCase()} checked={a.viewModes.includes(v)}
            onChange={(on) => setAction({ ...a, viewModes: on ? [...a.viewModes, v] : a.viewModes.filter((x) => x !== v) })} />)}</td>
          <td><select aria-label="Default view" value={a.viewModes[0] ?? ""} disabled={a.viewModes.length < 2}
            onChange={(e) => { const first = e.target.value; if (isViewMode(first)) setAction({ ...a, viewModes: [first, ...a.viewModes.filter((x) => x !== first)] }); }}>
            {!a.viewModes.length && <option value="">list</option>}
            {a.viewModes.map((v) => <option key={v} value={v}>{viewLabel(v)}</option>)}</select></td>
          <td><CommitInput aria-label="Domain" className="st-code" value={a.domain} placeholder="[('state', '!=', 'done')]" onCommit={(domain) => setAction({ ...a, domain })} /></td>
          <td><CommitInput aria-label="Context" className="st-code" value={a.context} placeholder="{'search_default_...': 1}" onCommit={(context) => setAction({ ...a, context })} /></td>
          <td><button className="pill-btn" aria-label={`Delete ${a.name}`} onClick={() => onApp({ ...app, actions: app.actions.filter((x) => x.id !== a.id),
            menus: app.menus.map((m) => (m.actionId === a.id ? { ...m, actionId: null } : m)) })}>×</button></td>
        </tr>)}</tbody>
      </table>
      <button className="btn ghost small" disabled={!app.models.length} onClick={() => {
        const m = app.models[0];
        onApp({ ...app, actions: [...app.actions, { id: newId(), name: m.description || m.name, modelId: m.id, viewModes: ["list", "form"], domain: "", context: "" }] });
      }}>+ Action</button>
    </div>
    <aside className="st-props" aria-label="Menu properties">
      {menu ? <>
        <div className="st-props-head"><h3>{menu.name}</h3>
          <button className="btn ghost small danger-text" onClick={() => {
            const gone = new Set([menu.id, ...descendants(menu.id)]);
            if (gone.size > 1 && !window.confirm(`Delete ${menu.name} and the ${gone.size - 1} menus under it?`)) return;
            onApp({ ...app, menus: app.menus.filter((m) => !gone.has(m.id)) }); setSel(null);
          }}>Remove</button></div>
        <Prop label="Name"><CommitInput value={menu.name} onCommit={(name) => setMenu({ ...menu, name })} /></Prop>
        <Prop label="Under"><select value={menu.parentId ?? ""} onChange={(e) => setMenu({ ...menu, parentId: e.target.value || null })}>
          <option value="">Nothing (a top menu)</option>
          {app.menus.filter((m) => m.id !== menu.id && !descendants(menu.id).includes(m.id)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Prop>
        <Prop label="Opens"><select value={menu.actionId ?? ""} onChange={(e) => setMenu({ ...menu, actionId: e.target.value || null })}>
          <option value="">Nothing (holds submenus)</option>{app.actions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Prop>
        <Prop label="Sequence" hint="Lower comes first."><CommitInput type="number" value={String(menu.sequence)} onCommit={(v) => setMenu({ ...menu, sequence: Number(v) || 0 })} /></Prop>
      </> : <p className="hint">Choose a menu to change it.</p>}
    </aside>
  </div>;
}

// ── Generated code ───────────────────────────────────────────────────────────────────────
function CodeView({ app, problems, onExport }: { app: OdooApp; problems: Problem[]; onExport: () => void }) {
  const files = useMemo(() => generateAddon(app), [app]);
  const [path, setPath] = useState(files.find((f) => f.path.endsWith(".xml"))?.path ?? files[0]?.path);
  const file = files.find((f) => f.path === path) ?? files[0];
  return <div className="st-code-view">
    <aside className="st-files">
      <h3>{app.technicalName}/</h3>
      <ul className="st-plain">{files.map((f) => <li key={f.path}><button className={`st-file${f.path === file?.path ? " active" : ""}`} title={f.path} onClick={() => setPath(f.path)}>{f.path}</button></li>)}</ul>
      <button className="btn primary small" onClick={onExport}>Export addon…</button>
      {problems.length > 0 && <p className="hint warn">Fix the {problems.length} problem{problems.length > 1 ? "s" : ""} above first: Odoo may refuse to install the addon.</p>}
    </aside>
    <div className="st-file-view">
      <div className="st-file-head"><code>{file?.path}</code><span className="spacer" /><button className="link small" onClick={() => void navigator.clipboard.writeText(file?.content ?? "")}>Copy</button></div>
      <pre aria-label={file?.path}>{file?.content}</pre>
    </div>
  </div>;
}

// ── New app ──────────────────────────────────────────────────────────────────────────────
export function NewAppDialog({ fromDiagram, onCreate, onClose }: { fromDiagram: boolean; onCreate: (input: { name: string; model: string; version: OdooVersion }) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [version, setVersion] = useState<OdooVersion>("19.0");
  const ok = name.trim().length > 0 && (fromDiagram || model.trim().length > 0);
  const submit = () => { if (ok) onCreate({ name: name.trim(), model: model.trim(), version }); };
  return <Modal title={fromDiagram ? "Make an Odoo app from this diagram" : "New Odoo app"} onClose={onClose} footer={<>
    <span className="spacer" /><button className="btn ghost" onClick={onClose}>Cancel</button>
    <button className="btn primary" disabled={!ok} onClick={submit}>Create</button></>}>
    <form className="form-grid" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <label>App name<input autoFocus value={name} placeholder="e.g. Equipment" onChange={(e) => setName(e.target.value)} /></label>
      {!fromDiagram && <label>First model<input value={model} placeholder="e.g. Equipment item" onChange={(e) => setModel(e.target.value)} /></label>}
      <label>Odoo version<select value={version} onChange={(e) => setVersion(e.target.value as OdooVersion)}>{ODOO_VERSIONS.map((v) => <option key={v} value={v}>Odoo {v}</option>)}</select></label>
      <button type="submit" hidden />
    </form>
    <p className="hint">{fromDiagram ? "Each table becomes a model, foreign keys become many2one fields with a one2many back, and every model gets a form, a list and a menu."
      : "The app gets a top menu, and the model a name field, a form view, a list view and a menu. Design them in Studio, then export an installable addon."}</p>
  </Modal>;
}
