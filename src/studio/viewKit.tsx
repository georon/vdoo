// Small pieces shared by the kanban, calendar, pivot, graph and search designers: choosing one field, an ordered list of
// fields, and the properties panel's heading with "Remove this view".
import type { ReactNode } from "react";
import { type OdooApp, type OdooField, type OdooModel, type OdooView, removeView, titleCase, viewLabel } from "../odoo/studioModel";
import { Prop } from "./controls";

export const labelOf = (f: OdooField | undefined) => (f ? f.string || titleCase(f.name) : "");

/** A select of the model's fields that pass `filter`. A chosen field that no longer passes stays listed, so it can be seen and changed. */
export function FieldSelect({ label, value, fields, filter, none = "None", hint, onChange }: {
  label: string; value: string; fields: OdooField[]; filter: (f: OdooField) => boolean; none?: string; hint?: string; onChange: (id: string) => void;
}) {
  const options = fields.filter((f) => filter(f) || f.id === value);
  return <Prop label={label} hint={hint}>
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{none}</option>
      {value && !options.some((f) => f.id === value) && <option value={value}>(deleted field)</option>}
      {options.map((f) => <option key={f.id} value={f.id}>{labelOf(f)}{filter(f) ? "" : ` (${f.ttype}: not usable here)`}</option>)}
    </select>
  </Prop>;
}

/** An ordered list of fields with ↑ ↓ × on each, and a select that adds one of the remaining fields that pass `filter`. */
export function FieldList({ label, ids, fields, filter, hint, empty, onChange }: {
  label: string; ids: string[]; fields: OdooField[]; filter: (f: OdooField) => boolean; hint?: string; empty?: string; onChange: (ids: string[]) => void;
}) {
  const move = (i: number, by: number) => { const next = ids.slice(); next.splice(i + by, 0, next.splice(i, 1)[0]); onChange(next); };
  const left = fields.filter((f) => filter(f) && !ids.includes(f.id));
  return <fieldset className="st-modifier st-field-list">
    <legend>{label}</legend>
    {ids.length ? <ul className="st-plain">{ids.map((id, i) => {
      const f = fields.find((x) => x.id === id);
      return <li key={id} className="st-row">
        <span className={`st-field-name${f ? "" : " danger-text"}`}>{f ? labelOf(f) : "(deleted field)"}</span>
        <button type="button" className="pill-btn" aria-label={`Move ${labelOf(f)} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
        <button type="button" className="pill-btn" aria-label={`Move ${labelOf(f)} down`} disabled={i === ids.length - 1} onClick={() => move(i, 1)}>↓</button>
        <button type="button" className="pill-btn" aria-label={`Remove ${labelOf(f)}`} onClick={() => onChange(ids.filter((x) => x !== id))}>×</button>
      </li>;
    })}</ul> : empty && <p className="hint">{empty}</p>}
    {left.length > 0 && <select aria-label={`Add to ${label}`} value="" onChange={(e) => { if (e.target.value) onChange([...ids, e.target.value]); }}>
      <option value="">+ Add a field…</option>{left.map((f) => <option key={f.id} value={f.id}>{labelOf(f)}</option>)}</select>}
    {hint && <small className="hint">{hint}</small>}
  </fieldset>;
}

/** The heading of a view's properties panel, with "Remove this view" (the model's actions stop opening it). */
export function ViewHead({ app, view, onApp, children }: { app: OdooApp; view: OdooView; onApp: (app: OdooApp) => void; children?: ReactNode }) {
  const name = viewLabel(view.type);
  return <>
    <div className="st-props-head"><h3>{name} view</h3>
      <button className="btn ghost small danger-text" onClick={() => {
        if (window.confirm(`Remove the ${name.toLowerCase()} view? Its menus stop offering it. (Undo brings it back.)`)) onApp(removeView(app, view.id));
      }}>Remove this view</button></div>
    {children}
  </>;
}

/** Sample group names for a preview: the selection's labels, or a few made-up records for a many2one. */
export function sampleGroups(f: OdooField | undefined, count = 3): string[] {
  if (!f) return [];
  if (f.ttype === "selection") return f.selection.map(([, l]) => l).slice(0, 5);
  if (f.ttype === "boolean") return ["Yes", "No"];
  if (f.ttype === "date" || f.ttype === "datetime") return ["September 2026", "October 2026", "November 2026"].slice(0, count);
  if (f.ttype === "many2one" && f.comodel === "res.users") return ["Mitchell Admin", "Marc Demo", "Joel Willis"].slice(0, count);
  if (f.ttype === "many2one") return ["Azure Interior", "Deco Addict", "Gemini Furniture"].slice(0, count);
  return [`${labelOf(f)} A`, `${labelOf(f)} B`, `${labelOf(f)} C`].slice(0, count);
}

export type ModelProps<V> = { app: OdooApp; model: OdooModel; view: V; onApp: (app: OdooApp) => void };
