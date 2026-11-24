// Odoo Studio-style app definition: models, fields, views, actions and menus. vdoo turns it into an addon (generateAddon.ts)
// and derives the ER diagram from it (convert.ts). Everything is plain data so the undo history and .vdoo files can hold it.
/** Short random ids, the same shape as the schema's. */
export const newId = () => crypto.randomUUID().slice(0, 8);

export type OdooVersion = "17.0" | "18.0" | "19.0";
export const ODOO_VERSIONS: OdooVersion[] = ["17.0", "18.0", "19.0"];

export type TType = "char" | "text" | "html" | "integer" | "float" | "monetary" | "boolean" | "date" | "datetime" | "selection"
  | "many2one" | "one2many" | "many2many" | "binary" | "image";

export const TTYPES: { type: TType; label: string; icon: string }[] = [
  { type: "char", label: "Text", icon: "Aa" }, { type: "text", label: "Multiline text", icon: "¶" }, { type: "html", label: "Rich text", icon: "</>" },
  { type: "integer", label: "Integer", icon: "#" }, { type: "float", label: "Decimal", icon: "0.0" }, { type: "monetary", label: "Monetary", icon: "$" },
  { type: "boolean", label: "Checkbox", icon: "☑" }, { type: "date", label: "Date", icon: "📅" }, { type: "datetime", label: "Date & time", icon: "🕒" },
  { type: "selection", label: "Selection", icon: "▾" }, { type: "many2one", label: "Many2one", icon: "→" }, { type: "one2many", label: "One2many", icon: "⇉" },
  { type: "many2many", label: "Many2many", icon: "⇄" }, { type: "binary", label: "File", icon: "📎" }, { type: "image", label: "Image", icon: "🖼" },
];
export const ttypeLabel = (t: TType) => TTYPES.find((x) => x.type === t)?.label ?? t;
export const isRelational = (t: TType) => t === "many2one" || t === "one2many" || t === "many2many";
export const isNumeric = (t: TType) => t === "integer" || t === "float" || t === "monetary";
/** Fields a view can group by (kanban columns, pivot rows, graph axes, search group-bys). */
export const isGroupable = (t: TType) => !["one2many", "many2many", "text", "html", "binary", "image"].includes(t);
export const isDate = (t: TType) => t === "date" || t === "datetime";

export type OnDelete = "set null" | "restrict" | "cascade";

export interface OdooField {
  id: string;
  name: string;
  /** The label users see. */
  string: string;
  ttype: TType;
  required: boolean;
  readonly: boolean;
  index: boolean;
  tracking: boolean;
  help: string;
  /** A literal default: text for char/selection, a number, "true"/"false", or "today"/"now" for dates. Empty for none. */
  default: string;
  /** Selection values as [key, label]. */
  selection: [string, string][];
  /** The related model's technical name, for relational fields. */
  comodel: string;
  /** For one2many: the many2one field on the comodel that points back. */
  inverseName: string;
  ondelete: OnDelete;
  /** For monetary: the many2one to res.currency. */
  currencyField: string;
}

export interface OdooModel {
  id: string;
  /** Technical name, e.g. "x_vendor.request". */
  name: string;
  description: string;
  /** True when this extends an existing model (only `_inherit`, new fields added to it). */
  extend: boolean;
  /** Adds mail.thread and mail.activity.mixin: chatter, followers and field tracking. */
  chatter: boolean;
  order: string;
  /** The field shown as the record's name; empty means "name". */
  recName: string;
  fields: OdooField[];
}

// ── Views ──────────────────────────────────────────────────────────────────────────────
/** Odoo 17+ modifiers: Python expressions over the record's fields. "" means never, "True" always. */
export interface Modifiers { invisible: string; readonly: string; required: string }

export interface FieldNode extends Modifiers { id: string; kind: "field"; fieldId: string; string: string; widget: string; placeholder: string; nolabel: boolean }
export interface GroupNode { id: string; kind: "group"; string: string; invisible: string; children: FormNode[] }
export interface PageNode { id: string; kind: "page"; string: string; invisible: string; children: FormNode[] }
export interface NotebookNode { id: string; kind: "notebook"; pages: PageNode[] }
export interface SeparatorNode { id: string; kind: "separator"; string: string }
export type FormNode = FieldNode | GroupNode | NotebookNode | SeparatorNode;
/** Anything that holds a list of form nodes: the sheet itself, a group, or a notebook page. */
export type Container = { id: string; children: FormNode[] };

