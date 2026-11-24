import { useRef, useState } from "react";
import {
  type Decoration, type ListArch, type ListColumn, type OdooApp, type OdooModel, type OdooView, type TType,
  DECORATIONS, TTYPES, addField, defaultList, fieldById, isNumeric, listColumn, removeField, replaceField, replaceView, titleCase,
} from "../odoo/studioModel";
import { Check, CommitInput, ModifierEditor, Prop, modifierBadges } from "./controls";
import { FieldProps, WIDGETS } from "./FieldProps";
import { paletteField } from "./FormDesigner";
import { sampleValue } from "./preview";

type ListView = Extract<OdooView, { type: "list" }>;
type Drag = { kind: "new"; ttype: TType } | { kind: "field"; fieldId: string } | { kind: "move"; id: string };

const DECORATION_LABEL: Record<Decoration, string> = { danger: "Red", warning: "Orange", success: "Green", info: "Blue", muted: "Grey", bf: "Bold" };
const LIST_WIDGETS: Partial<Record<TType, string[]>> = { selection: ["badge"], many2one: ["many2one_avatar_user", "badge"], integer: ["handle", "progressbar"],
  float: ["progressbar", "float_time"], many2many: ["many2many_tags"], boolean: ["boolean_toggle"], date: ["remaining_days"], datetime: ["remaining_days"] };

