// The schema vdoo edits. The .vdoo file holds this as JSON; the Mermaid text and SQL are generated from it.

export interface Column {
  id: string;
  name: string;
  type: string;
  pk: boolean;
  nullable: boolean;
  unique: boolean;
  comment: string;
}

export interface Table {
  id: string;
  name: string;
  comment: string;
  columns: Column[];
}

/** How many rows on one side of a relationship match one row on the other. */
export type Cardinality = "zeroOrOne" | "one" | "zeroOrMany" | "oneOrMany";

/** A foreign key: `child.column` references `parent.column`. */
export interface KeyPair { fk: string; ref: string }

export interface Relation {
  id: string;
  /** The referenced table (holds the primary key). */
  parent: string;
  /** The referencing table (holds the foreign key). */
  child: string;
  parentCard: Cardinality;
  childCard: Cardinality;
  /** Identifying relationships draw a solid line: the child's key includes the parent's. */
  identifying: boolean;
  label: string;
  columns: KeyPair[];
}

export interface Schema {
  name: string;
  tables: Table[];
  relations: Relation[];
}

export const CARDINALITY: Record<Cardinality, string> = {
  zeroOrOne: "Zero or one",
  one: "Exactly one",
  zeroOrMany: "Zero or more",
  oneOrMany: "One or more",
};

export const COLUMN_TYPES = ["int", "bigint", "smallint", "serial", "uuid", "varchar(255)", "text", "char(1)", "boolean",
  "date", "time", "timestamp", "timestamptz", "decimal(10,2)", "numeric", "float", "double", "json", "jsonb", "blob", "bytea"];

/** Names used in Mermaid and SQL: letters, digits and underscores, not starting with a digit. */
export const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const newId = () => crypto.randomUUID().slice(0, 8);

export const emptySchema = (name = "Untitled"): Schema => ({ name, tables: [], relations: [] });

export function newColumn(partial: Partial<Column> = {}): Column {
  return { id: newId(), name: "column", type: "varchar(255)", pk: false, nullable: true, unique: false, comment: "", ...partial };
}

export function newTable(schema: Schema, base = "table"): Table {
  let name = base, n = 1;
  while (schema.tables.some((t) => t.name.toLowerCase() === name.toLowerCase())) name = `${base}_${++n}`;
  return { id: newId(), name, comment: "", columns: [newColumn({ name: "id", type: "int", pk: true, nullable: false })] };
}

export const tableById = (schema: Schema, id: string) => schema.tables.find((t) => t.id === id);

/** The relationships whose foreign keys use this column, so the editor can show which ones are FKs. */
export function foreignKeysOf(schema: Schema, table: Table) {
  const keys = new Map<string, { relation: Relation; parent: Table | undefined; ref: Column | undefined }[]>();
  for (const relation of schema.relations) {
    if (relation.child !== table.id) continue;
    const parent = tableById(schema, relation.parent);
    for (const pair of relation.columns) {
      const list = keys.get(pair.fk) ?? [];
      list.push({ relation, parent, ref: parent?.columns.find((c) => c.id === pair.ref) });
      keys.set(pair.fk, list);
    }
  }
  return keys;
}

/** Columns of other tables that reference this one, for the "Referenced by" list. */
export function referencesTo(schema: Schema, table: Table) {
  return schema.relations.filter((r) => r.parent === table.id).flatMap((relation) => {
    const child = tableById(schema, relation.child);
    return relation.columns.map((pair) => ({ relation, child, fk: child?.columns.find((c) => c.id === pair.fk),
      ref: table.columns.find((c) => c.id === pair.ref) }));
  });
}

/** Problems shown in the editors and the status bar. An invalid schema still saves; Mermaid may not draw it. */
export function validate(schema: Schema): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const table of schema.tables) {
    if (!NAME.test(table.name)) problems.push(`Table "${table.name}" needs a name with only letters, digits and underscores.`);
    if (seen.has(table.name.toLowerCase())) problems.push(`There is more than one table named "${table.name}".`);
    seen.add(table.name.toLowerCase());
    const cols = new Set<string>();
    for (const column of table.columns) {
      if (!NAME.test(column.name)) problems.push(`Column "${table.name}.${column.name}" needs a name with only letters, digits and underscores.`);
      if (cols.has(column.name.toLowerCase())) problems.push(`Table "${table.name}" has more than one column named "${column.name}".`);
      cols.add(column.name.toLowerCase());
      if (!/^[A-Za-z][A-Za-z0-9_ ]*(\(\s*\d+\s*(,\s*\d+\s*)?\))?(\[\])?$/.test(column.type)) problems.push(`Column "${table.name}.${column.name}" has an unusual type "${column.type}".`);
    }
  }
  for (const relation of schema.relations) {
    const parent = tableById(schema, relation.parent), child = tableById(schema, relation.child);
    if (!parent || !child) { problems.push("A relationship points to a table that no longer exists."); continue; }
    for (const pair of relation.columns) {
      const fk = child.columns.find((c) => c.id === pair.fk), ref = parent.columns.find((c) => c.id === pair.ref);
      if (!fk || !ref) problems.push(`The relationship ${parent.name} → ${child.name} uses a column that no longer exists.`);
      else if (normalType(fk.type) !== normalType(ref.type) && !(normalType(ref.type) === "serial" && normalType(fk.type) === "int"))
        problems.push(`${child.name}.${fk.name} (${fk.type}) references ${parent.name}.${ref.name} (${ref.type}): the types differ.`);
    }
  }
  return problems;
}
const normalType = (type: string) => type.toLowerCase().replace(/\s+/g, "").replace(/^integer$/, "int");