/** A header button. With `setField` set it writes that value, the common case for approval steps. */
export interface ButtonNode { id: string; string: string; method: string; primary: boolean; invisible: string; confirm: string; setField: { fieldId: string; value: string } | null }
/** A smart button in the button box: counts and opens the records of a one2many field. */
export interface SmartButton { id: string; string: string; icon: string; fieldId: string }

export interface FormArch {
  /** A selection field shown as a status bar in the header, or "". */
  statusbarFieldId: string;
  buttons: ButtonNode[];
  smartButtons: SmartButton[];
  /** The field shown as the big title at the top of the sheet, or "". */
  titleFieldId: string;
  body: FormNode[];
}

export interface ListColumn extends Modifiers { id: string; fieldId: string; string: string; widget: string; optional: "" | "show" | "hide"; sum: boolean }
export type Decoration = "danger" | "warning" | "success" | "info" | "muted" | "bf";
export const DECORATIONS: Decoration[] = ["danger", "warning", "success", "info", "muted", "bf"];
export interface ListArch { editable: "" | "top" | "bottom"; columns: ListColumn[]; decorations: Partial<Record<Decoration, string>> }

/** A kanban card: the title, a few field lines, and an optional footer with tags, priority stars and the assignee's avatar. */
export interface KanbanCardField { id: string; fieldId: string; widget: string }
export interface KanbanArch {
  /** The selection or many2one field the columns come from, or "". */
  groupByFieldId: string;
  /** Show a column for every value, even empty ones (group_expand on the field). */
  expandGroups: boolean;
  titleFieldId: string;
  cardFields: KanbanCardField[];
  tagsFieldId: string;
  avatarFieldId: string;
  priorityFieldId: string;
  quickCreate: boolean;
}

export type CalendarMode = "day" | "week" | "month" | "year";
export const CALENDAR_MODES: CalendarMode[] = ["day", "week", "month", "year"];
export interface CalendarArch {
  dateStartFieldId: string;
  dateStopFieldId: string;
  allDayFieldId: string;
  colorFieldId: string;
  mode: CalendarMode;
  quickCreate: boolean;
  /** Shown in the popover when an event is clicked. */
  popoverFieldIds: string[];
}

/** No measures means the record count. */
export interface PivotArch { rowFieldIds: string[]; colFieldIds: string[]; measureFieldIds: string[] }

export type GraphChart = "bar" | "line" | "pie";
export const GRAPH_CHARTS: GraphChart[] = ["bar", "line", "pie"];
/** An empty measure means the record count. */
export interface GraphArch { chart: GraphChart; stacked: boolean; groupFieldIds: string[]; measureFieldId: string }

/** A predefined filter: a condition (an Odoo expression, written as a domain in the addon) or a date field's period filter. */
export interface SearchFilter { id: string; label: string; kind: "condition" | "date"; expr: string; dateFieldId: string }
export interface SearchArch { fieldIds: string[]; filters: SearchFilter[]; groupByFieldIds: string[] }

type ViewOf<T extends string, A> = { id: string; modelId: string; type: T; arch: A };
export type OdooView = ViewOf<"form", FormArch> | ViewOf<"list", ListArch> | ViewOf<"kanban", KanbanArch> | ViewOf<"calendar", CalendarArch>
  | ViewOf<"pivot", PivotArch> | ViewOf<"graph", GraphArch> | ViewOf<"search", SearchArch>;
export type ViewType = OdooView["type"];
/** The views an action can open (the search view is used by all of them, not opened). */
export type ViewMode = Exclude<ViewType, "search">;
/** Every view type, in the order Studio lists them. */
export const VIEW_TYPES: { type: ViewType; label: string; icon: string }[] = [
  { type: "form", label: "Form", icon: "▤" }, { type: "list", label: "List", icon: "☰" }, { type: "kanban", label: "Kanban", icon: "▥" },
  { type: "calendar", label: "Calendar", icon: "📅" }, { type: "pivot", label: "Pivot", icon: "▦" }, { type: "graph", label: "Graph", icon: "📊" },
  { type: "search", label: "Search", icon: "🔍" },
];
export const VIEW_MODES = VIEW_TYPES.map((v) => v.type).filter((t): t is ViewMode => t !== "search");
export const isViewMode = (t: string): t is ViewMode => (VIEW_MODES as string[]).includes(t);
export const viewLabel = (t: ViewType) => VIEW_TYPES.find((v) => v.type === t)?.label ?? t;
/** View types Odoo can't build a default for: an action that opens one needs the view to exist. */
export const NEEDS_VIEW: ViewMode[] = ["kanban", "calendar"];

