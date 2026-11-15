// Mermaid erDiagram text from a schema, and a schema from erDiagram text (the source editor and AI answers).
import { type Cardinality, type Column, type KeyPair, type Relation, type Schema, type Table, NAME, TABLE_COLOR_ALPHA, isTableColor, newId, tableById } from "./model";

const LEFT: Record<Cardinality, string> = { zeroOrOne: "|o", one: "||", zeroOrMany: "}o", oneOrMany: "}|" };
const RIGHT: Record<Cardinality, string> = { zeroOrOne: "o|", one: "||", zeroOrMany: "o{", oneOrMany: "|{" };
const FROM_LEFT = Object.fromEntries(Object.entries(LEFT).map(([k, v]) => [v, k])) as Record<string, Cardinality>;
const FROM_RIGHT = Object.fromEntries(Object.entries(RIGHT).map(([k, v]) => [v, k])) as Record<string, Cardinality>;

// Mermaid attribute types can't hold spaces ("double precision" is written "double_precision"). Older Mermaid versions
// didn't allow commas either, so "decimal(10-2)" is still read as "decimal(10,2)".
const typeOut = (type: string) => type.trim().replace(/\s*,\s*/g, ",").replace(/\s+/g, "_").replace(/[^A-Za-z0-9_\-()[\],.]/g, "") || "string";
const typeIn = (type: string) => type.replace(/\((\d+)-(\d+)\)/, "($1,$2)");
const quoted = (text: string) => text.replace(/["\r\n]/g, " ").trim();

export interface MermaidOutput {
  text: string;
  /** The relationship ids in the order their lines appear; Mermaid numbers its edges the same way. */
  relationOrder: string[];
}

/** `comments: false` leaves column comments out of the text (the diagram is narrower; the schema keeps them). */
export function toMermaid(schema: Schema, { comments = true }: { comments?: boolean } = {}): MermaidOutput {
  const fkColumns = foreignKeyIds(schema);
  const lines = ["erDiagram"];
  for (const table of schema.tables) {
    if (!table.columns.length) { lines.push(`  ${table.name}`); continue; }
    lines.push(`  ${table.name} {`);
    for (const column of table.columns) {
      const keys = [column.pk && "PK", fkColumns.has(column.id) && "FK", column.unique && !column.pk && "UK"].filter(Boolean).join(", ");
      const comment = comments ? quoted(column.comment) : "";
      lines.push(`    ${typeOut(column.type)} ${column.name}${keys ? " " + keys : ""}${comment ? ` "${comment}"` : ""}`);
    }
    lines.push("  }");
  }
  // Highlights are see-through fills; written as #rrggbbaa because a style's values are separated by commas.
  for (const table of schema.tables) if (isTableColor(table.color)) lines.push(`  style ${table.name} fill:${table.color}${TABLE_COLOR_ALPHA}`);
  const relationOrder: string[] = [];
  for (const relation of schema.relations) {
    const parent = tableById(schema, relation.parent), child = tableById(schema, relation.child);
    if (!parent || !child) continue;
    relationOrder.push(relation.id);
    const line = relation.identifying ? "--" : "..";
    lines.push(`  ${parent.name} ${LEFT[relation.parentCard]}${line}${RIGHT[relation.childCard]} ${child.name} : "${quoted(relation.label) || " "}"`);
  }
  return { text: lines.join("\n") + "\n", relationOrder };
}

function foreignKeyIds(schema: Schema) {
  return new Set(schema.relations.flatMap((r) => r.columns.map((p) => p.fk)));
}

const ENTITY = String.raw`([A-Za-z_][\w-]*)`;
const RELATION = new RegExp(String.raw`^${ENTITY}\s+(\|o|\|\||\}o|\}\|)(--|\.\.)(o\||\|\||o\{|\|\{)\s+${ENTITY}\s*(?::\s*(.*))?$`);
const ATTRIBUTE = /^(\S+)\s+([A-Za-z_*][\w-]*)((?:\s*,?\s*\b(?:PK|FK|UK)\b)*)\s*(?:"([^"]*)")?\s*$/;

export class MermaidError extends Error {
  constructor(message: string, readonly line: number) { super(`Line ${line}: ${message}`); }
}

/**
 * Reads erDiagram text. Ids are kept from `previous` for tables, columns and relationships whose names match, so
 * reopened editors and the file's history stay stable. Foreign key columns are matched to the parent's primary key.
 */
export function fromMermaid(text: string, previous?: Schema): Schema {
  const rows = text.replace(/\r\n?/g, "\n").split("\n");
  const tables = new Map<string, Table>();
  const styled = new Map<string, string>(); // table → highlight colour from a `style` line
  let sawStyle = false;
  const fkNames = new Map<string, Set<string>>(); // table → columns marked FK
  const rawRelations: { a: string; cardA: Cardinality; b: string; cardB: Cardinality; identifying: boolean; label: string }[] = [];
  const oldTable = (name: string) => previous?.tables.find((t) => t.name.toLowerCase() === name.toLowerCase());
  const table = (name: string) => {
    if (!tables.has(name)) tables.set(name, { id: oldTable(name)?.id ?? newId(), name, comment: oldTable(name)?.comment ?? "", color: oldTable(name)?.color ?? "", columns: [] });
    return tables.get(name)!;
  };

  let started = false, inside: Table | null = null, inFrontmatter = false;
  rows.forEach((raw, index) => {
    const line = raw.replace(/%%.*$/, "").trim();
    const n = index + 1;
    if (!started && line === "---") { inFrontmatter = !inFrontmatter; return; }
    if (inFrontmatter) { if (line === "---") inFrontmatter = false; return; }
    if (!line) return;
    if (!started) {
      if (!/^erDiagram\b/.test(line)) throw new MermaidError("An ER diagram starts with erDiagram.", n);
      started = true;
      return;
    }
    if (inside) {
      if (line === "}") { inside = null; return; }
      const match = ATTRIBUTE.exec(line);
      if (!match) throw new MermaidError(`Couldn't read the column "${line}". Write it as: type name PK "comment".`, n);
      const [, type, name, keys = "", comment = ""] = match;
      const flags = new Set(keys.split(/[\s,]+/).filter(Boolean));
      const old = oldTable(inside.name)?.columns.find((c) => c.name.toLowerCase() === name.toLowerCase());
      const column: Column = { id: old?.id ?? newId(), name, type: typeIn(type), pk: flags.has("PK"), unique: flags.has("UK"),
        nullable: old ? old.nullable && !flags.has("PK") : !flags.has("PK"), comment: comment.trim() };
      inside.columns.push(column);
      if (flags.has("FK")) (fkNames.get(inside.name) ?? fkNames.set(inside.name, new Set()).get(inside.name)!).add(name.toLowerCase());
      return;
    }
    const style = new RegExp(String.raw`^style\s+${ENTITY}\s+(.*)$`).exec(line);
    if (style) {
      sawStyle = true;
      const fill = /(?:^|,)\s*fill\s*:\s*(#[0-9a-f]{6})(?:[0-9a-f]{2})?\s*(?:,|$)/i.exec(style[2]);
      if (fill) styled.set(style[1], fill[1].toLowerCase());
      return;
    }
    if (/^direction\s+(TB|BT|LR|RL)$/.test(line) || /^(title|accTitle|accDescr|classDef|class|style)\b/.test(line)) return;
    const block = new RegExp(String.raw`^${ENTITY}(?:\s*\[[^\]]*\])?\s*\{\s*$`).exec(line);
    if (block) { inside = table(block[1]); return; }
    const rel = RELATION.exec(line);
    if (rel) {
      const [, a, left, kind, right, b, label = ""] = rel;
      table(a); table(b);
      rawRelations.push({ a, cardA: FROM_LEFT[left], b, cardB: FROM_RIGHT[right], identifying: kind === "--", label: label.trim().replace(/^"(.*)"$/, "$1").trim() });
      return;
    }
    const single = new RegExp(String.raw`^${ENTITY}(?:\s*\[[^\]]*\])?$`).exec(line);
    if (single) { table(single[1]); return; }
    throw new MermaidError(`Couldn't read "${line}".`, n);
  });
  if (!started) throw new MermaidError("An ER diagram starts with erDiagram.", 1);
  if (inside) throw new MermaidError(`The block for ${(inside as Table).name} is missing its closing }.`, rows.length);

  // Text that carries highlights says which tables have one; text without any (an AI answer) keeps the previous ones.
  if (sawStyle) for (const t of tables.values()) t.color = styled.get(t.name) ?? "";
  const used = new Set<string>();
  const relations: Relation[] = rawRelations.map(({ a, cardA, b, cardB, identifying, label }) => {
    // The "one" side is the parent. With one on both or many on both, the left entity is.
    const flip = isMany(cardA) && !isMany(cardB);
    const [parentName, childName, parentCard, childCard] = flip ? [b, a, cardB, cardA] : [a, b, cardA, cardB];
    const parent = tables.get(parentName)!, child = tables.get(childName)!;
    // Several relationships can join the same two tables (an order's customer, invoice and delivery address):
    // the previous one with the same label is the best match, then any previous one not yet taken.
    const candidates = previous?.relations.filter((r) => !used.has("rel:" + r.id)
      && tableById(previous, r.parent)?.name === parentName && tableById(previous, r.child)?.name === childName) ?? [];
    const old = candidates.find((r) => r.label === label) ?? candidates[0];
    if (old) used.add("rel:" + old.id);
    const fks = fkNames.get(childName) ?? new Set<string>();
    const columns = labelKeys(parent, child, label, fks, used) ?? previousKeys(previous, old, parent, child, used)
      ?? matchKeys(parent, child, fks, used);
    return { id: old?.id ?? newId(), parent: parent.id, child: child.id, parentCard, childCard, identifying, label, columns };
  });
  return { name: previous?.name ?? "Untitled", tables: [...tables.values()], relations };
}

/** A label that names one of the child's FK columns ("partner_invoice_id", "invoice address (partner_invoice_id)") says which column it is. */
function labelKeys(parent: Table, child: Table, label: string, fks: Set<string>, used: Set<string>): KeyPair[] | null {
  const pks = parent.columns.filter((c) => c.pk);
  if (pks.length !== 1 || !label) return null;
  const words = new Set(label.toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean));
  const fk = child.columns.find((c) => fks.has(c.name.toLowerCase()) && words.has(c.name.toLowerCase()) && !used.has(c.id));
  if (!fk) return null;
  used.add(fk.id);
  return [{ fk: fk.id, ref: pks[0].id }];
}

/** The keys the relationship had before an edit, matched by column name, so a round trip through the text keeps them. */
function previousKeys(previous: Schema | undefined, old: Relation | undefined, parent: Table, child: Table, used: Set<string>): KeyPair[] | null {
  if (!previous || !old?.columns.length) return null;
  const oldParent = tableById(previous, old.parent), oldChild = tableById(previous, old.child);
  const pairs: KeyPair[] = [];
  for (const pair of old.columns) {
    const fkName = oldChild?.columns.find((c) => c.id === pair.fk)?.name.toLowerCase();
    const refName = oldParent?.columns.find((c) => c.id === pair.ref)?.name.toLowerCase();
    const fk = child.columns.find((c) => c.name.toLowerCase() === fkName && !used.has(c.id));
    const ref = parent.columns.find((c) => c.name.toLowerCase() === refName);
    if (!fk || !ref) return null; // the columns changed: work the keys out again
    pairs.push({ fk: fk.id, ref: ref.id });
  }
  pairs.forEach((p) => used.add(p.fk));
  return pairs;
}

const isMany = (card: Cardinality) => card === "zeroOrMany" || card === "oneOrMany";

/** Pairs the child's FK columns with the parent's primary key: parent_id, parentId, or the same name as the key. */
function matchKeys(parent: Table, child: Table, fks: Set<string>, used: Set<string>): KeyPair[] {
  const pairs: KeyPair[] = [];
  const pks = parent.columns.filter((c) => c.pk);
  for (const pk of pks) {
    const names = new Set([pk.name, `${parent.name}_${pk.name}`, `${parent.name}${pk.name}`].map((s) => s.toLowerCase()));
    if (pk.name.toLowerCase() === "id") { names.add(`${parent.name}_id`.toLowerCase()); names.add(`${parent.name}id`.toLowerCase()); }
    const singular = parent.name.replace(/s$/i, "");
    names.add(`${singular}_${pk.name}`.toLowerCase());
    names.add(`${singular}${pk.name}`.toLowerCase());
    // Prefixed table names, as in Odoo: sale_order.id is referenced by order_id, res_users.id by user_id.
    const parts = parent.name.toLowerCase().split("_");
    for (let i = 1; i < parts.length; i++) {
      const tail = parts.slice(i).join("_");
      names.add(`${tail}_${pk.name}`.toLowerCase());
      names.add(`${tail.replace(/s$/, "")}_${pk.name}`.toLowerCase());
    }
    const candidates = child.columns.filter((c) => names.has(c.name.toLowerCase()) && (fks.has(c.name.toLowerCase()) || c.name.toLowerCase() !== "id"));
    const fk = candidates.find((c) => fks.has(c.name.toLowerCase()) && !used.has(c.id)) ?? candidates.find((c) => !used.has(c.id) && child.id !== parent.id);
    if (fk && (parent !== child || fk.id !== pk.id)) { pairs.push({ fk: fk.id, ref: pk.id }); used.add(fk.id); }
  }
  return pairs;
}

export { NAME };
