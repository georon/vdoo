// Problems that would stop the generated addon from installing, or make a view misbehave. Shown in Studio and on export.
import {
  type FormNode, type OdooApp, type OdooField, type OdooModel, type OdooView, NEEDS_VIEW, isDate, isGroupable, isNumeric, viewLabel, viewOf, FIELD_NAME, MAGIC_FIELDS, MODEL_NAME, MODULE_NAME, expressionNames, fieldById, formFieldNodes, modelById, modelByName,
} from "./studioModel";
import { smartCountField, smartMethod } from "./generateAddon";
import { conditionToDomain } from "./conditions";

export interface Problem { message: string; modelId?: string; fieldId?: string }

const PY_NAME = /^[a-z_][a-z0-9_]*$/;

export function validateApp(app: OdooApp): Problem[] {
  const out: Problem[] = [];
  const add = (message: string, modelId?: string, fieldId?: string) => out.push({ message, modelId, fieldId });
  if (!MODULE_NAME.test(app.technicalName)) add(`The technical name "${app.technicalName}" may contain only lowercase letters, digits and underscores.`);
  if (!app.name.trim()) add("The app needs a name.");

  const names = new Set<string>();
  for (const m of app.models) {
    if (!MODEL_NAME.test(m.name)) add(`Model "${m.name}": use lowercase letters, digits, underscores and dots, like "${app.technicalName}.request".`, m.id);
    if (names.has(m.name)) add(`More than one model is named "${m.name}".`, m.id);
    names.add(m.name);
    if (!m.extend && !m.description.trim()) add(`Model "${m.name}" needs a description.`, m.id);
    validateFields(app, m, add);
  }

  for (const v of app.views) {
    const m = modelById(app, v.modelId);
    if (!m) { add("A view belongs to a model that no longer exists."); continue; }
    const fieldNames = new Set(m.fields.map((f) => f.name));
    const checkExpr = (expr: string, where: string) => {
      for (const n of expressionNames(expr)) if (!fieldNames.has(n)) add(`${where} in the ${v.type} view of ${m.name} uses "${n}", which is not a field of the model.`, m.id);
      if (/\battrs\b|\bstates\b/.test(expr)) add(`${where}: write the condition as an expression (Odoo 17+), not attrs or states.`, m.id);
    };
    if (v.type === "list") {
      for (const c of v.arch.columns) {
        const f = fieldById(m, c.fieldId);
        if (!f) { add(`A column of the list view of ${m.name} shows a field that no longer exists.`, m.id); continue; }
        checkExpr(c.invisible, `Column "${f.name}" (invisible)`); checkExpr(c.readonly, `Column "${f.name}" (readonly)`); checkExpr(c.required, `Column "${f.name}" (required)`);
      }
      for (const [d, e] of Object.entries(v.arch.decorations)) checkExpr(e ?? "", `Decoration "${d}"`);
      continue;
    }
    if (v.type !== "form") {
      if (["17.0", "18.0"].includes(app.odooVersion)) add(`The ${v.type} view of ${m.name} is written for Odoo 19 and later. Set the app's Odoo version to 19.0.`, m.id);
      validateOtherView(m, v, add);
      continue;
    }
    const a = v.arch;
    if (a.statusbarFieldId && fieldById(m, a.statusbarFieldId)?.ttype !== "selection") add(`The status bar of ${m.name} must show a selection field.`, m.id);
    for (const n of formFieldNodes(a.body)) {
      const f = fieldById(m, n.fieldId);
      if (!f) { add(`The form of ${m.name} shows a field that no longer exists.`, m.id); continue; }
      checkExpr(n.invisible, `Field "${f.name}" (invisible)`); checkExpr(n.readonly, `Field "${f.name}" (readonly)`); checkExpr(n.required, `Field "${f.name}" (required)`);
    }
    const walk = (nodes: FormNode[]) => nodes.forEach((n) => {
      if (n.kind === "group") { checkExpr(n.invisible, `Group "${n.string || "(untitled)"}"`); walk(n.children); }
      if (n.kind === "notebook") n.pages.forEach((p) => { checkExpr(p.invisible, `Tab "${p.string}"`); walk(p.children); });
    });
    walk(a.body);
    const methods = new Set<string>();
    for (const b of a.buttons) {
      if (!PY_NAME.test(b.method)) add(`Button "${b.string}" needs a method name such as action_confirm.`, m.id);
      else if (fieldNames.has(b.method)) add(`Button method "${b.method}" has the same name as a field.`, m.id);
      else if (methods.has(b.method)) { /* the same method on two buttons is fine */ }
      methods.add(b.method);
      checkExpr(b.invisible, `Button "${b.string}" (invisible)`);
      if (b.setField && !fieldById(m, b.setField.fieldId)) add(`Button "${b.string}" sets a field that no longer exists.`, m.id);
    }
    for (const sb of a.smartButtons) {
      const f = fieldById(m, sb.fieldId);
      if (!f || (f.ttype !== "one2many" && f.ttype !== "many2many")) { add(`Smart button "${sb.string}" must open a one2many or many2many field.`, m.id); continue; }
      if (fieldNames.has(smartCountField(f))) add(`Smart button "${sb.string}" needs a field named ${smartCountField(f)}, but the model already has one.`, m.id, f.id);
      if (methods.has(smartMethod(f))) add(`Smart button "${sb.string}" and a header button both use ${smartMethod(f)}.`, m.id);
    }
  }

  for (const a of app.actions) {
    if (!modelById(app, a.modelId)) { add(`Action "${a.name}" opens a model that no longer exists.`); continue; }
    // Odoo builds a default list, form, pivot or graph view when there is none, but not a kanban or calendar.
    for (const mode of a.viewModes) if (NEEDS_VIEW.includes(mode) && !viewOf(app, a.modelId, mode))
      add(`Action "${a.name}" opens a ${mode} view, but ${modelById(app, a.modelId)!.name} has none. Add the view or untick it in Menus & actions.`, a.modelId);
  }
  for (const menu of app.menus) {
    if (menu.parentId && !app.menus.some((m) => m.id === menu.parentId)) add(`Menu "${menu.name}" is under a menu that no longer exists.`);
    if (menu.actionId && !app.actions.some((a) => a.id === menu.actionId)) add(`Menu "${menu.name}" opens an action that no longer exists.`);
    if (!menu.name.trim()) add("A menu needs a name.");
    // a cycle would make the menus unreachable
    let p = menu.parentId, steps = 0;
    while (p && steps++ < app.menus.length + 1) p = app.menus.find((m) => m.id === p)?.parentId ?? null;
    if (p) add(`Menu "${menu.name}" is inside itself.`);
  }
  return out;
}

