// Turns an OdooApp into the files of an installable Odoo addon. Pure and deterministic: the same app gives the same
// files, in the same order, so exports diff cleanly in git.
import {
  type ButtonNode, type CalendarArch, type FormArch, type FormNode, type GraphArch, type KanbanArch, type ListArch, type OdooApp, type OdooField,
  type OdooModel, type OdooView, type PivotArch, type SearchArch, DECORATIONS, VIEW_TYPES, defaultSearch, expressionNames, fieldById, formFieldNodes, modelById, modelByName, slug, titleCase,
} from "./studioModel";
import { conditionToDomain } from "./conditions";

export interface AddonFile { path: string; content: string }

// ── Small writers ────────────────────────────────────────────────────────────────────────
/** JSON string syntax is valid Python string syntax. */
const py = (s: string) => JSON.stringify(s);
const xmlText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const xmlAttr = (s: string) => xmlText(s).replace(/"/g, "&quot;");

type Attrs = Record<string, string | undefined | false>;
interface El { tag: string; attrs?: Attrs; children?: (El | string)[] }
const el = (tag: string, attrs: Attrs = {}, children: (El | string)[] = []): El => ({ tag, attrs, children });

function renderXml(node: El | string, depth: number): string {
  const pad = "    ".repeat(depth);
  if (typeof node === "string") return pad + xmlText(node);
  const attrs = Object.entries(node.attrs ?? {}).filter(([, v]) => v !== undefined && v !== false && v !== "")
    .map(([k, v]) => ` ${k}="${xmlAttr(v as string)}"`).join("");
  const kids = node.children ?? [];
  if (!kids.length) return `${pad}<${node.tag}${attrs}/>`;
  if (kids.length === 1 && typeof kids[0] === "string") return `${pad}<${node.tag}${attrs}>${xmlText(kids[0])}</${node.tag}>`;
  return `${pad}<${node.tag}${attrs}>\n${kids.map((k) => renderXml(k, depth + 1)).join("\n")}\n${pad}</${node.tag}>`;
}
const xmlFile = (records: El[]) => `<?xml version="1.0" encoding="utf-8"?>\n${renderXml(el("odoo", {}, records), 0)}\n`;

/** A Python class name from a model name: x_vendor.request → XVendorRequest. */
export const className = (model: string) => model.split(/[._]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("") || "Model";
/** The model's table name, which is also how Odoo names its ir.model XML id. */
export const tableName = (model: string) => model.replace(/\./g, "_");

/** Modules that define common comodels, so depending on them is automatic. */
const COMODEL_MODULES: [RegExp, string][] = [
  [/^(res|ir|base)\./, "base"], [/^mail\./, "mail"], [/^product\./, "product"], [/^uom\./, "uom"], [/^sale\./, "sale"], [/^purchase\./, "purchase"],
  [/^account\./, "account"], [/^stock\./, "stock"], [/^hr\./, "hr"], [/^project\./, "project"], [/^crm\./, "crm"], [/^calendar\./, "calendar"],
];

export function dependencies(app: OdooApp): string[] {
  const deps = new Set(["base"]);
  if (app.models.some((m) => m.chatter || m.fields.some((f) => f.tracking))) deps.add("mail");
  for (const m of app.models) {
    if (m.extend) { const found = COMODEL_MODULES.find(([re]) => re.test(m.name)); if (found) deps.add(found[1]); }
    for (const f of m.fields) {
      if (!f.comodel || modelByName(app, f.comodel)) continue;
      const found = COMODEL_MODULES.find(([re]) => re.test(f.comodel));
      if (found) deps.add(found[1]);
    }
  }
  for (const d of app.depends) if (d.trim()) deps.add(d.trim());
  return ["base", ...[...deps].filter((d) => d !== "base").sort()];
}

/** XML ids, made unique across the addon and stable for a given app. */
function xmlIds(app: OdooApp) {
  const used = new Set<string>();
  const take = (base: string) => { let id = base, n = 1; while (used.has(id)) id = `${base}_${++n}`; used.add(id); return id; };
  const actions = new Map(app.actions.map((a) => [a.id, take(`action_${tableName(modelById(app, a.modelId)?.name ?? slug(a.name))}`)]));
  const menus = new Map<string, string>();
  for (const m of orderedMenus(app)) menus.set(m.id, take(m.parentId === null && !menus.size ? "menu_root" : `menu_${slug(m.name)}`));
  return { actions, menus };
}

/** Parents before children, siblings by sequence, so every menuitem's parent is already defined. */
function orderedMenus(app: OdooApp) {
  const out: typeof app.menus = [];
  const visit = (parent: string | null, seen: Set<string>) => app.menus.filter((m) => m.parentId === parent && !seen.has(m.id))
    .sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name)).forEach((m) => { seen.add(m.id); out.push(m); visit(m.id, seen); });
  visit(null, new Set());
  return out;
}

