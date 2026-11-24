// Between an Odoo app and the ER schema: the diagram of an app is derived from its models (as the ORM would create the
// tables), and an existing diagram can become the starting point of an app.
import { type Column, type Relation, type Schema, type Table, NAME } from "../model";
import { type OdooApp, type OdooField, type OdooModel, type TType, addModel, defaultView, newApp, newField, slug, titleCase } from "./studioModel";
import { tableName } from "./generateAddon";

/** The PostgreSQL column type the ORM uses for a stored field (a port of odoo_native_tables/tools/columns.py). */
export const SQL_TYPES: Record<TType, string | null> = {
  char: "varchar", text: "text", html: "text", integer: "int", float: "float8", monetary: "numeric", boolean: "boolean", date: "date",
  datetime: "timestamp", selection: "varchar", many2one: "int", one2many: null, many2many: null, binary: null, image: null,
};

const comment = (f: OdooField) => [f.string || titleCase(f.name), f.ttype === "selection" ? `(${f.selection.map(([k]) => k).join(" | ")})` : "",
  f.ttype === "many2one" ? `→ ${f.comodel}` : ""].filter(Boolean).join(" ");

/** The tables of the app's models. Table ids stay the same across edits, so diagram colours stick. */
export function appToSchema(app: OdooApp, previous?: Schema): Pick<Schema, "tables" | "relations"> {
  const colors = new Map(previous?.tables.map((t) => [t.id, t.color]) ?? []);
  const tables: Table[] = [];
  const relations: Relation[] = [];
  const tableOf = new Map<string, Table>();
  const external = new Map<string, Table>();
  for (const m of app.models) {
    const id = `t_${m.id}`;
    const columns: Column[] = [{ id: `${m.id}.id`, name: "id", type: "serial", pk: true, nullable: false, unique: false, comment: "Record id" }];
    for (const f of m.fields) {
      const type = SQL_TYPES[f.ttype];
      if (type) columns.push({ id: `${m.id}.${f.id}`, name: f.name, type, pk: false, nullable: !f.required, unique: false, comment: comment(f) });
    }
    const table = { id, name: tableName(m.name), comment: m.extend ? `${m.description || m.name} (extended)` : m.description, color: colors.get(id) ?? "", columns };
    tables.push(table);
    tableOf.set(m.name, table);
  }
  /** A table for a model outside the app (res.partner…), with just its key, so relationships have somewhere to go. */
  const target = (model: string) => {
    const own = tableOf.get(model);
    if (own) return own;
    let t = external.get(model);
    if (!t) {
      t = { id: `ext_${tableName(model)}`, name: tableName(model), comment: `${model} (from Odoo)`, color: colors.get(`ext_${tableName(model)}`) ?? "#adb5bd",
        columns: [{ id: `ext_${tableName(model)}.id`, name: "id", type: "serial", pk: true, nullable: false, unique: false, comment: "Record id" }] };
      external.set(model, t);
      tables.push(t);
    }
    return t;
  };
  for (const m of app.models) {
    const child = tableOf.get(m.name)!;
    for (const f of m.fields) {
      if (f.ttype === "many2one" && f.comodel) {
        const parent = target(f.comodel);
        relations.push({ id: `r_${m.id}_${f.id}`, parent: parent.id, child: child.id, parentCard: f.required ? "one" : "zeroOrOne", childCard: "zeroOrMany",
          identifying: false, label: f.name, columns: [{ fk: `${m.id}.${f.id}`, ref: parent.columns[0].id }] });
      }
      if (f.ttype === "many2many" && f.comodel) {
        // The relation table the ORM creates: <a>_<b>_rel, with one column per side.
        const other = target(f.comodel);
        const [a, b] = [child.name, other.name].sort();
        const relId = `m2m_${m.id}_${f.id}`;
        const c1 = { id: `${relId}.1`, name: `${child.name}_id`, type: "int", pk: true, nullable: false, unique: false, comment: "" };
        const c2 = { id: `${relId}.2`, name: `${other.name === child.name ? other.name + "_2" : other.name}_id`, type: "int", pk: true, nullable: false, unique: false, comment: "" };
        tables.push({ id: relId, name: `${a}_${b}_rel`, comment: `${m.name}.${f.name}`, color: colors.get(relId) ?? "", columns: [c1, c2] });
        relations.push({ id: `${relId}_a`, parent: child.id, child: relId, parentCard: "one", childCard: "zeroOrMany", identifying: true, label: f.name, columns: [{ fk: c1.id, ref: child.columns[0].id }] });
        relations.push({ id: `${relId}_b`, parent: other.id, child: relId, parentCard: "one", childCard: "zeroOrMany", identifying: true, label: "", columns: [{ fk: c2.id, ref: other.columns[0].id }] });
      }
    }
  }
  // Two many2many fields can name the same relation table (one from each side): keep the first.
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const t of tables) { if (t.id.startsWith("m2m_")) { if (seen.has(t.name)) dupes.add(t.id); seen.add(t.name); } }
  return { tables: tables.filter((t) => !dupes.has(t.id)), relations: relations.filter((r) => !dupes.has(r.child)) };
}

