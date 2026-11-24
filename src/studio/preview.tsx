import { type OdooApp, type OdooField, modelByName, titleCase } from "../odoo/studioModel";

/** A sample value of the right shape, for list previews. */
export function sampleValue(f: OdooField, row: number): string {
  switch (f.ttype) {
    case "char": return f.name === "name" ? ["Office chairs", "Laptops", "Printer paper"][row % 3] : `${f.string || titleCase(f.name)} ${row + 1}`;
    case "text": case "html": return "Some text…";
    case "integer": return String([3, 12, 7][row % 3]);
    case "float": return ["1.50", "12.00", "7.25"][row % 3];
    case "monetary": return ["$ 1,250.00", "$ 480.00", "$ 72.50"][row % 3];
    case "boolean": return row % 2 ? "☐" : "☑";
    case "date": return ["11/22/2026", "11/18/2026", "10/30/2026"][row % 3];
    case "datetime": return ["11/22/2026 09:30", "11/18/2026 14:00", "10/30/2026 16:45"][row % 3];
    case "selection": return f.selection[row % Math.max(1, f.selection.length)]?.[1] ?? "";
    case "many2one": return ["Azure Interior", "Deco Addict", "Gemini Furniture"][row % 3];
    case "many2many": return "Tag A, Tag B";
    case "one2many": return `${row + 2} records`;
    default: return "";
  }
}

/** What a field looks like on a form, roughly as Odoo draws it. */
export function FakeWidget({ app, field, widget, placeholder }: { app: OdooApp; field: OdooField; widget: string; placeholder?: string }) {
  const f = field;
  if (f.ttype === "boolean") return <span className={`fw-check${widget === "boolean_toggle" ? " toggle" : ""}`} aria-hidden="true" />;
  if (f.ttype === "selection" && (widget === "radio" || widget === "selection_badge"))
    return <span className="fw-radio">{f.selection.slice(0, 4).map(([k, l], i) => <span key={k}><i className={i === 0 ? "on" : ""} />{l}</span>)}</span>;
  if (f.ttype === "selection" && widget === "priority") return <span className="fw-stars">★☆☆</span>;
  if (f.ttype === "selection" || f.ttype === "many2one")
    return <span className="fw-input fw-select">{placeholder || (f.ttype === "selection" ? f.selection[0]?.[1] : "") || " "}<i>▾</i></span>;
  if (f.ttype === "many2many") return <span className="fw-input fw-tags"><b>Tag A</b><b>Tag B</b></span>;
  if (f.ttype === "one2many") {
    const comodel = modelByName(app, f.comodel);
    const list = comodel && app.views.find((v) => v.modelId === comodel.id && v.type === "list");
    const cols = list?.type === "list" ? list.arch.columns.map((c) => comodel!.fields.find((x) => x.id === c.fieldId)).filter((x): x is OdooField => !!x).slice(0, 5)
      : comodel?.fields.slice(0, 4) ?? [];
    return <span className="fw-o2m">
      <span className="fw-o2m-head">{cols.length ? cols.map((c) => <b key={c.id}>{c.string || titleCase(c.name)}</b>) : <b>{f.comodel || "Records"}</b>}</span>
      <span className="fw-o2m-add">Add a line</span>
    </span>;
  }
  if (f.ttype === "html") return <span className="fw-input fw-html">{placeholder || "Rich text…"}</span>;
  if (f.ttype === "text") return <span className="fw-input fw-text">{placeholder || " "}</span>;
  if (f.ttype === "image") return <span className="fw-image" aria-hidden="true">🖼</span>;
  if (f.ttype === "binary") return <span className="fw-input">📎 Upload your file</span>;
  if (widget === "progressbar") return <span className="fw-progress"><i /></span>;
  const hint = f.ttype === "date" ? "📅" : f.ttype === "datetime" ? "🕒" : f.ttype === "monetary" ? "$" : "";
  return <span className="fw-input">{placeholder || (f.ttype === "integer" || f.ttype === "float" || f.ttype === "monetary" ? "0.00" : " ")}{hint && <i>{hint}</i>}</span>;
}
