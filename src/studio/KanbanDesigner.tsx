// The kanban designer: columns by a selection or many2one, cards with a title, field lines, tags, priority and assignee.
import { useRef, useState } from "react";
import {
  type KanbanArch, type KanbanCardField, type OdooView, type TType, TTYPES, addField, defaultKanban, fieldById, kanbanCardField, removeField, replaceField, replaceView,
} from "../odoo/studioModel";
import { Check } from "./controls";
import { FieldProps, WIDGETS } from "./FieldProps";
import { paletteField } from "./FormDesigner";
import { sampleValue } from "./preview";
import { FieldSelect, type ModelProps, ViewHead, labelOf, sampleGroups } from "./viewKit";

type KanbanView = Extract<OdooView, { type: "kanban" }>;
type Drag = { kind: "new"; ttype: TType } | { kind: "field"; fieldId: string };
const CARD_TYPES = new Set<TType>(["char", "text", "integer", "float", "monetary", "boolean", "date", "datetime", "selection", "many2one"]);

export function KanbanDesigner({ app, model, view, onApp }: ModelProps<KanbanView>) {
  const arch = view.arch;
  const [sel, setSel] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const drag = useRef<Drag | null>(null);
  const setArch = (next: KanbanArch, base = app) => onApp(replaceView(base, { ...view, arch: next }));
  const field = (id: string) => fieldById(model, id);
  const group = field(arch.groupByFieldId), title = field(arch.titleFieldId), tags = field(arch.tagsFieldId);
  const avatar = field(arch.avatarFieldId), priority = field(arch.priorityFieldId);
  const used = new Set([arch.titleFieldId, arch.tagsFieldId, arch.avatarFieldId, arch.priorityFieldId, ...arch.cardFields.map((c) => c.fieldId)]);
  const card = arch.cardFields.find((c) => c.id === sel);

  const add = (d: Drag) => {
    let base = app, fieldId: string;
    if (d.kind === "new") { const f = paletteField(app, model, d.ttype); base = addField(app, model.id, f); fieldId = f.id; }
    else fieldId = d.fieldId;
    const c = kanbanCardField(fieldId);
    setArch({ ...arch, cardFields: [...arch.cardFields, c] }, base);
    setSel(c.id);
  };
  const chip = (key: string, d: Drag, icon: string, label: string, title?: string) =>
    <button key={key} className="st-chip" draggable title={title ?? `Drag onto a card, or click to add ${label}`}
      onDragStart={(e) => { drag.current = d; e.dataTransfer.setData("text/plain", d.kind); e.dataTransfer.effectAllowed = "copy"; }}
      onDragEnd={() => { drag.current = null; setOver(false); }} onClick={() => add(d)}>
      <span className="st-chip-icon" aria-hidden="true">{icon}</span>{label}</button>;
  const drop = {
    onDragOver: (e: React.DragEvent) => { if (drag.current) { e.preventDefault(); setOver(true); } },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(false); const d = drag.current; drag.current = null; if (d) add(d); },
  };
  const columns = group ? sampleGroups(group) : ["All records"];
  const icon = (t: TType) => TTYPES.find((x) => x.type === t)?.icon ?? "·";

  return <div className="st-designer">
    <aside className="st-palette" aria-label="Add to the card">
      <h3>Existing fields</h3>
      {model.fields.filter((f) => CARD_TYPES.has(f.ttype) && !used.has(f.id)).map((f) => chip(f.id, { kind: "field", fieldId: f.id }, icon(f.ttype), labelOf(f), f.name))}
      <h3>New fields</h3>
      {TTYPES.filter((t) => CARD_TYPES.has(t.type)).map((t) => chip(t.type, { kind: "new", ttype: t.type }, t.icon, t.label))}
    </aside>

    <div className="sf-canvas" onClick={() => setSel(null)}>
      <div className="sk-board">
        {columns.map((name, col) => <div key={name} className="sk-column">
          <div className="sk-column-head"><b>{name}</b><small>{col === 0 ? 2 : 1}</small>{arch.quickCreate && <span className="sk-quick" title="Quick create">+</span>}</div>
          {(col === 0 ? [0, 1] : [col + 1]).map((row) =>
            <div key={row} className={`sk-card${over && row === 0 ? " over" : ""}`} {...(row === 0 ? drop : {})}>
              {title ? <b className="sk-title">{sampleValue(title, row)}</b> : <span className="sk-title none">Choose a card title</span>}
              {arch.cardFields.map((c) => { const f = field(c.fieldId); return f &&
                <button key={c.id} className={`sk-line${sel === c.id ? " selected" : ""}`} onClick={(e) => { e.stopPropagation(); setSel(c.id); }}>
                  {sampleValue(f, row)}</button>; })}
              {tags && <span className="sk-tags"><i>Tag A</i><i>Tag B</i></span>}
              {(priority || avatar) && <span className="sk-footer">
                {priority && <span className="fw-stars">{row % 2 ? "★☆" : "☆☆"}</span>}
                {avatar && <span className="sk-avatar" title={labelOf(avatar)}>{["MA", "MD", "JW"][row % 3]}</span>}</span>}
            </div>)}
        </div>)}
        {group && arch.expandGroups && <p className="sk-note hint">Every column is shown, even when it has no records.</p>}
      </div>
    </div>

    <aside className="st-props" aria-label="Properties">
      {card ? cardProps(card) : <ViewHead app={app} view={view} onApp={onApp}>
        <FieldSelect label="Columns (group by)" value={arch.groupByFieldId} fields={model.fields} none="No columns"
          filter={(f) => f.ttype === "selection" || f.ttype === "many2one"} hint="A selection or many2one field. Dragging a card to another column changes it."
          onChange={(id) => setArch({ ...arch, groupByFieldId: id, expandGroups: !!id && arch.expandGroups })} />
        <Check label="Show every column, even empty ones" checked={arch.expandGroups} disabled={!group} onChange={(expandGroups) => setArch({ ...arch, expandGroups })} />
        <Check label="Quick create in a column" checked={arch.quickCreate} onChange={(quickCreate) => setArch({ ...arch, quickCreate })} />
        <h4>Card</h4>
        <FieldSelect label="Title" value={arch.titleFieldId} fields={model.fields} none="Choose a field" filter={(f) => CARD_TYPES.has(f.ttype)}
          onChange={(titleFieldId) => setArch({ ...arch, titleFieldId })} />
        <FieldSelect label="Tags" value={arch.tagsFieldId} fields={model.fields} filter={(f) => f.ttype === "many2many"} onChange={(tagsFieldId) => setArch({ ...arch, tagsFieldId })} />
        <FieldSelect label="Priority stars" value={arch.priorityFieldId} fields={model.fields} filter={(f) => f.ttype === "selection"}
          onChange={(priorityFieldId) => setArch({ ...arch, priorityFieldId })} />
        <FieldSelect label="Assignee avatar" value={arch.avatarFieldId} fields={model.fields} filter={(f) => f.ttype === "many2one" && f.comodel === "res.users"}
          hint="A many2one to res.users." onChange={(avatarFieldId) => setArch({ ...arch, avatarFieldId })} />
        <p className="hint">Add more lines to the card from the left; click a line to change or remove it.</p>
        <button className="btn ghost small" onClick={() => { if (window.confirm("Replace this kanban with the default layout?")) setArch(defaultKanban(model)); }}>Reset to the default layout</button>
      </ViewHead>}
    </aside>
  </div>;

  function cardProps(c: KanbanCardField) {
    const f = field(c.fieldId), i = arch.cardFields.indexOf(c);
    const set = (patch: Partial<KanbanCardField>) => setArch({ ...arch, cardFields: arch.cardFields.map((x) => (x.id === c.id ? { ...x, ...patch } : x)) });
    const move = (by: number) => { const next = arch.cardFields.slice(); next.splice(i + by, 0, next.splice(i, 1)[0]); setArch({ ...arch, cardFields: next }); };
    return <>
      <div className="st-props-head"><h3>{f ? labelOf(f) : "Card line"}</h3>
        <button className="btn ghost small danger-text" onClick={() => { setArch({ ...arch, cardFields: arch.cardFields.filter((x) => x.id !== c.id) }); setSel(null); }}>Remove</button></div>
      {f && <p className="hint"><code>{f.name}</code> · {f.ttype}</p>}
      <label className="st-prop"><span>Widget</span><select value={c.widget} onChange={(e) => set({ widget: e.target.value })}>
        <option value="">Default</option>{(f ? WIDGETS[f.ttype] ?? [] : []).map((w) => <option key={w} value={w}>{w}</option>)}</select></label>
      <div className="st-move">
        <button className="btn ghost small" disabled={i === 0} onClick={() => move(-1)}>↑ Move up</button>
        <button className="btn ghost small" disabled={i === arch.cardFields.length - 1} onClick={() => move(1)}>↓ Move down</button>
      </div>
      {f && <><h4>Field (everywhere)</h4>
        <FieldProps app={app} model={model} field={f} onChange={(next) => onApp(replaceField(app, model.id, next))} />
        <button className="btn ghost small danger-text" onClick={() => { if (window.confirm(`Delete the field ${f.name} from the model and every view?`)) { onApp(removeField(app, model.id, f.id)); setSel(null); } }}>Delete the field</button></>}
    </>;
  }
}