const viewMode = (app: OdooApp, mode: string) => (mode === "list" && app.odooVersion === "17.0" ? "tree" : mode);
const listTag = (app: OdooApp) => (app.odooVersion === "17.0" ? "tree" : "list");

// ── Python ───────────────────────────────────────────────────────────────────────────────
const FIELD_CLASS: Record<OdooField["ttype"], string> = {
  char: "Char", text: "Text", html: "Html", integer: "Integer", float: "Float", monetary: "Monetary", boolean: "Boolean", date: "Date",
  datetime: "Datetime", selection: "Selection", many2one: "Many2one", one2many: "One2many", many2many: "Many2many", binary: "Binary", image: "Image",
};

function defaultValue(f: OdooField): string | null {
  const v = f.default.trim();
  if (!v) return null;
  switch (f.ttype) {
    case "boolean": return /^(true|1|yes)$/i.test(v) ? "True" : "False";
    case "integer": case "float": case "monetary": return /^-?\d+(\.\d+)?$/.test(v) ? v : null;
    case "date": return v === "today" ? "fields.Date.context_today" : py(v);
    case "datetime": return v === "now" ? "fields.Datetime.now" : py(v);
    case "many2one":
      if (v === "user") return "lambda self: self.env.user";
      if (v === "company") return "lambda self: self.env.company";
      if (v === "currency") return "lambda self: self.env.company.currency_id";
      return null;
    case "one2many": case "many2many": case "binary": case "image": return null;
    default: return py(v);
  }
}

/** `expand`: the field groups a kanban that shows every column, so it gets group_expand. */
export function fieldLine(f: OdooField, expand = false): string {
  const args: string[] = [];
  if (f.ttype === "selection") args.push(`[${f.selection.map(([k, l]) => `(${py(k)}, ${py(l)})`).join(", ")}]`);
  if (f.ttype === "many2one" || f.ttype === "one2many" || f.ttype === "many2many") args.push(py(f.comodel));
  if (f.ttype === "one2many") args.push(py(f.inverseName));
  args.push(`string=${py(f.string || titleCase(f.name))}`);
  if (f.required) args.push("required=True");
  if (f.readonly) args.push("readonly=True");
  if (f.index) args.push("index=True");
  if (f.tracking) args.push("tracking=True");
  if (expand && f.ttype === "selection") args.push("group_expand=True");
  if (expand && f.ttype === "many2one") args.push(`group_expand=${py("_read_group_expand_full")}`);
  if (f.ttype === "many2one" && f.ondelete !== "set null") args.push(`ondelete=${py(f.ondelete)}`);
  if (f.ttype === "monetary" && f.currencyField && f.currencyField !== "currency_id") args.push(`currency_field=${py(f.currencyField)}`);
  const d = defaultValue(f);
  if (d) args.push(`default=${d}`);
  if (f.help) args.push(`help=${py(f.help)}`);
  return `${f.name} = fields.${FIELD_CLASS[f.ttype]}(${args.join(", ")})`;
}

