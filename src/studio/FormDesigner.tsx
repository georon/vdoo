import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import {
  type ButtonNode, type FieldNode, type FormArch, type FormNode, type OdooApp, type OdooField, type OdooModel, type OdooView, type PageNode, type SmartButton, type TType,
  BODY, TTYPES, addField, buttonNode, containers, defaultForm, fieldById, fieldNode, findNode, formFieldNodes, groupNode, insertNode, moveNode, newField, newId, notebookNode,
  pageNode, removeField, removeNode, replaceField, replaceModel, replaceView, separatorNode, slug, titleCase, updateNode,
} from "../odoo/studioModel";
import { Check, CommitInput, ModifierEditor, Prop, modifierBadges } from "./controls";
import { FieldProps, WIDGETS } from "./FieldProps";
import { FakeWidget } from "./preview";

type FormView = Extract<OdooView, { type: "form" }>;
type Drag = { kind: "new"; ttype: TType } | { kind: "field"; fieldId: string } | { kind: "component"; c: "columns" | "group" | "notebook" | "separator" } | { kind: "move"; id: string };
type Selection = { kind: "node"; id: string } | { kind: "button"; id: string } | { kind: "smart"; id: string } | { kind: "status" } | { kind: "title" } | null;

const SMART_ICONS = ["fa-list", "fa-tasks", "fa-file-text-o", "fa-users", "fa-shopping-cart", "fa-truck", "fa-money", "fa-calendar", "fa-check-square-o", "fa-star"];

/** A unique technical name for a field added from the palette. */
export function newFieldName(model: OdooModel, ttype: TType): string {
  const base = ttype === "many2one" ? "new_record_id" : ttype === "one2many" || ttype === "many2many" ? "new_record_ids" : `new_${slug(TTYPES.find((t) => t.type === ttype)!.label)}`;
  let name = base, n = 1;
  while (model.fields.some((f) => f.name === name)) name = base.replace(/(_ids?)?$/, (m) => `_${++n}${m}`);
  return name;
}

/** A field of the given type, set up so it validates when possible (a one2many finds its inverse). */
export function paletteField(app: OdooApp, model: OdooModel, ttype: TType): OdooField {
  const label = `New ${TTYPES.find((t) => t.type === ttype)!.label}`;
  if (ttype === "one2many") {
    const back = app.models.flatMap((m) => m.fields.filter((f) => f.ttype === "many2one" && f.comodel === model.name).map((f) => ({ m, f })))[0];
    return newField({ name: newFieldName(model, ttype), string: label, ttype, comodel: back?.m.name ?? "", inverseName: back?.f.name ?? "" });
  }
  return newField({ name: newFieldName(model, ttype), string: label, ttype });
}