/** Removes a table and every relationship that uses it. */
export function removeTable(schema: Schema, id: string): Schema {
  return { ...schema, tables: schema.tables.filter((t) => t.id !== id), relations: schema.relations.filter((r) => r.parent !== id && r.child !== id) };
}

/** Replaces a table; drops foreign key pairs whose columns were deleted. */
export function replaceTable(schema: Schema, table: Table): Schema {
  const ids = new Set(table.columns.map((c) => c.id));
  return {
    ...schema,
    tables: schema.tables.map((t) => (t.id === table.id ? table : t)),
    relations: schema.relations.map((r) => ({
      ...r,
      columns: r.columns.filter((p) => (r.child !== table.id || ids.has(p.fk)) && (r.parent !== table.id || ids.has(p.ref))),
    })),
  };
}

export function replaceRelation(schema: Schema, relation: Relation): Schema {
  const exists = schema.relations.some((r) => r.id === relation.id);
  return { ...schema, relations: exists ? schema.relations.map((r) => (r.id === relation.id ? relation : r)) : [...schema.relations, relation] };
}

/** A new one-to-many relationship that references the parent's primary key, adding the FK column if needed. */
export function connect(schema: Schema, parentId: string, childId: string): { schema: Schema; relation: Relation } {
  const parent = tableById(schema, parentId)!, child = tableById(schema, childId)!;
  let nextChild = child;
  const columns: KeyPair[] = [];
  for (const pk of parent.columns.filter((c) => c.pk)) {
    const wanted = pk.name.toLowerCase() === "id" ? `${parent.name.toLowerCase()}_id` : pk.name;
    let fk = nextChild.columns.find((c) => c.name.toLowerCase() === wanted.toLowerCase());
    if (!fk) {
      fk = newColumn({ name: wanted, type: pk.type.toLowerCase() === "serial" ? "int" : pk.type, nullable: false });
      nextChild = { ...nextChild, columns: [...nextChild.columns, fk] };
    }
    columns.push({ fk: fk.id, ref: pk.id });
  }
  const relation: Relation = { id: newId(), parent: parentId, child: childId, parentCard: "one", childCard: "zeroOrMany",
    identifying: false, label: "has", columns };
  const withChild = nextChild === child ? schema : { ...schema, tables: schema.tables.map((t) => (t.id === childId ? nextChild : t)) };
  return { schema: { ...withChild, relations: [...withChild.relations, relation] }, relation };
}

// ── Files ──────────────────────────────────────────────────────────────────────────────────
export function serialize(schema: Schema) {
  return JSON.stringify({ format: "vdoo", version: 1, ...schema }, null, 2) + "\n";
}

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const CARDS = new Set(Object.keys(CARDINALITY));

/** Reads a .vdoo file, keeping only fields vdoo knows. Throws on anything that isn't one. */
export function deserialize(text: string): Schema {
  const data = JSON.parse(text);
  if (!data || data.format !== "vdoo" || !Array.isArray(data.tables) || !Array.isArray(data.relations)) throw new Error("This isn't a vdoo schema file.");
  const tables: Table[] = data.tables.map((t: Record<string, unknown>) => ({
    id: str(t.id, newId()), name: str(t.name, "table"), comment: str(t.comment),
    columns: (Array.isArray(t.columns) ? t.columns : []).map((c: Record<string, unknown>) => ({
      id: str(c.id, newId()), name: str(c.name, "column"), type: str(c.type, "varchar(255)"),
      pk: c.pk === true, nullable: c.nullable !== false, unique: c.unique === true, comment: str(c.comment),
    })),
  }));
  const relations: Relation[] = data.relations.map((r: Record<string, unknown>) => ({
    id: str(r.id, newId()), parent: str(r.parent), child: str(r.child),
    parentCard: CARDS.has(r.parentCard as string) ? r.parentCard : "one",
    childCard: CARDS.has(r.childCard as string) ? r.childCard : "zeroOrMany",
    identifying: r.identifying === true, label: str(r.label),
    columns: (Array.isArray(r.columns) ? r.columns : []).filter((p: Record<string, unknown>) => typeof p?.fk === "string" && typeof p?.ref === "string")
      .map((p: KeyPair) => ({ fk: p.fk, ref: p.ref })),
  }));
  return { name: str(data.name, "Untitled"), tables, relations };
}