/** The methods behind smart buttons and header buttons of the model's form view. */
function viewMethods(app: OdooApp, model: OdooModel, form: FormArch | undefined): { fields: string[]; methods: string[][]; usesApi: boolean } {
  const fields: string[] = [], methods: string[][] = [];
  let usesApi = false;
  const defined = new Set<string>();
  for (const sb of form?.smartButtons ?? []) {
    const f = fieldById(model, sb.fieldId);
    if (!f || (f.ttype !== "one2many" && f.ttype !== "many2many") || defined.has(f.name)) continue;
    defined.add(f.name);
    usesApi = true;
    const count = `${f.name.replace(/_ids$/, "")}_count`;
    const comodel = modelByName(app, f.comodel);
    // Its own label: Odoo warns when two fields of a model share one.
    fields.push(`${count} = fields.Integer(string=${py(`${f.string || titleCase(f.name)} Count`)}, compute=${py(`_compute_${count}`)})`);
    methods.push([`@api.depends(${py(f.name)})`, `def _compute_${count}(self):`, "    for record in self:", `        record.${count} = len(record.${f.name})`]);
    const domain = f.ttype === "one2many" ? `[(${py(f.inverseName)}, "=", self.id)]` : `[("id", "in", self.${f.name}.ids)]`;
    const views = viewMode(app, "list") + ",form";
    methods.push([`def ${smartMethod(f)}(self):`, "    self.ensure_one()", "    return {", '        "type": "ir.actions.act_window",',
      `        "name": ${py(sb.string || f.string || comodel?.description || titleCase(f.name))},`, `        "res_model": ${py(f.comodel)},`,
      `        "view_mode": ${py(views)},`, `        "domain": ${domain},`,
      ...(f.ttype === "one2many" ? [`        "context": {${py(`default_${f.inverseName}`)}: self.id},`] : []), "    }"]);
  }
  const seen = new Set<string>();
  for (const b of form?.buttons ?? []) {
    if (!b.method || seen.has(b.method)) continue;
    seen.add(b.method);
    methods.push(buttonMethod(model, b));
  }
  return { fields, methods, usesApi };
}
export const smartMethod = (f: OdooField) => `action_view_${f.name.replace(/_ids$/, "")}`;
export const smartCountField = (f: OdooField) => `${f.name.replace(/_ids$/, "")}_count`;

function buttonMethod(model: OdooModel, b: ButtonNode): string[] {
  const target = b.setField ? fieldById(model, b.setField.fieldId) : undefined;
  if (!target) return [`def ${b.method}(self):`, `    # TODO: what "${b.string.replace(/"/g, "'")}" does`, "    return True"];
  const raw = b.setField!.value.trim();
  const value = target.ttype === "boolean" ? (/^(true|1|yes)$/i.test(raw) ? "True" : "False")
    : ["integer", "float", "monetary"].includes(target.ttype) && /^-?\d+(\.\d+)?$/.test(raw) ? raw
    : target.ttype === "many2one" && raw === "user" ? "self.env.user.id"
    : target.ttype === "date" && raw === "today" ? "fields.Date.context_today(self)"
    : target.ttype === "datetime" && raw === "now" ? "fields.Datetime.now()" : py(raw);
  return [`def ${b.method}(self):`, `    self.write({${py(target.name)}: ${value}})`, "    return True"];
}

function modelPy(app: OdooApp, model: OdooModel): string {
  const form = app.views.find((v) => v.modelId === model.id && v.type === "form")?.arch as FormArch | undefined;
  const extra = viewMethods(app, model, model.extend ? undefined : form);
  const head = [`class ${className(model.name)}(models.Model):`];
  if (model.extend) head.push(`    _inherit = ${py(model.name)}`);
  else {
    head.push(`    _name = ${py(model.name)}`, `    _description = ${py(model.description || titleCase(model.name))}`);
    if (model.chatter) head.push('    _inherit = ["mail.thread", "mail.activity.mixin"]');
    if (model.order.trim()) head.push(`    _order = ${py(model.order.trim())}`);
    const rec = fieldById(model, model.recName) ?? model.fields.find((f) => f.name === model.recName);
    if (rec && rec.name !== "name") head.push(`    _rec_name = ${py(rec.name)}`);
  }
  const expanded = new Set(app.views.flatMap((v) => (v.modelId === model.id && v.type === "kanban" && v.arch.expandGroups ? [v.arch.groupByFieldId] : [])));
  const body = [...model.fields.map((f) => fieldLine(f, expanded.has(f.id))), ...extra.fields].map((l) => `    ${l}`);
  const methods = extra.methods.map((m) => m.map((l) => `    ${l}`).join("\n"));
  const imports = `from odoo import ${extra.usesApi ? "api, " : ""}fields, models`;
  return [imports, "", "", [...head, "", ...body].join("\n") + (methods.length ? "\n\n" + methods.join("\n\n") : ""), ""].join("\n");
}