export function ListDesigner({ app, model, view, onApp }: { app: OdooApp; model: OdooModel; view: ListView; onApp: (app: OdooApp) => void }) {
  const arch = view.arch;
  const [sel, setSel] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const setArch = (next: ListArch, base = app) => onApp(replaceView(base, { ...view, arch: next }));
  const col = arch.columns.find((c) => c.id === sel);
  const shown = new Set(arch.columns.map((c) => c.fieldId));

  const insert = (d: Drag, index: number) => {
    const cols = arch.columns.slice();
    if (d.kind === "move") {
      const from = cols.findIndex((c) => c.id === d.id);
      if (from < 0) return;
      const [c] = cols.splice(from, 1);
      cols.splice(from < index ? index - 1 : index, 0, c);
      setArch({ ...arch, columns: cols });
      return;
    }
    let base = app, fieldId: string;
    if (d.kind === "new") { const f = paletteField(app, model, d.ttype); base = addField(app, model.id, f); fieldId = f.id; }
    else fieldId = d.fieldId;
    const c = listColumn(fieldId);
    cols.splice(index, 0, c);
    setArch({ ...arch, columns: cols }, base);
    setSel(c.id);
  };
  const dropAt = (index: number) => ({
    onDragOver: (e: React.DragEvent) => { if (drag.current) { e.preventDefault(); setOver(index); } },
    onDragLeave: () => setOver(null),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(null); const d = drag.current; drag.current = null; if (d) insert(d, index); },
  });
  const start = (e: React.DragEvent, d: Drag) => { drag.current = d; e.dataTransfer.setData("text/plain", d.kind); e.dataTransfer.effectAllowed = d.kind === "move" ? "move" : "copy"; };
  const cols = arch.columns.map((c) => ({ c, f: fieldById(model, c.fieldId) }));

  const chip = (key: string, d: Drag, icon: string, label: string, title?: string) =>
    <button key={key} className="st-chip" draggable title={title ?? `Drag onto the list, or click to add ${label}`} onDragStart={(e) => start(e, d)}
      onDragEnd={() => { drag.current = null; setOver(null); }} onClick={() => insert(d, arch.columns.length)}>
      <span className="st-chip-icon" aria-hidden="true">{icon}</span>{label}</button>;

  return <div className="st-designer">
    <aside className="st-palette" aria-label="Add to the list">
      <h3>Existing fields</h3>
      {model.fields.filter((f) => !shown.has(f.id)).map((f) => chip(f.id, { kind: "field", fieldId: f.id }, TTYPES.find((t) => t.type === f.ttype)?.icon ?? "·", f.string || f.name, f.name))}
      {model.fields.every((f) => shown.has(f.id)) && <p className="hint">Every field is in the list.</p>}
      <h3>New fields</h3>
      {TTYPES.filter((t) => t.type !== "one2many" && t.type !== "html").map((t) => chip(t.type, { kind: "new", ttype: t.type }, t.icon, t.label))}
    </aside>

    <div className="sf-canvas" onClick={() => setSel(null)}>
      <div className="sl-list">
        <div className="sl-bar"><span className="sf-btn primary">New</span><span className="sl-title">{model.description}</span>
          {arch.editable && <span className="sl-note">Editable: new lines are added at the {arch.editable}</span>}</div>
        <table className="sl-table">
          <thead><tr>
            <th className="sl-check"><span className="fw-check" /></th>
            {cols.map(({ c, f }, i) => <th key={c.id} draggable className={`${sel === c.id ? "selected" : ""}${over === i ? " over" : ""}${c.optional === "hide" ? " optional-hidden" : ""}`}
              tabIndex={0} onDragStart={(e) => start(e, { kind: "move", id: c.id })} {...dropAt(i)}
              onClick={(e) => { e.stopPropagation(); setSel(c.id); }} onKeyDown={(e) => { if (e.key === "Enter") setSel(c.id); }}
              title={c.optional === "hide" ? "Optional, hidden by default" : undefined}>
              {c.string || f?.string || (f ? titleCase(f.name) : "Missing")}
              {modifierBadges(c).map((b) => <span key={b.key} className={`sf-badge ${b.key}`} title={b.title}>{b.label}</span>)}
              {c.optional && <span className="sl-opt" title={`Optional (${c.optional === "show" ? "shown" : "hidden"} by default)`}>⋮</span>}
            </th>)}
            <th className={`sl-end${over === arch.columns.length ? " over" : ""}`} {...dropAt(arch.columns.length)}>{arch.columns.length ? "" : "Drop fields here"}</th>
          </tr></thead>
          <tbody>
            {[0, 1, 2].map((row) => <tr key={row} className={decorationClass(arch, row)}>
              <td className="sl-check"><span className="fw-check" /></td>
              {cols.map(({ c, f }) => <td key={c.id} className={`${sel === c.id ? "selected" : ""}${f && isNumeric(f.ttype) ? " num" : ""}`}>
                {f ? (c.widget === "badge" ? <span className="fw-badge">{sampleValue(f, row)}</span> : sampleValue(f, row)) : ""}</td>)}
              <td />
            </tr>)}
            {arch.editable && <tr><td /><td colSpan={cols.length + 1} className="sl-add">Add a line</td></tr>}
            {cols.some(({ c }) => c.sum) && <tr className="sl-sum"><td />{cols.map(({ c, f }) => <td key={c.id} className="num">{c.sum && f ? (f.ttype === "monetary" ? "$ 1,802.50" : "22") : ""}</td>)}<td /></tr>}
          </tbody>
        </table>
      </div>
    </div>

    <aside className="st-props" aria-label="Properties">
      {col ? columnProps() : <>
        <div className="st-props-head"><h3>List</h3></div>
        <Prop label="Editing" hint="Editable lists let people change records right in the list, like a spreadsheet.">
          <select value={arch.editable} onChange={(e) => setArch({ ...arch, editable: e.target.value as ListArch["editable"] })}>
            <option value="">Read-only list (open a record to edit)</option><option value="bottom">Editable, new lines at the bottom</option><option value="top">Editable, new lines at the top</option>
          </select></Prop>
        <h4>Row colours</h4>
        <p className="hint">Colour a row when its record matches a condition.</p>
        {DECORATIONS.map((d) => <ModifierEditor key={d} label={DECORATION_LABEL[d]} allowAlways={false} value={arch.decorations[d] ?? ""} fields={model.fields}
          onChange={(expr) => setArch({ ...arch, decorations: { ...arch.decorations, [d]: expr } })} />)}
        <button className="btn ghost small" onClick={() => { if (window.confirm("Replace this list with the default columns?")) setArch({ ...defaultList(model), editable: arch.editable }); }}>Reset to the default columns</button>
      </>}
    </aside>
  </div>;

  function columnProps() {
    const c = col!, f = fieldById(model, c.fieldId);
    const set = (patch: Partial<ListColumn>) => setArch({ ...arch, columns: arch.columns.map((x) => (x.id === c.id ? { ...x, ...patch } : x)) });
    const i = arch.columns.indexOf(c);
    const move = (by: number) => { const next = arch.columns.slice(); next.splice(i + by, 0, next.splice(i, 1)[0]); setArch({ ...arch, columns: next }); };
    return <>
      <div className="st-props-head"><h3>{f ? f.string || f.name : "Column"}</h3>
        <button className="btn ghost small danger-text" onClick={() => { setArch({ ...arch, columns: arch.columns.filter((x) => x.id !== c.id) }); setSel(null); }}>Remove</button></div>
      {f && <p className="hint"><code>{f.name}</code> · {f.ttype}</p>}
      <h4>In this list</h4>
      <Prop label="Label"><CommitInput value={c.string} placeholder={f?.string} onCommit={(string) => set({ string })} /></Prop>
      <Prop label="Widget"><select value={c.widget} onChange={(e) => set({ widget: e.target.value })}>
        <option value="">Default</option>{(f ? [...new Set([...(LIST_WIDGETS[f.ttype] ?? []), ...(WIDGETS[f.ttype] ?? [])])] : []).map((w) => <option key={w} value={w}>{w}</option>)}</select></Prop>
      <Prop label="Optional column" hint="People can show or hide optional columns from the list's menu.">
        <select value={c.optional} onChange={(e) => set({ optional: e.target.value as ListColumn["optional"] })}>
          <option value="">Always shown</option><option value="show">Optional, shown by default</option><option value="hide">Optional, hidden by default</option></select></Prop>
      {f && isNumeric(f.ttype) && <Check label="Show the total" checked={c.sum} onChange={(sum) => set({ sum })} />}
      <ModifierEditor label="Invisible (cell)" value={c.invisible} fields={model.fields} onChange={(invisible) => set({ invisible })} />
      {arch.editable && <ModifierEditor label="Required" value={c.required} fields={model.fields} onChange={(required) => set({ required })} />}
      {arch.editable && <ModifierEditor label="Read-only" value={c.readonly} fields={model.fields} onChange={(readonly) => set({ readonly })} />}
      <div className="st-move">
        <button className="btn ghost small" disabled={i === 0} onClick={() => move(-1)}>← Move left</button>
        <button className="btn ghost small" disabled={i === arch.columns.length - 1} onClick={() => move(1)}>Move right →</button>
      </div>
      {f && <><h4>Field (everywhere)</h4>
        <FieldProps app={app} model={model} field={f} onChange={(field) => onApp(replaceField(app, model.id, field))} />
        <button className="btn ghost small danger-text" onClick={() => { if (window.confirm(`Delete the field ${f.name} from the model and every view?`)) { onApp(removeField(app, model.id, f.id)); setSel(null); } }}>Delete the field</button></>}
    </>;
  }
}

/** The preview colours rows as if the sample records matched the decorations in order. */
function decorationClass(arch: ListArch, row: number) {
  const set = DECORATIONS.filter((d) => arch.decorations[d]?.trim());
  return set.length ? `deco-${set[row % set.length]}` : "";
}