export function FormDesigner({ app, model, view, onApp }: { app: OdooApp; model: OdooModel; view: FormView; onApp: (app: OdooApp) => void }) {
  const arch = view.arch;
  const [sel, setSel] = useState<Selection>(null);
  const [dragging, setDragging] = useState(false);
  const [pages, setPages] = useState<Record<string, string>>({});
  const drag = useRef<Drag | null>(null);
  const shown = new Set([...formFieldNodes(arch.body).map((n) => n.fieldId), arch.titleFieldId, arch.statusbarFieldId]);

  const setArch = (next: FormArch, base = app) => onApp(replaceView(base, { ...view, arch: next }));
  const selectedNode = sel?.kind === "node" ? findNode(arch.body, sel.id) : undefined;
  useEffect(() => { if (sel?.kind === "node" && !selectedNode) setSel(null); }, [sel, selectedNode]);

  /** Where a click in the palette adds: into the selected group or tab, else at the end of the form. */
  const clickTarget = (): [string, number] => {
    if (selectedNode && (selectedNode.kind === "group" || selectedNode.kind === "page")) return [selectedNode.id, selectedNode.children.length];
    return [BODY, arch.body.length];
  };

  const drop = (d: Drag, containerId: string, index: number) => {
    let base = app, node: FormNode;
    if (d.kind === "move") { setArch({ ...arch, body: moveNode(arch.body, d.id, containerId, index) }); return; }
    if (d.kind === "new") {
      const f = paletteField(app, model, d.ttype);
      base = addField(app, model.id, f);
      node = fieldNode(f.id, d.ttype === "one2many" || d.ttype === "many2many" ? { nolabel: containerId !== BODY && findNode(arch.body, containerId)?.kind === "page" } : {});
    } else if (d.kind === "field") node = fieldNode(d.fieldId);
    else node = d.c === "columns" ? groupNode([groupNode(), groupNode()]) : d.c === "group" ? groupNode([], "Group") : d.c === "notebook" ? notebookNode([pageNode("Tab 1")]) : separatorNode("Section");
    setArch({ ...arch, body: insertNode(arch.body, containerId, index, node) }, base);
    setSel({ kind: "node", id: node.id });
  };

  const startDrag = (event: React.DragEvent, d: Drag) => {
    event.stopPropagation();
    drag.current = d;
    event.dataTransfer.effectAllowed = d.kind === "move" ? "move" : "copy";
    event.dataTransfer.setData("text/plain", d.kind);
    // Showing the drop slots on the next frame keeps the browser from cancelling a drag whose layout just changed.
    requestAnimationFrame(() => setDragging(true));
  };
  const endDrag = () => { drag.current = null; setDragging(false); };

  // Delete removes the selected element from the form when the focus isn't in a text box.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Delete" || !sel || (event.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (sel.kind === "node") setArch({ ...arch, body: removeNode(arch.body, sel.id) });
      else if (sel.kind === "button") setArch({ ...arch, buttons: arch.buttons.filter((b) => b.id !== sel.id) });
      else if (sel.kind === "smart") setArch({ ...arch, smartButtons: arch.smartButtons.filter((b) => b.id !== sel.id) });
      else return;
      setSel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── Preview ──
  const canDrop = (containerId: string) => { const d = drag.current; return !!d && !(d.kind === "move" && isInside(d.id, containerId)); };
  const slot = (containerId: string, index: number, empty = false) => <Slot key={`slot-${containerId}-${index}`} empty={empty} canDrop={() => canDrop(containerId)}
    onDrop={() => { const d = drag.current; endDrag(); if (d) drop(d, containerId, index); }} />;
  const isInside = (nodeId: string, containerId: string): boolean => {
    if (nodeId === containerId) return true;
    const n = findNode(arch.body, nodeId);
    if (!n || n.kind === "field" || n.kind === "separator") return false;
    const inner = n.kind === "notebook" ? n.pages : n.kind === "group" || n.kind === "page" ? n.children : [];
    return inner.some((c) => c.id === containerId || isInside(c.id, containerId));
  };

  const list = (nodes: FormNode[], containerId: string, inGroup: boolean) =>
    <div className="sf-list">
      {nodes.map((n, i) => <Fragment key={n.id}>{slot(containerId, i)}{node(n, inGroup)}</Fragment>)}
      {slot(containerId, nodes.length, !nodes.length)}
    </div>;

  const selectable = (id: string, extra = "") => ({
    className: `sf-el${sel?.kind === "node" && sel.id === id ? " selected" : ""}${extra}`, draggable: true, tabIndex: 0,
    onDragStart: (e: React.DragEvent) => startDrag(e, { kind: "move", id }), onDragEnd: endDrag,
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); setSel({ kind: "node", id }); },
    onKeyDown: (e: React.KeyboardEvent) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); setSel({ kind: "node", id }); } },
  });

  const node = (n: FormNode, inGroup: boolean): ReactNode => {
    if (n.kind === "field") {
      const f = fieldById(model, n.fieldId);
      const label = n.string || f?.string || (f ? titleCase(f.name) : "Missing field");
      const badges = <Badges n={n} />;
      return <div {...selectable(n.id, inGroup && !n.nolabel ? " sf-field labelled" : " sf-field")} aria-label={`Field ${label}`}>
        {inGroup && !n.nolabel && <span className={`sf-label${f?.required || n.required === "True" ? " required" : ""}`}>{label}{badges}</span>}
        <span className="sf-value">{f ? <FakeWidget app={app} field={f} widget={n.widget} placeholder={n.placeholder} /> : <em className="danger-text">deleted field</em>}
          {(!inGroup || n.nolabel) && badges}</span>
      </div>;
    }
    if (n.kind === "separator") return <div {...selectable(n.id, " sf-separator")}><span>{n.string || "Separator"}</span></div>;
    if (n.kind === "group") {
      const columns = n.children.length > 1 && n.children.every((c) => c.kind === "group");
      return <div {...selectable(n.id, " sf-group")} aria-label={`Group ${n.string}`}>
        {n.string && <div className="sf-group-title">{n.string}<Badges n={n} /></div>}
        {!n.string && n.invisible && <Badges n={n} />}
        {columns ? <div className="sf-columns" style={{ gridTemplateColumns: `repeat(${n.children.length}, 1fr)` }}>
          {n.children.map((c) => <Fragment key={c.id}>{node(c, true)}</Fragment>)}</div>
          : list(n.children, n.id, true)}
      </div>;
    }
    const active = n.pages.find((p) => p.id === pages[n.id]) ?? n.pages[0];
    return <div {...selectable(n.id, " sf-notebook")} aria-label="Tabs">
      <div className="sf-tabs" role="tablist">
        {n.pages.map((p) => <button key={p.id} role="tab" aria-selected={p.id === active?.id}
          className={`sf-tab${p.id === active?.id ? " active" : ""}${sel?.kind === "node" && sel.id === p.id ? " selected" : ""}`}
          onClick={(e) => { e.stopPropagation(); setPages({ ...pages, [n.id]: p.id }); setSel({ kind: "node", id: p.id }); }}>{p.string || "Page"}<Badges n={p} /></button>)}
        <button className="sf-tab add" title="Add a tab" aria-label="Add a tab" onClick={(e) => {
          e.stopPropagation();
          const p = pageNode(`Tab ${n.pages.length + 1}`);
          setArch({ ...arch, body: updateNode(arch.body, n.id, { pages: [...n.pages, p] }) });
          setPages({ ...pages, [n.id]: p.id }); setSel({ kind: "node", id: p.id });
        }}>+</button>
      </div>
      {active && <div className="sf-page">{list(active.children, active.id, false)}</div>}
    </div>;
  };

  const status = fieldById(model, arch.statusbarFieldId), title = fieldById(model, arch.titleFieldId);
  const x2many = model.fields.filter((f) => f.ttype === "one2many" || f.ttype === "many2many");

  return <div className={`st-designer${dragging ? " dragging" : ""}`}>
    <Palette model={model} shown={shown} onDragStart={startDrag} onDragEnd={endDrag} onAdd={(d) => { const [c, i] = clickTarget(); drop(d, c, i); }} />

    <div className="sf-canvas" onClick={() => setSel(null)}>
      <div className="sf-form">
        <div className="sf-header">
          <div className="sf-buttons">
            {arch.buttons.map((b) => <button key={b.id} className={`sf-btn${b.primary ? " primary" : ""}${sel?.kind === "button" && sel.id === b.id ? " selected" : ""}`}
              onClick={(e) => { e.stopPropagation(); setSel({ kind: "button", id: b.id }); }}>{b.string}<Badges n={b} /></button>)}
            <button className="sf-add" onClick={(e) => {
              e.stopPropagation();
              const b = buttonNode({ string: "New button", method: uniqueMethod(arch.buttons, "action_new"), primary: !arch.buttons.length });
              setArch({ ...arch, buttons: [...arch.buttons, b] }); setSel({ kind: "button", id: b.id });
            }}>+ Button</button>
          </div>
          <button className={`sf-status${sel?.kind === "status" ? " selected" : ""}`} onClick={(e) => { e.stopPropagation(); setSel({ kind: "status" }); }}
            title="Status bar">{status ? status.selection.map(([k, l], i) => <span key={k} className={i === 0 ? "current" : ""}>{l}</span>) : <span className="none">+ Status bar</span>}</button>
        </div>
        <div className="sf-sheet">
          <div className="sf-button-box">
            {arch.smartButtons.map((s) => { const f = fieldById(model, s.fieldId);
              return <button key={s.id} className={`sf-smart${sel?.kind === "smart" && sel.id === s.id ? " selected" : ""}`} onClick={(e) => { e.stopPropagation(); setSel({ kind: "smart", id: s.id }); }}>
                <i aria-hidden="true">{iconGlyph(s.icon)}</i><span><b>3</b> {s.string || f?.string || "Records"}</span></button>; })}
            {x2many.length > 0 && <button className="sf-add" title="A smart button counts and opens related records" onClick={(e) => {
              e.stopPropagation();
              const f = x2many.find((x) => !arch.smartButtons.some((s) => s.fieldId === x.id)) ?? x2many[0];
              const s: SmartButton = { id: newId(), string: f.string || titleCase(f.name), icon: "fa-list", fieldId: f.id };
              setArch({ ...arch, smartButtons: [...arch.smartButtons, s] }); setSel({ kind: "smart", id: s.id });
            }}>+ Smart button</button>}
          </div>
          <div className={`sf-title${sel?.kind === "title" ? " selected" : ""}`} onClick={(e) => { e.stopPropagation(); setSel({ kind: "title" }); }}>
            {title ? <h1>{title.string || titleCase(title.name)}</h1> : <span className="none">+ Title field</span>}
          </div>
          {list(arch.body, BODY, false)}
        </div>
        {model.chatter && <div className="sf-chatter">Send message · Log note · Activities<small>Chatter: messages, followers and tracked changes</small></div>}
      </div>
    </div>

    <aside className="st-props" aria-label="Properties">
      {renderProps()}
    </aside>
  </div>;

  function renderProps(): ReactNode {
    const header = (text: string, remove?: () => void) => <div className="st-props-head"><h3>{text}</h3>
      {remove && <button className="btn ghost small danger-text" onClick={() => { remove(); setSel(null); }}>Remove</button>}</div>;
    if (sel?.kind === "status") return <>{header("Status bar")}
      <Prop label="Field" hint="A selection field, shown as steps in the header. Only the buttons move a record between steps.">
        <select value={arch.statusbarFieldId} onChange={(e) => setArch({ ...arch, statusbarFieldId: e.target.value })}>
          <option value="">None</option>{model.fields.filter((f) => f.ttype === "selection").map((f) => <option key={f.id} value={f.id}>{f.string || f.name}</option>)}</select>
      </Prop>
      {!model.fields.some((f) => f.ttype === "selection") && <button className="btn ghost small" onClick={() => {
        const f = newField({ name: model.fields.some((x) => x.name === "state") ? "stage" : "state", string: "Status", ttype: "selection", default: "draft",
          selection: [["draft", "Draft"], ["confirmed", "Confirmed"], ["done", "Done"]] });
        setArch({ ...arch, statusbarFieldId: f.id }, addField(app, model.id, f));
      }}>Add a Status field</button>}</>;
    if (sel?.kind === "title") return <>{header("Title")}
      <Prop label="Field" hint="Shown large at the top of the sheet, usually the name.">
        <select value={arch.titleFieldId} onChange={(e) => setArch({ ...arch, titleFieldId: e.target.value })}>
          <option value="">None</option>{model.fields.filter((f) => f.ttype === "char").map((f) => <option key={f.id} value={f.id}>{f.string || f.name}</option>)}</select>
      </Prop></>;
    if (sel?.kind === "button") {
      const b = arch.buttons.find((x) => x.id === sel.id);
      if (!b) return null;
      const set = (patch: Partial<ButtonNode>) => setArch({ ...arch, buttons: arch.buttons.map((x) => (x.id === b.id ? { ...x, ...patch } : x)) });
      const target = b.setField ? fieldById(model, b.setField.fieldId) : undefined;
      const i = arch.buttons.indexOf(b);
      return <>{header("Button", () => setArch({ ...arch, buttons: arch.buttons.filter((x) => x.id !== b.id) }))}
        <Prop label="Label"><CommitInput value={b.string} onCommit={(string) => set({ string })} /></Prop>
        <Prop label="Method name" hint="The Python method the button calls."><CommitInput value={b.method} onCommit={(method) => set({ method: method.trim() })} /></Prop>
        <Check label="Highlighted (primary)" checked={b.primary} onChange={(primary) => set({ primary })} />
        <fieldset className="st-modifier"><legend>When clicked</legend>
          <select value={b.setField ? "set" : "code"} onChange={(e) => set({ setField: e.target.value === "set" ? { fieldId: arch.statusbarFieldId || model.fields[0]?.id || "", value: "" } : null })}>
            <option value="set">Set a field</option><option value="code">Run Python (write the method yourself)</option></select>
          {b.setField && <div className="st-row">
            <select aria-label="Field to set" value={b.setField.fieldId} onChange={(e) => set({ setField: { fieldId: e.target.value, value: "" } })}>
              {model.fields.filter((f) => !["one2many", "many2many", "binary", "image"].includes(f.ttype)).map((f) => <option key={f.id} value={f.id}>{f.string || f.name}</option>)}</select>
            {target?.ttype === "selection"
              ? <select aria-label="Value" value={b.setField.value} onChange={(e) => set({ setField: { ...b.setField!, value: e.target.value } })}>
                <option value="">Choose…</option>{target.selection.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              : <CommitInput aria-label="Value" value={b.setField.value} placeholder={target?.ttype === "many2one" ? "user" : target?.ttype === "date" ? "today" : "value"}
                onCommit={(value) => set({ setField: { ...b.setField!, value } })} />}
          </div>}
        </fieldset>
        <Prop label="Ask to confirm" hint="Leave empty to run at once."><CommitInput value={b.confirm} placeholder="Are you sure?" onCommit={(confirm) => set({ confirm })} /></Prop>
        <ModifierEditor label="Invisible" value={b.invisible} fields={model.fields} onChange={(invisible) => set({ invisible })} />
        <div className="st-move">
          <button className="btn ghost small" disabled={i === 0} onClick={() => { const next = arch.buttons.slice(); next.splice(i - 1, 0, next.splice(i, 1)[0]); setArch({ ...arch, buttons: next }); }}>← Move left</button>
          <button className="btn ghost small" disabled={i === arch.buttons.length - 1} onClick={() => { const next = arch.buttons.slice(); next.splice(i + 1, 0, next.splice(i, 1)[0]); setArch({ ...arch, buttons: next }); }}>Move right →</button>
        </div></>;
    }
    if (sel?.kind === "smart") {
      const s = arch.smartButtons.find((x) => x.id === sel.id);
      if (!s) return null;
      const set = (patch: Partial<SmartButton>) => setArch({ ...arch, smartButtons: arch.smartButtons.map((x) => (x.id === s.id ? { ...x, ...patch } : x)) });
      return <>{header("Smart button", () => setArch({ ...arch, smartButtons: arch.smartButtons.filter((x) => x.id !== s.id) }))}
        <Prop label="Opens the records of"><select value={s.fieldId} onChange={(e) => set({ fieldId: e.target.value })}>
          {x2many.map((f) => <option key={f.id} value={f.id}>{f.string || f.name} ({f.comodel})</option>)}</select></Prop>
        <Prop label="Label"><CommitInput value={s.string} onCommit={(string) => set({ string })} /></Prop>
        <Prop label="Icon"><div className="st-icons">{SMART_ICONS.map((icon) => <button key={icon} className={`pill-btn${s.icon === icon ? " active" : ""}`} title={icon}
          aria-pressed={s.icon === icon} onClick={() => set({ icon })}>{iconGlyph(icon)}</button>)}</div></Prop>
        <p className="hint">vdoo writes the count field and the method that opens the records.</p></>;
    }
    if (!selectedNode) return <>{header("Form")}
      <p className="hint">Drag fields and components from the left onto the form, or click one to add it at the end (or into the selected group or tab).
        Click anything on the form to change it; press Delete to remove it.</p>
      <Check label="Chatter (messages, followers, tracking)" checked={model.chatter} onChange={(chatter) => onApp(replaceModel(app, { ...model, chatter }))} />
      <button className="btn ghost small" onClick={() => {
        if (!window.confirm("Replace this form with the default layout?")) return;
        const d = defaultForm(model);
        setArch({ ...arch, body: d.body, titleFieldId: d.titleFieldId, statusbarFieldId: d.statusbarFieldId });
      }}>Reset to the default layout</button></>;

    const setNode = (patch: Partial<FormNode> | Partial<PageNode>) => setArch({ ...arch, body: updateNode(arch.body, selectedNode.id, patch) });
    const remove = () => setArch({ ...arch, body: removeNode(arch.body, selectedNode.id) });
    const move = <Mover body={arch.body} id={selectedNode.id} onMove={(body) => setArch({ ...arch, body })} />;
    if (selectedNode.kind === "field") {
      const n = selectedNode as FieldNode, f = fieldById(model, n.fieldId);
      return <>{header(f ? f.string || f.name : "Field", remove)}
        {f && <p className="hint"><code>{f.name}</code> · {f.ttype}{f.comodel ? ` → ${f.comodel}` : ""}</p>}
        <h4>On this form</h4>
        <Prop label="Label"><CommitInput value={n.string} placeholder={f?.string} onCommit={(string) => setNode({ string })} /></Prop>
        <Prop label="Widget"><select value={n.widget} onChange={(e) => setNode({ widget: e.target.value })}>
          <option value="">Default</option>{(f ? WIDGETS[f.ttype] ?? [] : []).map((w) => <option key={w} value={w}>{w}</option>)}</select></Prop>
        {f && ["char", "text", "integer", "float", "many2one", "date"].includes(f.ttype) &&
          <Prop label="Placeholder"><CommitInput value={n.placeholder} onCommit={(placeholder) => setNode({ placeholder })} /></Prop>}
        <Check label="Hide the label" checked={n.nolabel} onChange={(nolabel) => setNode({ nolabel })} />
        <ModifierEditor label="Invisible" value={n.invisible} fields={model.fields} onChange={(invisible) => setNode({ invisible })} />
        <ModifierEditor label="Required" value={n.required} fields={model.fields} onChange={(required) => setNode({ required })} />
        <ModifierEditor label="Read-only" value={n.readonly} fields={model.fields} onChange={(readonly) => setNode({ readonly })} />
        {move}
        {f && <><h4>Field (everywhere)</h4>
          <FieldProps app={app} model={model} field={f} onChange={(field) => onApp(replaceField(app, model.id, field))} />
          <button className="btn ghost small danger-text" onClick={() => {
            if (window.confirm(`Delete the field ${f.name} from the model and every view?`)) { onApp(removeField(app, model.id, f.id)); setSel(null); }
          }}>Delete the field</button></>}</>;
    }
    if (selectedNode.kind === "group") return <>{header("Group", remove)}
      <Prop label="Title"><CommitInput value={selectedNode.string} placeholder="No title" onCommit={(string) => setNode({ string })} /></Prop>
      <ModifierEditor label="Invisible" value={selectedNode.invisible} fields={model.fields} onChange={(invisible) => setNode({ invisible })} />
      <button className="btn ghost small" onClick={() => setNode({ children: [...selectedNode.children, groupNode()] })}>+ Add a column</button>
      {move}
      {selectedNode.children.length > 0 && <p className="hint">Removing the group removes what is inside it from the form (the fields stay on the model).</p>}</>;
    if (selectedNode.kind === "page") return <>{header("Tab", remove)}
      <Prop label="Title"><CommitInput value={selectedNode.string} onCommit={(string) => setNode({ string })} /></Prop>
      <ModifierEditor label="Invisible" value={selectedNode.invisible} fields={model.fields} onChange={(invisible) => setNode({ invisible })} /></>;
    if (selectedNode.kind === "notebook") return <>{header("Tabs", remove)}
      <ul className="st-plain">{selectedNode.pages.map((p) => <li key={p.id}><button className="link" onClick={() => { setPages({ ...pages, [selectedNode.id]: p.id }); setSel({ kind: "node", id: p.id }); }}>{p.string}</button></li>)}</ul>
      {move}</>;
    return <>{header("Separator", remove)}
      <Prop label="Title"><CommitInput value={selectedNode.string} onCommit={(string) => setNode({ string })} /></Prop>{move}</>;
  }
}