// ── Views ────────────────────────────────────────────────────────────────────────────────
const mods = (n: { invisible?: string; readonly?: string; required?: string }) =>
  ({ invisible: n.invisible?.trim(), readonly: n.readonly?.trim(), required: n.required?.trim() });

function formNodeXml(model: OdooModel, n: FormNode): El | null {
  switch (n.kind) {
    case "field": {
      const f = fieldById(model, n.fieldId);
      if (!f) return null;
      return el("field", { name: f.name, string: n.string, widget: n.widget, placeholder: n.placeholder, nolabel: n.nolabel ? "1" : "", ...mods(n) });
    }
    case "group": return el("group", { string: n.string, invisible: n.invisible.trim() }, n.children.map((c) => formNodeXml(model, c)).filter((c): c is El => !!c));
    case "notebook": return el("notebook", {}, n.pages.map((p) => el("page", { string: p.string || "Page", name: slug(p.string || p.id), invisible: p.invisible.trim() },
      p.children.map((c) => formNodeXml(model, c)).filter((c): c is El => !!c))));
    case "separator": return el("separator", { string: n.string });
  }
}

/** Field names a view's modifiers read, minus the ones the view shows: those must be added invisibly. */
function missingFields(model: OdooModel, exprs: string[], shown: Set<string>): string[] {
  const names = new Set(exprs.flatMap((e) => expressionNames(e)));
  return model.fields.map((f) => f.name).filter((n) => names.has(n) && !shown.has(n));
}

function formXml(app: OdooApp, model: OdooModel, arch: FormArch): El {
  const status = fieldById(model, arch.statusbarFieldId), title = fieldById(model, arch.titleFieldId);
  const header: El[] = arch.buttons.map((b) => el("button", { name: b.method, type: "object", string: b.string, class: b.primary ? "btn-primary" : "btn-secondary",
    invisible: b.invisible.trim(), confirm: b.confirm }));
  // Not clickable: the header buttons are the only way to move between states, so approval steps can't be skipped.
  if (status) header.push(el("field", { name: status.name, widget: "statusbar" }));
  const sheet: El[] = [];
  const smart = arch.smartButtons.map((sb) => ({ sb, f: fieldById(model, sb.fieldId) })).filter(({ f }) => f && (f.ttype === "one2many" || f.ttype === "many2many"));
  if (smart.length) sheet.push(el("div", { class: "oe_button_box", name: "button_box" }, smart.map(({ sb, f }) =>
    el("button", { name: smartMethod(f!), type: "object", class: "oe_stat_button", icon: sb.icon || "fa-list" },
      [el("field", { name: smartCountField(f!), widget: "statinfo", string: sb.string || f!.string || titleCase(f!.name) })]))));
  if (title) sheet.push(el("div", { class: "oe_title" }, [el("h1", {}, [el("field", { name: title.name, placeholder: title.string || titleCase(title.name) })])]));
  sheet.push(...arch.body.map((n) => formNodeXml(model, n)).filter((n): n is El => !!n));
  const nodes = formFieldNodes(arch.body);
  const shown = new Set([...nodes.map((n) => fieldById(model, n.fieldId)?.name), status?.name, title?.name].filter((n): n is string => !!n));
  const exprs = [...nodes.flatMap((n) => [n.invisible, n.readonly, n.required]), ...arch.buttons.map((b) => b.invisible), ...groupExprs(arch.body)];
  for (const name of missingFields(model, exprs, shown)) sheet.push(el("field", { name, invisible: "1" }));
  const children: El[] = [];
  if (header.length) children.push(el("header", {}, header));
  children.push(el("sheet", {}, sheet));
  if (model.chatter) children.push(app.odooVersion === "17.0"
    ? el("div", { class: "oe_chatter" }, [el("field", { name: "message_follower_ids" }), el("field", { name: "activity_ids" }), el("field", { name: "message_ids" })])
    : el("chatter"));
  return el("form", { string: model.description }, children);
}
const groupExprs = (body: FormNode[]): string[] => body.flatMap((n) => n.kind === "group" ? [n.invisible, ...groupExprs(n.children)]
  : n.kind === "notebook" ? n.pages.flatMap((p) => [p.invisible, ...groupExprs(p.children)]) : []);