function validateFields(app: OdooApp, m: OdooModel, add: (message: string, modelId?: string, fieldId?: string) => void) {
  const seen = new Set<string>();
  for (const f of m.fields) {
    const where = `${m.name}.${f.name}`;
    if (!FIELD_NAME.test(f.name)) add(`Field "${where}": use lowercase letters, digits and underscores.`, m.id, f.id);
    if (MAGIC_FIELDS.includes(f.name)) add(`Field "${where}": Odoo adds "${f.name}" to every model by itself.`, m.id, f.id);
    if (seen.has(f.name)) add(`Model ${m.name} has more than one field named "${f.name}".`, m.id, f.id);
    seen.add(f.name);
    if (f.ttype === "selection") {
      if (!f.selection.length) add(`Selection field "${where}" needs at least one value.`, m.id, f.id);
      const keys = f.selection.map(([k]) => k);
      if (new Set(keys).size !== keys.length) add(`Selection field "${where}" has the same value twice.`, m.id, f.id);
      if (keys.some((k) => !k.trim())) add(`Selection field "${where}" has a value without a key.`, m.id, f.id);
    }
    if ((f.ttype === "many2one" || f.ttype === "one2many" || f.ttype === "many2many") && !MODEL_NAME.test(f.comodel))
      add(`Field "${where}" needs the related model, such as res.partner.`, m.id, f.id);
    if (f.ttype === "one2many") {
      if (!f.inverseName) add(`One2many field "${where}" needs the many2one field on ${f.comodel || "the related model"} that points back.`, m.id, f.id);
      const target = modelByName(app, f.comodel);
      const inverse = target?.fields.find((x) => x.name === f.inverseName);
      if (target && f.inverseName && (!inverse || inverse.ttype !== "many2one" || inverse.comodel !== m.name))
        add(`One2many field "${where}" needs ${target.name}.${f.inverseName} to be a many2one to ${m.name}.`, m.id, f.id);
    }
    if (f.ttype === "many2one" && f.ondelete === "set null" && f.required)
      add(`Field "${where}" is required, so deleting the related record can't clear it: choose "restrict" or "cascade".`, m.id, f.id);
    if (f.ttype === "monetary") {
      const cur = m.fields.find((x) => x.name === (f.currencyField || "currency_id"));
      if (!cur || cur.ttype !== "many2one" || cur.comodel !== "res.currency")
        add(`Monetary field "${where}" needs a many2one to res.currency named ${f.currencyField || "currency_id"}.`, m.id, f.id);
    }
    if (f.tracking && !m.chatter && !m.extend) add(`Field "${where}" is tracked, so ${m.name} needs the chatter.`, m.id, f.id);
    if ((f.ttype === "integer" || f.ttype === "float" || f.ttype === "monetary") && f.default.trim() && !/^-?\d+(\.\d+)?$/.test(f.default.trim()))
      add(`Field "${where}" has a default that isn't a number.`, m.id, f.id);
    if (f.ttype === "selection" && f.default.trim() && !f.selection.some(([k]) => k === f.default.trim()))
      add(`Field "${where}" defaults to "${f.default}", which is not one of its values.`, m.id, f.id);
  }
}