/** A place to drop between elements; it shows only while something is being dragged. */
function Slot({ empty, canDrop, onDrop }: { empty: boolean; canDrop: () => boolean; onDrop: () => void }) {
  const [over, setOver] = useState(false);
  return <div className={`sf-slot${over ? " over" : ""}${empty ? " empty" : ""}`}
    onDragOver={(e) => { if (canDrop()) { e.preventDefault(); e.stopPropagation(); setOver(true); } }} onDragLeave={() => setOver(false)}
    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); onDrop(); }}>
    {empty && !over && <span>Drop fields here</span>}</div>;
}

function uniqueMethod(buttons: ButtonNode[], base: string) {
  let name = base, n = 1;
  while (buttons.some((b) => b.method === name)) name = `${base}_${++n}`;
  return name;
}

/** Up / down within the node's container. */
function Mover({ body, id, onMove }: { body: FormNode[]; id: string; onMove: (body: FormNode[]) => void }) {
  const c = containers(body).find((x) => x.children.some((n) => n.id === id));
  if (!c) return null;
  const i = c.children.findIndex((n) => n.id === id);
  return <div className="st-move">
    <button className="btn ghost small" disabled={i === 0} onClick={() => onMove(moveNode(body, id, c.id, i - 1))}>↑ Move up</button>
    <button className="btn ghost small" disabled={i === c.children.length - 1} onClick={() => onMove(moveNode(body, id, c.id, i + 2))}>↓ Move down</button>
  </div>;
}