function listXml(app: OdooApp, model: OdooModel, arch: ListArch): El {
  const attrs: Attrs = { string: model.description, editable: arch.editable };
  for (const d of DECORATIONS) attrs[`decoration-${d}`] = arch.decorations[d]?.trim();
  const cols = arch.columns.map((c) => ({ c, f: fieldById(model, c.fieldId) })).filter(({ f }) => !!f);
  const children = cols.map(({ c, f }) => el("field", { name: f!.name, string: c.string, widget: c.widget, optional: c.optional,
    sum: c.sum ? "Total" : "", ...mods(c) }));
  const shown = new Set(cols.map(({ f }) => f!.name));
  const exprs = [...cols.flatMap(({ c }) => [c.invisible, c.readonly, c.required]), ...Object.values(arch.decorations).map((e) => e ?? "")];
  for (const name of missingFields(model, exprs, shown)) children.push(el("field", { name, column_invisible: "1" }));
  return el(listTag(app), attrs, children);
}

const fieldsOf = (model: OdooModel, ids: string[]) => ids.map((id) => fieldById(model, id)).filter((f): f is OdooField => !!f);
const label = (f: OdooField) => f.string || titleCase(f.name);

/** The model's own search view, or the one vdoo derives from the list when it has none. */
function searchXml(model: OdooModel, arch: SearchArch | undefined, list: ListArch | undefined): El {
  const a = arch ?? defaultSearch(model, list);
  const names = new Set<string>();
  const unique = (base: string) => { let n = base, i = 1; while (names.has(n)) n = `${base}_${++i}`; names.add(n); return n; };
  const filters: El[] = [];
  for (const f of a.filters) {
    if (f.kind === "date") {
      const field = fieldById(model, f.dateFieldId);
      if (field) filters.push(el("filter", { name: unique(`filter_${field.name}`), string: f.label || label(field), date: field.name }));
    } else {
      const domain = conditionToDomain(f.expr, model.fields);
      if (domain) filters.push(el("filter", { name: unique(`filter_${slug(f.label)}`), string: f.label, domain }));
    }
  }
  // Each filter in a group of its own, so choosing several narrows the results (filters in one group are or-ed).
  const separated = filters.flatMap((f, i) => (i ? [el("separator"), f] : [f]));
  const groupBy = fieldsOf(model, a.groupByFieldIds);
  return el("search", { string: model.description }, [
    ...fieldsOf(model, a.fieldIds).map((f) => el("field", { name: f.name })),
    ...separated, ...(filters.length && groupBy.length ? [el("separator")] : []),
    ...groupBy.map((f) => el("filter", { name: unique(`groupby_${f.name}`), string: label(f), context: `{'group_by': '${f.name}'}` })),
  ]);
}

function kanbanXml(model: OdooModel, arch: KanbanArch): El {
  const field = (id: string) => fieldById(model, id);
  const group = field(arch.groupByFieldId), title = field(arch.titleFieldId), tags = field(arch.tagsFieldId);
  const avatar = field(arch.avatarFieldId), priority = field(arch.priorityFieldId);
  const lines = arch.cardFields.map((c) => ({ c, f: field(c.fieldId) })).filter(({ f }) => !!f);
  // A monetary field needs its currency loaded on the record.
  const currencies = [...new Set(lines.filter(({ f }) => f!.ttype === "monetary").map(({ f }) => f!.currencyField || "currency_id"))]
    .filter((n) => model.fields.some((f) => f.name === n));
  const card: El[] = [
    ...(title ? [el("field", { name: title.name, class: "fw-bold fs-5" })] : []),
    ...lines.map(({ c, f }) => el("field", { name: f!.name, widget: c.widget })),
    ...(tags ? [el("field", { name: tags.name, widget: "many2many_tags" })] : []),
  ];
  const footer = [...(priority ? [el("field", { name: priority.name, widget: "priority" })] : []),
    ...(avatar ? [el("field", { name: avatar.name, widget: "many2one_avatar_user", class: "ms-auto" })] : [])];
  if (footer.length) card.push(el("footer", {}, footer));
  return el("kanban", { string: model.description, default_group_by: group?.name, quick_create: arch.quickCreate ? undefined : "false", sample: "1" }, [
    ...currencies.map((name) => el("field", { name })),
    el("templates", {}, [el("t", { "t-name": "card" }, card)]),
  ]);
}