/** The Odoo field type for an SQL column type. */
export function ttypeForSql(type: string): TType {
  const t = type.toLowerCase();
  if (/^(serial|bigserial|int|integer|bigint|smallint|int[248])\b/.test(t)) return "integer";
  if (/^(decimal|numeric|money)/.test(t)) return "float";
  if (/^(float|double|real)/.test(t)) return "float";
  if (/^bool/.test(t)) return "boolean";
  if (/^date$/.test(t)) return "date";
  if (/^(timestamp|datetime)/.test(t)) return "datetime";
  if (/^(text|json|jsonb|clob)/.test(t)) return "text";
  if (/^(blob|bytea|binary)/.test(t)) return "binary";
  return "char";
}

/** Starts an app from the diagram: one model per table, many2one fields for foreign keys and one2many fields back. */
export function schemaToApp(schema: Schema, appName = schema.name || "My app"): OdooApp {
  let app = newApp(appName);
  // newApp adds a first model; we build our own from the tables instead.
  app = { ...app, models: [], views: [], actions: [], menus: [] };
  const prefix = app.technicalName;
  const modelOf = new Map<string, OdooModel>();
  const fkColumns = new Set(schema.relations.flatMap((r) => r.columns.map((p) => p.fk)));
  const isJoinTable = (t: Table) => t.columns.length === 2 && t.columns.every((c) => fkColumns.has(c.id))
    && schema.relations.filter((r) => r.child === t.id).length === 2;
  for (const t of schema.tables.filter((x) => !isJoinTable(x))) {
    const added = addModel(app, t.comment.trim() || titleCase(t.name), `${prefix}.${slug(t.name)}`);
    app = added.app;
    const fields: OdooField[] = [];
    for (const c of t.columns) {
      if (c.pk && c.name.toLowerCase() === "id") continue;
      if (fkColumns.has(c.id)) continue; // becomes a many2one below
      const name = slug(c.name);
      if (!NAME.test(name) || ["id", "create_uid", "create_date", "write_uid", "write_date"].includes(name)) continue;
      fields.push(newField({ name, string: titleCase(c.name), ttype: ttypeForSql(c.type), required: !c.nullable, help: c.comment }));
    }
    if (!fields.some((f) => f.name === "name")) fields.unshift(newField({ name: "name", string: "Name", required: true }));
    const model = { ...added.model, fields };
    app = { ...app, models: app.models.map((m) => (m.id === model.id ? model : m)) };
    modelOf.set(t.id, model);
  }
  const touch = (model: OdooModel, field: OdooField) => {
    const current = app.models.find((m) => m.id === model.id)!;
    if (current.fields.some((f) => f.name === field.name)) return;
    app = { ...app, models: app.models.map((m) => (m.id === model.id ? { ...current, fields: [...current.fields, field] } : m)) };
  };
  for (const r of schema.relations) {
    const child = schema.tables.find((t) => t.id === r.child), parentModel = modelOf.get(r.parent);
    if (!child || !parentModel) continue;
    const childModel = modelOf.get(r.child);
    if (childModel) {
      const fk = child.columns.find((c) => c.id === r.columns[0]?.fk);
      const m2oName = slug(fk?.name ?? `${slug(parentModel.description)}_id`).replace(/(_id)?$/, "_id");
      touch(childModel, newField({ name: m2oName, string: titleCase(m2oName), ttype: "many2one", comodel: parentModel.name, required: !!fk && !fk.nullable,
        ondelete: fk && !fk.nullable ? (r.identifying ? "cascade" : "restrict") : "set null" }));
      touch(parentModel, newField({ name: `${slug(child.name)}_ids`, string: titleCase(child.name), ttype: "one2many", comodel: childModel.name, inverseName: m2oName }));
    } else if (isJoinTable(child)) {
      const other = schema.relations.find((x) => x.child === r.child && x.id !== r.id);
      const otherModel = other ? modelOf.get(other.parent) : undefined;
      if (!otherModel || schema.relations.findIndex((x) => x.child === r.child) !== schema.relations.indexOf(r)) continue;
      touch(parentModel, newField({ name: `${slug(otherModel.name.split(".").pop()!)}_ids`, string: titleCase(otherModel.description), ttype: "many2many", comodel: otherModel.name }));
    }
  }
  // Views are made from the final fields.
  app = { ...app, views: app.views.map((v) => {
    const m = app.models.find((x) => x.id === v.modelId)!;
    return { ...defaultView(app, m, v.type), id: v.id };
  }) };
  return app;
}
