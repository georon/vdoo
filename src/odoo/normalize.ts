// Reads the `odoo` part of a .vdoo file defensively: unknown keys are dropped, missing ones get defaults, so a hand-edited
// or older file never crashes the designer.
import {
  type ButtonNode, type CalendarArch, type CalendarMode, type Decoration, type FormArch, type GraphArch, type GraphChart, type KanbanArch, type PivotArch,
  type SearchArch, type SearchFilter, CALENDAR_MODES, GRAPH_CHARTS, isViewMode, type FormNode, type ListArch, type ListColumn, type OdooApp, type OdooField, type OdooMenu,
  type OdooModel, type OdooView, type PageNode, type SmartButton, type TType, type WindowAction, DECORATIONS, ODOO_VERSIONS, TTYPES, newId,
} from "./studioModel";

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? v as Raw : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const bool = (v: unknown) => v === true;
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const TYPES = new Set(TTYPES.map((t) => t.type));

function field(v: unknown): OdooField {
  const r = obj(v);
  const ttype = (TYPES.has(r.ttype as TType) ? r.ttype : "char") as TType;
  return {
    id: str(r.id, newId()), name: str(r.name, "x_field"), string: str(r.string), ttype, required: bool(r.required), readonly: bool(r.readonly),
    index: bool(r.index), tracking: bool(r.tracking), help: str(r.help), default: str(r.default),
    selection: arr(r.selection).filter((p): p is [string, string] => Array.isArray(p) && typeof p[0] === "string" && typeof p[1] === "string").map(([k, l]) => [k, l]),
    comodel: str(r.comodel), inverseName: str(r.inverseName),
    ondelete: r.ondelete === "restrict" || r.ondelete === "cascade" ? r.ondelete : "set null", currencyField: str(r.currencyField),
  };
}

function model(v: unknown): OdooModel {
  const r = obj(v);
  return { id: str(r.id, newId()), name: str(r.name, "x_model"), description: str(r.description), extend: bool(r.extend), chatter: bool(r.chatter),
    order: str(r.order), recName: str(r.recName), fields: arr(r.fields).map(field) };
}

const mods = (r: Raw) => ({ invisible: str(r.invisible), readonly: str(r.readonly), required: str(r.required) });

function page(v: unknown): PageNode {
  const r = obj(v);
  return { id: str(r.id, newId()), kind: "page", string: str(r.string, "Page"), invisible: str(r.invisible), children: nodes(r.children) };
}
function nodes(v: unknown): FormNode[] {
  return arr(v).flatMap((x): FormNode[] => {
    const r = obj(x), id = str(r.id, newId());
    switch (r.kind) {
      case "field": return [{ id, kind: "field", fieldId: str(r.fieldId), string: str(r.string), widget: str(r.widget), placeholder: str(r.placeholder), nolabel: bool(r.nolabel), ...mods(r) }];
      case "group": return [{ id, kind: "group", string: str(r.string), invisible: str(r.invisible), children: nodes(r.children) }];
      case "notebook": return [{ id, kind: "notebook", pages: arr(r.pages).map(page) }];
      case "separator": return [{ id, kind: "separator", string: str(r.string) }];
      default: return [];
    }
  });
}

function form(v: unknown): FormArch {
  const r = obj(v);
  return {
    statusbarFieldId: str(r.statusbarFieldId), titleFieldId: str(r.titleFieldId), body: nodes(r.body),
    buttons: arr(r.buttons).map((x): ButtonNode => {
      const b = obj(x), sf = obj(b.setField);
      return { id: str(b.id, newId()), string: str(b.string, "Button"), method: str(b.method), primary: bool(b.primary), invisible: str(b.invisible), confirm: str(b.confirm),
        setField: typeof sf.fieldId === "string" ? { fieldId: sf.fieldId, value: str(sf.value) } : null };
    }),
    smartButtons: arr(r.smartButtons).map((x): SmartButton => { const s = obj(x); return { id: str(s.id, newId()), string: str(s.string), icon: str(s.icon, "fa-list"), fieldId: str(s.fieldId) }; }),
  };
}

function list(v: unknown): ListArch {
  const r = obj(v), deco = obj(r.decorations);
  return {
    editable: r.editable === "top" || r.editable === "bottom" ? r.editable : "",
    columns: arr(r.columns).map((x): ListColumn => { const c = obj(x); return { id: str(c.id, newId()), fieldId: str(c.fieldId), string: str(c.string), widget: str(c.widget),
      optional: c.optional === "show" || c.optional === "hide" ? c.optional : "", sum: bool(c.sum), ...mods(c) }; }),
    decorations: Object.fromEntries(DECORATIONS.filter((d) => typeof deco[d] === "string" && deco[d]).map((d) => [d, deco[d] as string])) as Partial<Record<Decoration, string>>,
  };
}