function calendarXml(model: OdooModel, arch: CalendarArch): El {
  const name = (id: string) => fieldById(model, id)?.name;
  return el("calendar", { string: model.description, date_start: name(arch.dateStartFieldId), date_stop: name(arch.dateStopFieldId),
    all_day: name(arch.allDayFieldId), color: name(arch.colorFieldId), mode: arch.mode, quick_create: arch.quickCreate ? undefined : "0" },
  fieldsOf(model, arch.popoverFieldIds).map((f) => el("field", { name: f.name })));
}

function pivotXml(model: OdooModel, arch: PivotArch): El {
  return el("pivot", { string: model.description, sample: "1" }, [
    ...fieldsOf(model, arch.rowFieldIds).map((f) => el("field", { name: f.name, type: "row" })),
    ...fieldsOf(model, arch.colFieldIds).map((f) => el("field", { name: f.name, type: "col" })),
    ...fieldsOf(model, arch.measureFieldIds).map((f) => el("field", { name: f.name, type: "measure" })),
  ]);
}

function graphXml(model: OdooModel, arch: GraphArch): El {
  const measure = fieldById(model, arch.measureFieldId);
  return el("graph", { string: model.description, type: arch.chart, stacked: arch.chart === "pie" ? undefined : arch.stacked ? "1" : "0", sample: "1" }, [
    ...fieldsOf(model, arch.groupFieldIds).map((f) => el("field", { name: f.name })),
    ...(measure ? [el("field", { name: measure.name, type: "measure" })] : []),
  ]);
}

function viewRecord(model: OdooModel, kind: string, arch: El): El {
  const table = tableName(model.name);
  return el("record", { id: `${table}_view_${kind === "tree" ? "list" : kind}`, model: "ir.ui.view" }, [
    el("field", { name: "name" }, [`${model.name}.${kind === "tree" ? "list" : kind}`]),
    el("field", { name: "model" }, [model.name]),
    el("field", { name: "arch", type: "xml" }, [arch]),
  ]);
}

/** The arch of one view; the search view is written separately, since every model gets one. */
function viewArch(app: OdooApp, model: OdooModel, v: OdooView): El | null {
  switch (v.type) {
    case "list": return listXml(app, model, v.arch);
    case "form": return formXml(app, model, v.arch);
    case "kanban": return kanbanXml(model, v.arch);
    case "calendar": return fieldById(model, v.arch.dateStartFieldId) ? calendarXml(model, v.arch) : null;
    case "pivot": return pivotXml(model, v.arch);
    case "graph": return graphXml(model, v.arch);
    case "search": return null;
  }
}

/** The model's views in a fixed order (list, form, kanban, calendar, pivot, graph, search), so the output is stable. */
const VIEW_ORDER = ["list", "form", ...VIEW_TYPES.map((t) => t.type).filter((t) => t !== "list" && t !== "form")];

function viewsXml(app: OdooApp, model: OdooModel): string | null {
  const ofModel = app.views.filter((v) => v.modelId === model.id).sort((a, b) => VIEW_ORDER.indexOf(a.type) - VIEW_ORDER.indexOf(b.type));
  if (!ofModel.some((v) => v.type !== "search")) return null;
  const records: El[] = [];
  for (const v of ofModel) {
    const arch = viewArch(app, model, v);
    if (arch) records.push(viewRecord(model, v.type === "list" ? listTag(app) : v.type, arch));
  }
  const search = ofModel.find((v): v is Extract<OdooView, { type: "search" }> => v.type === "search");
  const list = ofModel.find((v): v is Extract<OdooView, { type: "list" }> => v.type === "list");
  records.push(viewRecord(model, "search", searchXml(model, search?.arch, list?.arch)));
  return xmlFile(records);
}