const Badges = ({ n }: { n: { invisible?: string; required?: string; readonly?: string } }) => {
  const b = modifierBadges(n);
  return b.length ? <span className="sf-badges">{b.map((x) => <span key={x.key} className={`sf-badge ${x.key}`} title={x.title}>{x.label}</span>)}</span> : null;
};

const GLYPHS: Record<string, string> = { "fa-list": "☰", "fa-tasks": "✓", "fa-file-text-o": "🗎", "fa-users": "👥", "fa-shopping-cart": "🛒", "fa-truck": "🚚",
  "fa-money": "💵", "fa-calendar": "📅", "fa-check-square-o": "☑", "fa-star": "★" };
export const iconGlyph = (icon: string) => GLYPHS[icon] ?? "☰";

function Palette({ model, shown, onDragStart, onDragEnd, onAdd }: { model: OdooModel; shown: Set<string>;
  onDragStart: (e: React.DragEvent, d: Drag) => void; onDragEnd: () => void; onAdd: (d: Drag) => void }) {
  const item = (key: string, d: Drag, icon: string, label: string, title?: string) =>
    <button key={key} className="st-chip" draggable title={title ?? `Drag onto the form, or click to add ${label}`}
      onDragStart={(e) => onDragStart(e, d)} onDragEnd={onDragEnd} onClick={() => onAdd(d)}><span className="st-chip-icon" aria-hidden="true">{icon}</span>{label}</button>;
  const unused = model.fields.filter((f) => !shown.has(f.id));
  return <aside className="st-palette" aria-label="Add to the form">
    <h3>Components</h3>
    {item("columns", { kind: "component", c: "columns" }, "▥", "Two columns")}
    {item("group", { kind: "component", c: "group" }, "▭", "Group")}
    {item("notebook", { kind: "component", c: "notebook" }, "⊟", "Tabs")}
    {item("separator", { kind: "component", c: "separator" }, "—", "Separator")}
    <h3>New fields</h3>
    {TTYPES.map((t) => item(t.type, { kind: "new", ttype: t.type }, t.icon, t.label))}
    <h3>Existing fields</h3>
    {unused.length ? unused.map((f) => item(f.id, { kind: "field", fieldId: f.id }, TTYPES.find((t) => t.type === f.ttype)?.icon ?? "·", f.string || f.name, f.name))
      : <p className="hint">Every field is on the form.</p>}
  </aside>;
}