const ids = (v: unknown) => arr(v).filter((x): x is string => typeof x === "string");

function kanban(v: unknown): KanbanArch {
  const r = obj(v);
  return { groupByFieldId: str(r.groupByFieldId), expandGroups: bool(r.expandGroups), titleFieldId: str(r.titleFieldId),
    cardFields: arr(r.cardFields).map((x) => { const c = obj(x); return { id: str(c.id, newId()), fieldId: str(c.fieldId), widget: str(c.widget) }; }),
    tagsFieldId: str(r.tagsFieldId), avatarFieldId: str(r.avatarFieldId), priorityFieldId: str(r.priorityFieldId), quickCreate: r.quickCreate !== false };
}

function calendar(v: unknown): CalendarArch {
  const r = obj(v);
  return { dateStartFieldId: str(r.dateStartFieldId), dateStopFieldId: str(r.dateStopFieldId), allDayFieldId: str(r.allDayFieldId), colorFieldId: str(r.colorFieldId),
    mode: CALENDAR_MODES.includes(r.mode as CalendarMode) ? r.mode as CalendarMode : "month", quickCreate: bool(r.quickCreate), popoverFieldIds: ids(r.popoverFieldIds) };
}

function pivot(v: unknown): PivotArch {
  const r = obj(v);
  return { rowFieldIds: ids(r.rowFieldIds), colFieldIds: ids(r.colFieldIds), measureFieldIds: ids(r.measureFieldIds) };
}

function graph(v: unknown): GraphArch {
  const r = obj(v);
  return { chart: GRAPH_CHARTS.includes(r.chart as GraphChart) ? r.chart as GraphChart : "bar", stacked: bool(r.stacked), groupFieldIds: ids(r.groupFieldIds),
    measureFieldId: str(r.measureFieldId) };
}

function search(v: unknown): SearchArch {
  const r = obj(v);
  return { fieldIds: ids(r.fieldIds), groupByFieldIds: ids(r.groupByFieldIds),
    filters: arr(r.filters).map((x): SearchFilter => { const f = obj(x); return { id: str(f.id, newId()), label: str(f.label, "Filter"),
      kind: f.kind === "date" ? "date" : "condition", expr: str(f.expr), dateFieldId: str(f.dateFieldId) }; }) };
}

function view(v: unknown): OdooView[] {
  const r = obj(v), id = str(r.id, newId()), modelId = str(r.modelId);
  switch (r.type) {
    case "form": return [{ id, modelId, type: "form", arch: form(r.arch) }];
    case "list": return [{ id, modelId, type: "list", arch: list(r.arch) }];
    case "kanban": return [{ id, modelId, type: "kanban", arch: kanban(r.arch) }];
    case "calendar": return [{ id, modelId, type: "calendar", arch: calendar(r.arch) }];
    case "pivot": return [{ id, modelId, type: "pivot", arch: pivot(r.arch) }];
    case "graph": return [{ id, modelId, type: "graph", arch: graph(r.arch) }];
    case "search": return [{ id, modelId, type: "search", arch: search(r.arch) }];
    default: return [];
  }
}

/** Null when the value doesn't look like an app at all. */
export function normalizeApp(v: unknown): OdooApp | null {
  const r = obj(v);
  if (!Array.isArray(r.models)) return null;
  return {
    technicalName: str(r.technicalName, "x_app"), name: str(r.name, "App"), summary: str(r.summary), version: str(r.version, "1.0"),
    odooVersion: ODOO_VERSIONS.includes(r.odooVersion as OdooApp["odooVersion"]) ? r.odooVersion as OdooApp["odooVersion"] : "19.0",
    category: str(r.category, "Custom"), author: str(r.author), license: str(r.license, "LGPL-3"),
    depends: arr(r.depends).filter((d): d is string => typeof d === "string"),
    models: arr(r.models).map(model), views: arr(r.views).flatMap(view),
    actions: arr(r.actions).map((x): WindowAction => { const a = obj(x); return { id: str(a.id, newId()), name: str(a.name), modelId: str(a.modelId),
      viewModes: [...new Set(ids(a.viewModes).filter(isViewMode))], domain: str(a.domain), context: str(a.context) }; }),
    menus: arr(r.menus).map((x): OdooMenu => { const m = obj(x); return { id: str(m.id, newId()), name: str(m.name, "Menu"),
      parentId: typeof m.parentId === "string" ? m.parentId : null, actionId: typeof m.actionId === "string" ? m.actionId : null, sequence: num(m.sequence, 10) }; }),
  };
}