export interface WindowAction { id: string; name: string; modelId: string; viewModes: ViewMode[]; domain: string; context: string }
export interface OdooMenu { id: string; name: string; parentId: string | null; actionId: string | null; sequence: number }

export interface OdooApp {
  /** The addon's folder name, e.g. "x_vendor". */
  technicalName: string;
  name: string;
  summary: string;
  version: string;
  odooVersion: OdooVersion;
  category: string;
  author: string;
  license: string;
  /** Extra modules to depend on; base, and mail when a model has a chatter, are added automatically. */
  depends: string[];
  models: OdooModel[];
  views: OdooView[];
  actions: WindowAction[];
  menus: OdooMenu[];
}

// ── Construction ─────────────────────────────────────────────────────────────────────────
export const MODEL_NAME = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;
export const FIELD_NAME = /^[a-z_][a-z0-9_]*$/;
export const MODULE_NAME = /^[a-z][a-z0-9_]*$/;
/** Columns the ORM adds to every model: a field can't take these names. */
export const MAGIC_FIELDS = ["id", "create_uid", "create_date", "write_uid", "write_date", "display_name", "__last_update"];

export const slug = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "x";
export const titleCase = (name: string) => name.replace(/_ids?$/, "").split(/[_.]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

export function newField(partial: Partial<OdooField> = {}): OdooField {
  const ttype = partial.ttype ?? "char";
  return {
    id: newId(), name: "x_field", string: "", ttype, required: false, readonly: false, index: false, tracking: false, help: "", default: "",
    selection: ttype === "selection" ? [["draft", "Draft"], ["done", "Done"]] : [],
    comodel: ttype === "many2one" || ttype === "many2many" ? "res.partner" : "", inverseName: "", ondelete: "set null",
    currencyField: ttype === "monetary" ? "currency_id" : "",
    ...partial,
  };
}

const noModifiers = (): Modifiers => ({ invisible: "", readonly: "", required: "" });
export const fieldNode = (fieldId: string, partial: Partial<FieldNode> = {}): FieldNode =>
  ({ id: newId(), kind: "field", fieldId, string: "", widget: "", placeholder: "", nolabel: false, ...noModifiers(), ...partial });
export const groupNode = (children: FormNode[] = [], string = ""): GroupNode => ({ id: newId(), kind: "group", string, invisible: "", children });
export const pageNode = (string = "Page", children: FormNode[] = []): PageNode => ({ id: newId(), kind: "page", string, invisible: "", children });
export const notebookNode = (pages: PageNode[] = [pageNode()]): NotebookNode => ({ id: newId(), kind: "notebook", pages });
export const separatorNode = (string = ""): SeparatorNode => ({ id: newId(), kind: "separator", string });
export const listColumn = (fieldId: string, partial: Partial<ListColumn> = {}): ListColumn =>
  ({ id: newId(), fieldId, string: "", widget: "", optional: "", sum: false, ...noModifiers(), ...partial });
export const buttonNode = (partial: Partial<ButtonNode> = {}): ButtonNode =>
  ({ id: newId(), string: "Confirm", method: "action_confirm", primary: true, invisible: "", confirm: "", setField: null, ...partial });

/** A form with the title field on top and the other fields in two columns; x2many fields get a tab each. */
export function defaultForm(model: OdooModel): FormArch {
  const title = model.fields.find((f) => f.name === (model.recName || "name") && f.ttype === "char");
  const status = model.fields.find((f) => f.name === "state" && f.ttype === "selection");
  const simple = model.fields.filter((f) => f !== title && f !== status && f.ttype !== "one2many" && f.ttype !== "many2many" && f.ttype !== "html");
  const half = Math.ceil(simple.length / 2);
  const body: FormNode[] = [];
  if (simple.length) body.push(groupNode([groupNode(simple.slice(0, half).map((f) => fieldNode(f.id))), groupNode(simple.slice(half).map((f) => fieldNode(f.id)))]));
  const wide = model.fields.filter((f) => f.ttype === "one2many" || f.ttype === "many2many" || f.ttype === "html");
  if (wide.length) body.push(notebookNode(wide.map((f) => pageNode(f.string || titleCase(f.name), [fieldNode(f.id, { nolabel: true })]))));
  return { statusbarFieldId: status?.id ?? "", buttons: [], smartButtons: [], titleFieldId: title?.id ?? "", body };
}

export function defaultList(model: OdooModel): ListArch {
  const columns = model.fields.filter((f) => !["one2many", "many2many", "html", "text", "binary", "image"].includes(f.ttype)).slice(0, 8)
    .map((f) => listColumn(f.id, f.name === "state" ? { widget: "badge" } : {}));
  return { editable: "", columns, decorations: {} };
}

export const kanbanCardField = (fieldId: string, widget = ""): KanbanCardField => ({ id: newId(), fieldId, widget });

export function defaultKanban(model: OdooModel): KanbanArch {
  const f = model.fields;
  const group = f.find((x) => x.name === "state" && x.ttype === "selection") ?? f.find((x) => x.ttype === "many2one" && /stage/.test(x.name))
    ?? f.find((x) => x.ttype === "selection" && x.name !== "priority");
  const title = f.find((x) => x.id === model.recName) ?? f.find((x) => x.name === "name") ?? f.find((x) => x.ttype === "char");
  const tags = f.find((x) => x.ttype === "many2many");
  const avatar = f.find((x) => x.ttype === "many2one" && x.comodel === "res.users");
  const priority = f.find((x) => x.ttype === "selection" && x.name === "priority");
  const used = new Set([group, title, tags, avatar, priority].map((x) => x?.id));
  const cardFields = f.filter((x) => !used.has(x.id) && ["char", "many2one", "date", "datetime", "monetary", "float", "integer", "selection"].includes(x.ttype))
    .slice(0, 3).map((x) => kanbanCardField(x.id));
  return { groupByFieldId: group?.id ?? "", expandGroups: group?.ttype === "selection", titleFieldId: title?.id ?? "", cardFields,
    tagsFieldId: tags?.id ?? "", avatarFieldId: avatar?.id ?? "", priorityFieldId: priority?.id ?? "", quickCreate: true };
}

export function defaultCalendar(model: OdooModel): CalendarArch {
  const f = model.fields;
  const start = f.find((x) => isDate(x.ttype) && /start|begin|from/.test(x.name)) ?? f.find((x) => isDate(x.ttype));
  const stop = f.find((x) => x.id !== start?.id && x.ttype === start?.ttype && /end|stop|to|deadline/.test(x.name));
  const color = f.find((x) => x.ttype === "many2one" && x.comodel === "res.users") ?? f.find((x) => x.ttype === "selection");
  const popover = f.filter((x) => x.id !== start?.id && x.id !== stop?.id && ["char", "many2one", "selection", "monetary"].includes(x.ttype)).slice(0, 3);
  return { dateStartFieldId: start?.id ?? "", dateStopFieldId: stop?.id ?? "", allDayFieldId: "", colorFieldId: color?.id ?? "", mode: "month",
    quickCreate: false, popoverFieldIds: popover.map((x) => x.id) };
}

const firstGroup = (model: OdooModel) => model.fields.find((x) => x.ttype === "selection") ?? model.fields.find((x) => x.ttype === "many2one");

export function defaultPivot(model: OdooModel): PivotArch {
  const row = firstGroup(model), col = model.fields.find((x) => isDate(x.ttype)), measure = model.fields.find((x) => isNumeric(x.ttype));
  return { rowFieldIds: row ? [row.id] : [], colFieldIds: col ? [col.id] : [], measureFieldIds: measure ? [measure.id] : [] };
}

export function defaultGraph(model: OdooModel): GraphArch {
  const group = firstGroup(model) ?? model.fields.find((x) => isDate(x.ttype)), measure = model.fields.find((x) => isNumeric(x.ttype));
  return { chart: "bar", stacked: false, groupFieldIds: group ? [group.id] : [], measureFieldId: measure?.id ?? "" };
}

/** The search view vdoo writes when a model has none of its own: the list's text-like columns and up to four group-bys. */
export function defaultSearch(model: OdooModel, list?: ListArch): SearchArch {
  const shown = (list?.columns ?? []).map((c) => fieldById(model, c.fieldId)).filter((f): f is OdooField => !!f);
  const fieldIds = (shown.length ? shown : model.fields).filter((f) => ["char", "text", "many2one", "selection"].includes(f.ttype)).slice(0, 6).map((f) => f.id);
  const groupByFieldIds = model.fields.filter((f) => f.ttype === "selection" || f.ttype === "many2one").slice(0, 4).map((f) => f.id);
  return { fieldIds, filters: [], groupByFieldIds };
}

export const searchFilter = (partial: Partial<SearchFilter> = {}): SearchFilter =>
  ({ id: newId(), label: "New filter", kind: "condition", expr: "", dateFieldId: "", ...partial });

/** A new view of `type` with a starting layout drawn from the model's fields. */
export function defaultView(app: OdooApp, model: OdooModel, type: ViewType): OdooView {
  const id = newId(), modelId = model.id;
  switch (type) {
    case "form": return { id, modelId, type, arch: defaultForm(model) };
    case "list": return { id, modelId, type, arch: defaultList(model) };
    case "kanban": return { id, modelId, type, arch: defaultKanban(model) };
    case "calendar": return { id, modelId, type, arch: defaultCalendar(model) };
    case "pivot": return { id, modelId, type, arch: defaultPivot(model) };
    case "graph": return { id, modelId, type, arch: defaultGraph(model) };
    case "search": return { id, modelId, type, arch: defaultSearch(model, viewOf(app, model.id, "list")?.arch) };
  }
}

/** Adds a view of `type` to the model (if it has none) and lets the model's actions open it. */
export function addView(app: OdooApp, modelId: string, type: ViewType): OdooApp {
  const model = modelById(app, modelId);
  if (!model || viewOf(app, modelId, type)) return app;
  const next = { ...app, views: [...app.views, defaultView(app, model, type)] };
  if (!isViewMode(type)) return next;
  return { ...next, actions: next.actions.map((a) => (a.modelId === modelId && !a.viewModes.includes(type) ? { ...a, viewModes: [...a.viewModes, type] } : a)) };
}

/** Removes a view, and its type from the actions of its model. */
export function removeView(app: OdooApp, viewId: string): OdooApp {
  const view = app.views.find((v) => v.id === viewId);
  if (!view) return app;
  return { ...app, views: app.views.filter((v) => v.id !== viewId),
    actions: app.actions.map((a) => (a.modelId === view.modelId ? { ...a, viewModes: a.viewModes.filter((m) => m !== view.type) } : a)) };
}

/** A new model with a name field, its form and list views, an action and a menu under the app's root menu. */
export function addModel(app: OdooApp, description: string, name?: string): { app: OdooApp; model: OdooModel } {
  const base = name ?? `${app.technicalName}.${slug(description)}`;
  let modelName = base, n = 1;
  while (app.models.some((m) => m.name === modelName)) modelName = `${base}_${++n}`;
  const model: OdooModel = { id: newId(), name: modelName, description, extend: false, chatter: false, order: "", recName: "",
    fields: [newField({ name: "name", string: "Name", required: true })] };
  const action: WindowAction = { id: newId(), name: description, modelId: model.id, viewModes: ["list", "form"], domain: "", context: "" };
  const root = app.menus.find((m) => m.parentId === null);
  const menus = [...app.menus];
  let rootId = root?.id;
  if (!rootId) { rootId = newId(); menus.push({ id: rootId, name: app.name, parentId: null, actionId: action.id, sequence: 10 }); }
  const siblings = menus.filter((m) => m.parentId === rootId);
  menus.push({ id: newId(), name: description, parentId: rootId, actionId: action.id, sequence: 10 * (siblings.length + 1) });
  const views: OdooView[] = [{ id: newId(), modelId: model.id, type: "form", arch: defaultForm(model) },
    { id: newId(), modelId: model.id, type: "list", arch: defaultList(model) }];
  return { app: { ...app, models: [...app.models, model], views: [...app.views, ...views], actions: [...app.actions, action], menus }, model };
}

/** A new app, like Studio's "New app": a root menu and a first model. */
export function newApp(name: string, firstModel = name, odooVersion: OdooVersion = "19.0"): OdooApp {
  const technicalName = `x_${slug(name)}`;
  const empty: OdooApp = { technicalName, name, summary: "", version: "1.0", odooVersion, category: "Custom", author: "", license: "LGPL-3",
    depends: [], models: [], views: [], actions: [], menus: [] };
  return addModel(empty, firstModel).app;
}

// ── Lookups and edits ────────────────────────────────────────────────────────────────────
export const modelById = (app: OdooApp, id: string) => app.models.find((m) => m.id === id);
export const modelByName = (app: OdooApp, name: string) => app.models.find((m) => m.name === name);
export const fieldById = (model: OdooModel | undefined, id: string) => model?.fields.find((f) => f.id === id);
export const viewOf = <T extends ViewType>(app: OdooApp, modelId: string, type: T) =>
  app.views.find((v) => v.modelId === modelId && v.type === type) as Extract<OdooView, { type: T }> | undefined;

export function replaceModel(app: OdooApp, model: OdooModel): OdooApp {
  const old = modelById(app, model.id);
  let models = app.models.map((m) => (m.id === model.id ? model : m));
  // A renamed model keeps the relational fields that point at it.
  if (old && old.name !== model.name)
    models = models.map((m) => ({ ...m, fields: m.fields.map((f) => (f.comodel === old.name ? { ...f, comodel: model.name } : f)) }));
  return { ...app, models };
}

/** Replaces one field. A rename is carried into the conditions and decorations that mention it. */
export function replaceField(app: OdooApp, modelId: string, field: OdooField): OdooApp {
  const model = modelById(app, modelId);
  if (!model) return app;
  const old = fieldById(model, field.id);
  let next = replaceModel(app, { ...model, fields: model.fields.map((f) => (f.id === field.id ? field : f)) });
  if (old && old.name !== field.name) next = mapExpressions(next, modelId, (e) => renameInExpression(e, old.name, field.name));
  if (old && old.name !== field.name) // one2many fields elsewhere that use it as their inverse
    next = { ...next, models: next.models.map((m) => ({ ...m, fields: m.fields.map((f) =>
      f.ttype === "one2many" && f.comodel === model.name && f.inverseName === old.name ? { ...f, inverseName: field.name } : f) })) };
  return next;
}

export function addField(app: OdooApp, modelId: string, field: OdooField): OdooApp {
  const model = modelById(app, modelId);
  return model ? replaceModel(app, { ...model, fields: [...model.fields, field] }) : app;
}

/** Removes a field and every view element that shows it. */
export function removeField(app: OdooApp, modelId: string, fieldId: string): OdooApp {
  const model = modelById(app, modelId);
  if (!model) return app;
  const next = replaceModel(app, { ...model, fields: model.fields.filter((f) => f.id !== fieldId) });
  return { ...next, views: next.views.map((v): OdooView => {
    if (v.modelId !== modelId) return v;
    const clear = (id: string) => (id === fieldId ? "" : id);
    const keep = (ids: string[]) => ids.filter((id) => id !== fieldId);
    if (v.type === "list") return { ...v, arch: { ...v.arch, columns: v.arch.columns.filter((c) => c.fieldId !== fieldId) } };
    if (v.type === "kanban") { const k = v.arch; return { ...v, arch: { ...k, groupByFieldId: clear(k.groupByFieldId), titleFieldId: clear(k.titleFieldId),
      tagsFieldId: clear(k.tagsFieldId), avatarFieldId: clear(k.avatarFieldId), priorityFieldId: clear(k.priorityFieldId),
      expandGroups: k.groupByFieldId === fieldId ? false : k.expandGroups, cardFields: k.cardFields.filter((c) => c.fieldId !== fieldId) } }; }
    if (v.type === "calendar") { const c = v.arch; return { ...v, arch: { ...c, dateStartFieldId: clear(c.dateStartFieldId), dateStopFieldId: clear(c.dateStopFieldId),
      allDayFieldId: clear(c.allDayFieldId), colorFieldId: clear(c.colorFieldId), popoverFieldIds: keep(c.popoverFieldIds) } }; }
    if (v.type === "pivot") return { ...v, arch: { rowFieldIds: keep(v.arch.rowFieldIds), colFieldIds: keep(v.arch.colFieldIds), measureFieldIds: keep(v.arch.measureFieldIds) } };
    if (v.type === "graph") return { ...v, arch: { ...v.arch, groupFieldIds: keep(v.arch.groupFieldIds), measureFieldId: clear(v.arch.measureFieldId) } };
    if (v.type === "search") return { ...v, arch: { ...v.arch, fieldIds: keep(v.arch.fieldIds), groupByFieldIds: keep(v.arch.groupByFieldIds),
      filters: v.arch.filters.filter((f) => !(f.kind === "date" && f.dateFieldId === fieldId)) } };
    const a = v.arch;
    return { ...v, arch: { ...a, statusbarFieldId: a.statusbarFieldId === fieldId ? "" : a.statusbarFieldId, titleFieldId: a.titleFieldId === fieldId ? "" : a.titleFieldId,
      smartButtons: a.smartButtons.filter((s) => s.fieldId !== fieldId),
      buttons: a.buttons.map((b) => (b.setField?.fieldId === fieldId ? { ...b, setField: null } : b)),
      body: filterNodes(a.body, (n) => !(n.kind === "field" && n.fieldId === fieldId)) } };
  }) };
}

/** Removes a model with its views, actions and the menus that open it. */
export function removeModel(app: OdooApp, modelId: string): OdooApp {
  const actions = app.actions.filter((a) => a.modelId === modelId).map((a) => a.id);
  return { ...app, models: app.models.filter((m) => m.id !== modelId), views: app.views.filter((v) => v.modelId !== modelId),
    actions: app.actions.filter((a) => a.modelId !== modelId),
    menus: app.menus.filter((m) => !(m.actionId && actions.includes(m.actionId) && m.parentId !== null))
      .map((m) => (m.actionId && actions.includes(m.actionId) ? { ...m, actionId: null } : m)) };
}

export function replaceView(app: OdooApp, view: OdooView): OdooApp {
  const exists = app.views.some((v) => v.id === view.id);
  return { ...app, views: exists ? app.views.map((v) => (v.id === view.id ? view : v)) : [...app.views, view] };
}

// ── Form tree helpers ────────────────────────────────────────────────────────────────────
export const BODY = "body";

/** Every container in the form (the body, groups, pages), for drop targets and lookups. */
export function containers(body: FormNode[]): Container[] {
  const out: Container[] = [{ id: BODY, children: body }];
  const walk = (nodes: FormNode[]) => nodes.forEach((n) => {
    if (n.kind === "group") { out.push(n); walk(n.children); }
    if (n.kind === "notebook") n.pages.forEach((p) => { out.push(p); walk(p.children); });
  });
  walk(body);
  return out;
}

/** Applies `fn` to every list of children, depth first. */
function mapChildren(nodes: FormNode[], fn: (children: FormNode[], containerId: string) => FormNode[], containerId = BODY): FormNode[] {
  const inner = nodes.map((n): FormNode => {
    if (n.kind === "group") return { ...n, children: mapChildren(n.children, fn, n.id) };
    if (n.kind === "notebook") return { ...n, pages: n.pages.map((p) => ({ ...p, children: mapChildren(p.children, fn, p.id) })) };
    return n;
  });
  return fn(inner, containerId);
}

export const filterNodes = (body: FormNode[], keep: (n: FormNode) => boolean) => mapChildren(body, (children) => children.filter(keep));

export function findNode(body: FormNode[], id: string): FormNode | PageNode | undefined {
  for (const n of body) {
    if (n.id === id) return n;
    if (n.kind === "group") { const found = findNode(n.children, id); if (found) return found; }
    if (n.kind === "notebook") for (const p of n.pages) { if (p.id === id) return p; const found = findNode(p.children, id); if (found) return found; }
  }
  return undefined;
}

/** True when `id` is `ancestorId` or lies inside it, so a group can't be dropped into itself. */
export function isWithin(body: FormNode[], ancestorId: string, id: string): boolean {
  if (ancestorId === id) return true;
  const ancestor = findNode(body, ancestorId);
  if (!ancestor) return false;
  const inner = ancestor.kind === "group" || ancestor.kind === "page" ? ancestor.children : ancestor.kind === "notebook" ? ancestor.pages.flatMap((p) => p.children) : [];
  return !!findNode(inner, id) || (ancestor.kind === "notebook" && ancestor.pages.some((p) => p.id === id));
}

/** Removes the node or notebook page with this id, wherever it is. */
export function removeNode(body: FormNode[], id: string): FormNode[] {
  const walk = (nodes: FormNode[]): FormNode[] => nodes.filter((n) => n.id !== id).map((n): FormNode =>
    n.kind === "group" ? { ...n, children: walk(n.children) }
      : n.kind === "notebook" ? { ...n, pages: n.pages.filter((p) => p.id !== id).map((p) => ({ ...p, children: walk(p.children) })) } : n);
  return walk(body);
}

export function insertNode(body: FormNode[], containerId: string, index: number, node: FormNode): FormNode[] {
  return mapChildren(body, (children, id) => {
    if (id !== containerId) return children;
    const next = children.slice();
    next.splice(Math.max(0, Math.min(index, next.length)), 0, node);
    return next;
  });
}

/** Moves a node to `index` in `containerId`. Index counts positions before the node is taken out. */
export function moveNode(body: FormNode[], id: string, containerId: string, index: number): FormNode[] {
  const node = findNode(body, id);
  if (!node || node.kind === "page" || isWithin(body, id, containerId)) return body;
  const from = containers(body).find((c) => c.children.some((n) => n.id === id));
  const at = from?.id === containerId ? from.children.findIndex((n) => n.id === id) : -1;
  return insertNode(removeNode(body, id), containerId, at >= 0 && at < index ? index - 1 : index, node);
}

export function updateNode(body: FormNode[], id: string, patch: Partial<FormNode> | Partial<PageNode>): FormNode[] {
  const walk = (nodes: FormNode[]): FormNode[] => nodes.map((n): FormNode => {
    if (n.id === id) return { ...n, ...patch } as FormNode;
    if (n.kind === "group") return { ...n, children: walk(n.children) };
    if (n.kind === "notebook") return { ...n, pages: n.pages.map((p) => (p.id === id ? { ...p, ...patch } as PageNode : { ...p, children: walk(p.children) })) };
    return n;
  });
  return walk(body);
}

/** Every field node in the form, in document order. */
export function formFieldNodes(body: FormNode[]): FieldNode[] {
  const out: FieldNode[] = [];
  const walk = (nodes: FormNode[]) => nodes.forEach((n) => {
    if (n.kind === "field") out.push(n);
    if (n.kind === "group") walk(n.children);
    if (n.kind === "notebook") n.pages.forEach((p) => walk(p.children));
  });
  walk(body);
  return out;
}

// ── Expressions ──────────────────────────────────────────────────────────────────────────
const KEYWORDS = new Set(["and", "or", "not", "in", "is", "True", "False", "None", "context", "parent", "uid", "id", "today", "now"]);

/** The field names an expression reads (identifiers outside string literals that aren't attributes or keywords). */
export function expressionNames(expr: string): string[] {
  const names = new Set<string>();
  const code = expr.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, "''");
  for (const m of code.matchAll(/(?<![.\w])([A-Za-z_]\w*)/g)) if (!KEYWORDS.has(m[1])) names.add(m[1]);
  return [...names];
}