function menusXml(app: OdooApp): string | null {
  const ids = xmlIds(app);
  const records: El[] = [];
  for (const a of app.actions) {
    const model = modelById(app, a.modelId);
    if (!model) continue;
    const children: El[] = [el("field", { name: "name" }, [a.name || model.description]), el("field", { name: "res_model" }, [model.name]),
      el("field", { name: "view_mode" }, [a.viewModes.map((m) => viewMode(app, m)).join(",") || viewMode(app, "list")])];
    if (a.domain.trim()) children.push(el("field", { name: "domain" }, [a.domain.trim()]));
    if (a.context.trim()) children.push(el("field", { name: "context" }, [a.context.trim()]));
    children.push(el("field", { name: "help", type: "html" }, [el("p", { class: "o_view_nocontent_smiling_face" }, [`Create the first ${(model.description || "record").toLowerCase()}`])]));
    records.push(el("record", { id: ids.actions.get(a.id)!, model: "ir.actions.act_window" }, children));
  }
  for (const m of orderedMenus(app)) {
    const action = m.actionId ? ids.actions.get(m.actionId) : undefined;
    records.push(el("menuitem", { id: ids.menus.get(m.id)!, name: m.name, parent: m.parentId ? ids.menus.get(m.parentId) : undefined,
      action, sequence: String(m.sequence) }));
  }
  return records.length ? xmlFile(records) : null;
}

function accessCsv(app: OdooApp): string {
  const rows = ["id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink"];
  for (const m of app.models.filter((x) => !x.extend)) {
    const t = tableName(m.name);
    rows.push(`access_${t}_user,${m.name}.user,model_${t},base.group_user,1,1,1,1`);
  }
  return rows.join("\n") + "\n";
}

function manifest(app: OdooApp, data: string[]): string {
  const version = app.version.startsWith(app.odooVersion) ? app.version : `${app.odooVersion}.${app.version || "1.0"}`;
  const lines = [
    `    "name": ${py(app.name)},`, ...(app.summary ? [`    "summary": ${py(app.summary)},`] : []), `    "version": ${py(version)},`,
    `    "category": ${py(app.category || "Custom")},`, ...(app.author ? [`    "author": ${py(app.author)},`] : []), `    "license": ${py(app.license || "LGPL-3")},`,
    `    "depends": [${dependencies(app).map(py).join(", ")}],`, '    "data": [', ...data.map((d) => `        ${py(d)},`), "    ],",
    `    "application": ${app.menus.some((m) => m.parentId === null) ? "True" : "False"},`, '    "installable": True,',
  ];
  return `{\n${lines.join("\n")}\n}\n`;
}

/** Every file of the addon, with paths relative to the addon folder. */
export function generateAddon(app: OdooApp): AddonFile[] {
  const files: AddonFile[] = [];
  const data: string[] = [];
  const models = app.models.slice().sort((a, b) => a.name.localeCompare(b.name));
  if (models.some((m) => !m.extend)) { files.push({ path: "security/ir.model.access.csv", content: accessCsv(app) }); data.push("security/ir.model.access.csv"); }
  for (const m of models) {
    if (m.extend) continue;
    const xml = viewsXml(app, m);
    if (xml) { const path = `views/${tableName(m.name)}_views.xml`; files.push({ path, content: xml }); data.push(path); }
  }
  const menus = menusXml(app);
  if (menus) { files.push({ path: "views/menus.xml", content: menus }); data.push("views/menus.xml"); }
  const pyFiles = models.map((m) => ({ path: `models/${tableName(m.name)}.py`, content: modelPy(app, m) }));
  return [
    { path: "__manifest__.py", content: manifest(app, data) },
    { path: "__init__.py", content: models.length ? "from . import models\n" : "" },
    ...(models.length ? [{ path: "models/__init__.py", content: models.map((m) => `from . import ${tableName(m.name)}\n`).join("") }] : []),
    ...pyFiles,
    ...files,
  ];
}
