import { type OdooApp, type OdooField, type OdooModel, type TType, FIELD_NAME, TTYPES, isRelational, slug } from "../odoo/studioModel";
import { Check, CommitInput, Prop } from "./controls";

/** Models a relational field can point to: the app's own, plus the usual Odoo ones. */
const COMMON_MODELS = ["res.partner", "res.users", "res.company", "res.currency", "res.country", "product.product", "product.template", "uom.uom",
  "hr.employee", "hr.department", "project.project", "project.task", "sale.order", "purchase.order", "account.move", "stock.warehouse", "mail.activity.type"];

/** Default value hints per type, since defaults are typed as text. */
const DEFAULT_HINT: Partial<Record<TType, string>> = {
  date: "\"today\" or 2026-01-31", datetime: "\"now\"", boolean: "true or false", many2one: "\"user\", \"company\" or \"currency\"",
  selection: "one of the values' keys",
};

export const WIDGETS: Partial<Record<TType, string[]>> = {
  char: ["email", "url", "phone", "CopyClipboardChar"], integer: ["progressbar", "handle"], float: ["progressbar", "float_time", "percentage"],
  monetary: ["monetary"], boolean: ["boolean_toggle"], selection: ["radio", "badge", "priority", "selection_badge"],
  many2one: ["many2one_avatar_user", "many2one_avatar", "radio"], many2many: ["many2many_tags", "many2many_checkboxes", "many2many_avatar_user"],
  date: ["daterange", "remaining_days"], datetime: ["remaining_days"], image: ["image"], binary: ["binary"], html: ["html"],
};

interface Props {
  app: OdooApp;
  model: OdooModel;
  field: OdooField;
  onChange: (field: OdooField) => void;
}

/** The settings of a field on the model: they apply wherever the field is shown. */
export function FieldProps({ app, model, field, onChange }: Props) {
  const set = (patch: Partial<OdooField>) => onChange({ ...field, ...patch });
  const nameTaken = model.fields.some((f) => f.id !== field.id && f.name === field.name);
  const comodelOptions = [...new Set([...app.models.map((m) => m.name), ...COMMON_MODELS])];
  const inverseOptions = app.models.find((m) => m.name === field.comodel)?.fields.filter((f) => f.ttype === "many2one" && f.comodel === model.name) ?? [];
  return <div className="st-props-section">
    <Prop label="Label"><CommitInput value={field.string} placeholder="Shown to users" onCommit={(string) => set({ string })} /></Prop>
    <Prop label="Technical name" hint={!FIELD_NAME.test(field.name) ? "Lowercase letters, digits and underscores." : nameTaken ? "Another field has this name." : undefined}>
      <CommitInput value={field.name} className={!FIELD_NAME.test(field.name) || nameTaken ? "invalid" : ""} onCommit={(name) => set({ name: name.trim() || field.name })} />
    </Prop>
    <Prop label="Type">
      <select value={field.ttype} onChange={(e) => {
        const ttype = e.target.value as TType;
        set({ ttype, comodel: isRelational(ttype) ? field.comodel || "res.partner" : "",
          selection: ttype === "selection" && !field.selection.length ? [["draft", "Draft"], ["done", "Done"]] : field.selection,
          currencyField: ttype === "monetary" ? field.currencyField || "currency_id" : field.currencyField });
      }}>{TTYPES.map((t) => <option key={t.type} value={t.type}>{t.label} ({t.type})</option>)}</select>
    </Prop>
    {isRelational(field.ttype) && <Prop label="Related model">
      <CommitInput list="st-models" value={field.comodel} placeholder="res.partner" onCommit={(comodel) => set({ comodel: comodel.trim() })} />
      <datalist id="st-models">{comodelOptions.map((m) => <option key={m} value={m} />)}</datalist>
    </Prop>}
    {field.ttype === "one2many" && <Prop label="Inverse field" hint={`The many2one on ${field.comodel || "the related model"} that points to ${model.name}.`}>
      {inverseOptions.length ? <select value={field.inverseName} onChange={(e) => set({ inverseName: e.target.value })}>
        {!inverseOptions.some((f) => f.name === field.inverseName) && <option value={field.inverseName}>{field.inverseName || "Choose…"}</option>}
        {inverseOptions.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}</select>
        : <CommitInput value={field.inverseName} placeholder={`${model.name.split(".").pop()}_id`} onCommit={(inverseName) => set({ inverseName: inverseName.trim() })} />}
    </Prop>}
    {field.ttype === "many2one" && <Prop label="When the related record is deleted">
      <select value={field.ondelete} onChange={(e) => set({ ondelete: e.target.value as OdooField["ondelete"] })}>
        <option value="set null">Clear this field</option><option value="restrict">Prevent the deletion</option><option value="cascade">Delete this record too</option></select>
    </Prop>}
    {field.ttype === "monetary" && <Prop label="Currency field"><CommitInput value={field.currencyField} placeholder="currency_id" onCommit={(currencyField) => set({ currencyField })} /></Prop>}
    {field.ttype === "selection" && <SelectionEditor values={field.selection} onChange={(selection) => set({ selection })} />}
    <div className="st-checks">
      <Check label="Required" checked={field.required} onChange={(required) => set({ required })} />
      <Check label="Read-only" checked={field.readonly} onChange={(readonly) => set({ readonly })} />
      <Check label="Indexed" checked={field.index} onChange={(index) => set({ index })} />
      <Check label="Track changes" checked={field.tracking} disabled={!model.chatter && !field.tracking} onChange={(tracking) => set({ tracking })} />
    </div>
    {!model.chatter && <p className="hint">Track changes needs the chatter (model settings).</p>}
    {!["one2many", "many2many", "binary", "image", "html"].includes(field.ttype) && <Prop label="Default value" hint={DEFAULT_HINT[field.ttype]}>
      <CommitInput value={field.default} onCommit={(d) => set({ default: d })} />
    </Prop>}
    <Prop label="Help tooltip"><CommitInput multiline value={field.help} onCommit={(help) => set({ help })} /></Prop>
  </div>;
}

function SelectionEditor({ values, onChange }: { values: [string, string][]; onChange: (v: [string, string][]) => void }) {
  const set = (i: number, pair: [string, string]) => onChange(values.map((p, j) => (j === i ? pair : p)));
  const move = (i: number, by: number) => { const next = values.slice(); const [p] = next.splice(i, 1); next.splice(i + by, 0, p); onChange(next); };
  return <fieldset className="st-selection">
    <legend>Values</legend>
    {values.map(([key, label], i) => <div className="st-row" key={i}>
      <CommitInput aria-label="Label" value={label} placeholder="Label" onCommit={(l) => set(i, [key || slug(l), l])} />
      <CommitInput aria-label="Key" className="st-key" value={key} placeholder="key" onCommit={(k) => set(i, [k.trim(), label])} />
      <button type="button" className="pill-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
      <button type="button" className="pill-btn" aria-label="Remove value" onClick={() => onChange(values.filter((_, j) => j !== i))}>×</button>
    </div>)}
    <button type="button" className="link small" onClick={() => {
      let n = values.length + 1; while (values.some(([k]) => k === `value_${n}`)) n++;
      onChange([...values, [`value_${n}`, `Value ${n}`]]);
    }}>+ Add a value</button>
  </fieldset>;
}