export function renameInExpression(expr: string, from: string, to: string): string {
  if (!expr) return expr;
  return expr.split(/('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/).map((part, i) =>
    i % 2 ? part : part.replace(new RegExp(`(?<![.\\w])${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\w)`, "g"), to)).join("");
}

/** Applies `fn` to every modifier and decoration in the views of one model. */
export function mapExpressions(app: OdooApp, modelId: string, fn: (expr: string) => string): OdooApp {
  const mods = <T extends Partial<Modifiers>>(n: T): T => ({ ...n, ...(n.invisible !== undefined ? { invisible: fn(n.invisible) } : {}),
    ...(n.readonly !== undefined ? { readonly: fn(n.readonly) } : {}), ...(n.required !== undefined ? { required: fn(n.required) } : {}) });
  const walk = (nodes: FormNode[]): FormNode[] => nodes.map((n): FormNode =>
    n.kind === "field" ? mods(n) : n.kind === "group" ? { ...n, invisible: fn(n.invisible), children: walk(n.children) }
      : n.kind === "notebook" ? { ...n, pages: n.pages.map((p) => ({ ...p, invisible: fn(p.invisible), children: walk(p.children) })) } : n);
  return { ...app, views: app.views.map((v): OdooView => {
    if (v.modelId !== modelId) return v;
    if (v.type === "list") return { ...v, arch: { ...v.arch, columns: v.arch.columns.map(mods),
      decorations: Object.fromEntries(Object.entries(v.arch.decorations).map(([k, e]) => [k, fn(e ?? "")])) } };
    if (v.type === "search") return { ...v, arch: { ...v.arch, filters: v.arch.filters.map((f) => ({ ...f, expr: fn(f.expr) })) } };
    if (v.type !== "form") return v;
    return { ...v, arch: { ...v.arch, body: walk(v.arch.body), buttons: v.arch.buttons.map((b) => ({ ...b, invisible: fn(b.invisible) })) } };
  }) };
}
