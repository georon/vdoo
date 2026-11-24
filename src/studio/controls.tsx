import { type InputHTMLAttributes, type ReactNode, useEffect, useState } from "react";
import type { OdooField } from "../odoo/studioModel";
import { type Condition, type ConditionRow, type ModifierMode, OPERATORS, formatCondition, modifierMode, parseCondition, takesValue } from "../odoo/conditions";

/**
 * A text box that commits when it loses focus or on Enter, so typing a label is one undo step, not one per key.
 * Escape puts the committed value back.
 */
export function CommitInput({ value, onCommit, multiline, ...rest }: { value: string; onCommit: (value: string) => void; multiline?: boolean }
  & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => { if (text !== value) onCommit(text); };
  const keys = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && (!multiline || event.ctrlKey || event.metaKey)) { event.preventDefault(); commit(); }
    if (event.key === "Escape") { setText(value); event.stopPropagation(); }
  };
  if (multiline) return <textarea className={rest.className} aria-label={rest["aria-label"]} placeholder={rest.placeholder} rows={3} value={text}
    spellCheck={false} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={keys} />;
  return <input {...rest} value={text} spellCheck={false} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={keys} />;
}

/** A labelled row in a properties panel. */
export const Prop = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) =>
  <label className="st-prop"><span>{label}</span>{children}{hint && <small className="hint">{hint}</small>}</label>;