type Add = (message: string, modelId?: string, fieldId?: string) => void;

/** Kanban, calendar, pivot, graph and search views: the fields they use must exist and be of a type the view can use. */
function validateOtherView(m: OdooModel, v: Exclude<OdooView, { type: "form" | "list" }>, add: Add) {
  const where = `The ${viewLabel(v.type).toLowerCase()} view of ${m.name}`;
  /** The field, or undefined when unset; reports a field that no longer exists or isn't of an accepted type. */
  const use = (id: string, role: string, ok: (f: OdooField) => boolean, kind: string): OdooField | undefined => {
    if (!id) return undefined;
    const f = fieldById(m, id);
    if (!f) add(`${where} uses a field that no longer exists (${role}).`, m.id);
    else if (!ok(f)) add(`${where}: the ${role} must be ${kind}, but ${f.name} is ${f.ttype}.`, m.id, f.id);
    return f;
  };
  const any = () => true;
  const groupable = (f: OdooField) => isGroupable(f.ttype);
  switch (v.type) {
    case "kanban": {
      const a = v.arch;
      if (!a.titleFieldId) add(`${where} needs a card title.`, m.id);
      use(a.titleFieldId, "card title", any, "");
      use(a.groupByFieldId, "group-by field", (f) => f.ttype === "selection" || f.ttype === "many2one", "a selection or many2one");
      use(a.tagsFieldId, "tags field", (f) => f.ttype === "many2many", "a many2many");
      use(a.avatarFieldId, "assignee field", (f) => f.ttype === "many2one" && f.comodel === "res.users", "a many2one to res.users");
      use(a.priorityFieldId, "priority field", (f) => f.ttype === "selection", "a selection");
      for (const c of a.cardFields) use(c.fieldId, "card field", any, "");
      break;
    }
    case "calendar": {
      const a = v.arch;
      if (!a.dateStartFieldId) add(`${where} needs a start date field.`, m.id);
      const start = use(a.dateStartFieldId, "start", (f) => isDate(f.ttype), "a date or datetime");
      use(a.dateStopFieldId, "end", (f) => isDate(f.ttype) && (!start || f.ttype === start.ttype), start ? `a ${start.ttype} like the start` : "a date or datetime");
      use(a.allDayFieldId, "all-day field", (f) => f.ttype === "boolean", "a checkbox");
      use(a.colorFieldId, "colour field", groupable, "a field that can be grouped");
      for (const id of a.popoverFieldIds) use(id, "popover field", any, "");
      break;
    }
    case "pivot":
      for (const id of [...v.arch.rowFieldIds, ...v.arch.colFieldIds]) use(id, "row or column", groupable, "a field that can be grouped");
      for (const id of v.arch.measureFieldIds) use(id, "measure", (f) => isNumeric(f.ttype), "a number");
      break;
    case "graph":
      for (const id of v.arch.groupFieldIds) use(id, "group-by field", groupable, "a field that can be grouped");
      use(v.arch.measureFieldId, "measure", (f) => isNumeric(f.ttype), "a number");
      break;
    case "search": {
      for (const id of v.arch.fieldIds) use(id, "search field", any, "");
      for (const id of v.arch.groupByFieldIds) use(id, "group-by", groupable, "a field that can be grouped");
      const names = new Set(m.fields.map((f) => f.name));
      for (const f of v.arch.filters) {
        if (!f.label.trim()) add(`${where} has a filter with no label.`, m.id);
        if (f.kind === "date") { if (!f.dateFieldId) add(`${where}: filter "${f.label}" needs a date field.`, m.id); use(f.dateFieldId, `date of filter "${f.label}"`, (x) => isDate(x.ttype), "a date or datetime"); continue; }
        if (!conditionToDomain(f.expr, m.fields)) { add(`${where}: filter "${f.label}" needs a condition the builder can read (comparisons joined by all "and" or all "or").`, m.id); continue; }
        for (const n of expressionNames(f.expr)) if (!names.has(n) && n !== "uid") add(`${where}: filter "${f.label}" uses "${n}", which is not a field of the model.`, m.id);
      }
      break;
    }
  }
}