export const Check = ({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) =>
  <label className="st-check"><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />{label}</label>;

/**
 * Invisible / Required / Read-only, as Odoo 17+ expressions: never, always, or when a condition over the record holds.
 * The builder covers flat AND / OR lists; anything else is edited as code.
 */
export function ModifierEditor({ label, value, fields, onChange, allowAlways = true }:
  { label: string; value: string; fields: OdooField[]; onChange: (expr: string) => void; allowAlways?: boolean }) {
  const mode = modifierMode(value);
  const parsed = mode === "when" ? parseCondition(value) : { join: "and" as const, rows: [] };
  const [code, setCode] = useState(false);
  const asCode = code || (mode === "when" && !parsed);
  const setMode = (m: ModifierMode) => onChange(m === "never" ? "" : m === "always" ? "True" : value && mode === "when" ? value
    : formatCondition({ join: "and", rows: [firstRow(fields)] }, fields));
  const setRows = (cond: Condition) => onChange(cond.rows.length ? formatCondition(cond, fields) : "");
  return <fieldset className="st-modifier">
    <legend>{label}</legend>
    <div className="segmented" role="group" aria-label={label}>
      {(["never", ...(allowAlways ? ["always"] : []), "when"] as ModifierMode[]).map((m) =>
        <button key={m} type="button" className={`btn ghost small${mode === m ? " active" : ""}`} aria-pressed={mode === m} onClick={() => setMode(m)}>
          {m === "never" ? "Never" : m === "always" ? "Always" : "When…"}</button>)}
    </div>
    {mode === "when" && (asCode
      ? <CommitInput aria-label={`${label} condition`} className="st-code" value={value} placeholder="state != 'draft'" onCommit={onChange} />
      : <Rows cond={parsed!} fields={fields} onChange={setRows} />)}
    {mode === "when" && <button type="button" className="link small" disabled={!parsed && asCode}
      title={!parsed ? "This condition is too complex for the builder" : undefined} onClick={() => setCode(!asCode)}>{asCode ? "Use the builder" : "Edit as code"}</button>}
  </fieldset>;
}

/** A condition on its own (a search filter's), with the same builder and "Edit as code" as the modifiers. */
export function ConditionEditor({ label, value, fields, onChange }: { label: string; value: string; fields: OdooField[]; onChange: (expr: string) => void }) {
  const parsed = parseCondition(value);
  const [code, setCode] = useState(false);
  const asCode = code || !parsed;
  return <fieldset className="st-modifier">
    <legend>{label}</legend>
    {asCode
      ? <CommitInput aria-label={`${label} condition`} className="st-code" value={value} placeholder="state == 'draft'" onCommit={onChange} />
      : <Rows cond={parsed!} fields={fields} onChange={(cond) => onChange(cond.rows.length ? formatCondition(cond, fields) : "")} />}
    <button type="button" className="link small" disabled={!parsed} title={!parsed ? "This condition is too complex for the builder" : undefined}
      onClick={() => setCode(!asCode)}>{asCode ? "Use the builder" : "Edit as code"}</button>
  </fieldset>;
}

const firstRow = (fields: OdooField[]): ConditionRow => {
  const f = fields.find((x) => x.name === "state") ?? fields.find((x) => x.ttype === "selection") ?? fields[0];
  return { field: f?.name ?? "", op: f?.ttype === "boolean" || f?.ttype === "many2one" ? "set" : "==", value: f?.selection[0]?.[0] ?? "" };
};

function Rows({ cond, fields, onChange }: { cond: Condition; fields: OdooField[]; onChange: (c: Condition) => void }) {
  const set = (i: number, patch: Partial<ConditionRow>) => onChange({ ...cond, rows: cond.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  return <div className="st-rows">
    {cond.rows.length > 1 && <label className="st-join">Match
      <select value={cond.join} onChange={(e) => onChange({ ...cond, join: e.target.value as "and" | "or" })}>
        <option value="and">all of these</option><option value="or">any of these</option></select></label>}
    {cond.rows.map((row, i) => {
      const f = fields.find((x) => x.name === row.field);
      return <div className="st-row" key={i}>
        <select aria-label="Field" value={row.field} onChange={(e) => set(i, { field: e.target.value })}>
          {!f && <option value={row.field}>{row.field || "Choose a field"}</option>}
          {fields.filter((x) => x.ttype !== "one2many" && x.ttype !== "many2many" && x.ttype !== "html").map((x) =>
            <option key={x.id} value={x.name}>{x.string || x.name}</option>)}
        </select>
        <select aria-label="Operator" value={row.op} onChange={(e) => set(i, { op: e.target.value as ConditionRow["op"] })}>
          {OPERATORS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
        </select>
        {takesValue(row.op) && (f?.ttype === "selection" && row.op !== "in" && row.op !== "not in"
          ? <select aria-label="Value" value={row.value} onChange={(e) => set(i, { value: e.target.value })}>
            {!f.selection.some(([k]) => k === row.value) && <option value={row.value}>{row.value}</option>}
            {f.selection.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          : f?.ttype === "boolean"
            ? <select aria-label="Value" value={/^(true|1)$/i.test(row.value) ? "True" : "False"} onChange={(e) => set(i, { value: e.target.value })}>
              <option value="True">checked</option><option value="False">not checked</option></select>
            : <CommitInput aria-label="Value" value={row.value} placeholder={row.op.includes("in") ? "a, b, c" : "value"} onCommit={(v) => set(i, { value: v })} />)}
        <button type="button" className="pill-btn" aria-label="Remove condition" title="Remove" onClick={() => onChange({ ...cond, rows: cond.rows.filter((_, j) => j !== i) })}>×</button>
      </div>;
    })}
    <button type="button" className="link small" onClick={() => onChange({ ...cond, rows: [...cond.rows, firstRow(fields)] })}>+ Add a condition</button>
  </div>;
}

/** A short summary of the modifiers on a node, for the badges in the preview. */
export function modifierBadges(n: { invisible?: string; required?: string; readonly?: string }) {
  const out: { key: string; label: string; title: string }[] = [];
  if (n.invisible?.trim()) out.push({ key: "inv", label: "👁", title: `Invisible: ${n.invisible}` });
  if (n.required?.trim()) out.push({ key: "req", label: "*", title: `Required: ${n.required}` });
  if (n.readonly?.trim()) out.push({ key: "ro", label: "🔒", title: `Read-only: ${n.readonly}` });
  return out;
}
