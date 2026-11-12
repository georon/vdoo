import { useState } from "react";
import { Modal } from "./Modal";
import { type Cardinality, type Relation, type Schema, type Table, CARDINALITY, foreignKeysOf, newColumn, newId, replaceRelation, tableById } from "./model";

interface Props {
  schema: Schema;
  /** An existing relationship, or null to create one. */
  relationId: string | null;
  onSave: (schema: Schema) => void;
  onOpenTable: (id: string) => void;
  onClose: () => void;
}

const NEW_COLUMN = "__new__";

/** One relationship: which table references which, how many rows on each side, and the foreign key columns. */
export function RelationEditor({ schema, relationId, onSave, onOpenTable, onClose }: Props) {
  const existing = relationId ? schema.relations.find((r) => r.id === relationId) : undefined;
  const draft = schema;
  const [relation, setRelation] = useState<Relation>(() => existing ?? {
    id: newId(), parent: schema.tables[0]?.id ?? "", child: schema.tables[1]?.id ?? schema.tables[0]?.id ?? "",
    parentCard: "one", childCard: "zeroOrMany", identifying: false, label: "has", columns: [],
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const parent = tableById(draft, relation.parent), child = tableById(draft, relation.child);

  // A new relationship, or one whose tables change, starts with the parent's primary key.
  const suggestPairs = (p: Table | undefined, c: Table | undefined) => (p && c ? p.columns.filter((col) => col.pk).map((pk) => {
    const wanted = pk.name.toLowerCase() === "id" ? `${p.name.toLowerCase()}_id` : pk.name.toLowerCase();
    const fk = c.columns.find((col) => col.name.toLowerCase() === wanted && col.id !== pk.id);
    return { fk: fk?.id ?? NEW_COLUMN, ref: pk.id };
  }) : []);
  const [pairs, setPairs] = useState(() => (existing ? existing.columns : suggestPairs(parent, child)));
  const changed = !existing || JSON.stringify({ ...relation, columns: pairs }) !== JSON.stringify(existing);

  const setTables = (patch: Partial<Pick<Relation, "parent" | "child">>) => {
    const next = { ...relation, ...patch };
    setRelation(next);
    setPairs(suggestPairs(tableById(draft, next.parent), tableById(draft, next.child)));
  };

  /** Turns "new column" picks into real columns on the child table. */
  const materialize = () => {
    let schemaOut = draft;
    let childTable = child!;
    const columns = pairs.filter((p) => p.ref).map((p) => {
      if (p.fk !== NEW_COLUMN) return p;
      const ref = parent!.columns.find((c) => c.id === p.ref)!;
      let name = ref.name.toLowerCase() === "id" ? `${parent!.name.toLowerCase()}_id` : ref.name, n = 1;
      while (childTable.columns.some((c) => c.name.toLowerCase() === name.toLowerCase())) name = `${name}_${++n}`;
      const column = newColumn({ name, type: ref.type.toLowerCase() === "serial" ? "int" : ref.type, nullable: relation.parentCard === "zeroOrOne", pk: relation.identifying });
      childTable = { ...childTable, columns: [...childTable.columns, column] };
      return { fk: column.id, ref: p.ref };
    }).filter((p) => p.fk);
    if (childTable !== child) schemaOut = { ...schemaOut, tables: schemaOut.tables.map((t) => (t.id === childTable.id ? childTable : t)) };
    return replaceRelation(schemaOut, { ...relation, columns });
  };

  const problems: string[] = [];
  if (!parent || !child) problems.push("Choose both tables.");
  for (const p of pairs) {
    const fk = child?.columns.find((c) => c.id === p.fk), ref = parent?.columns.find((c) => c.id === p.ref);
    if (p.ref && !p.fk) problems.push(`Choose the ${child?.name ?? "child"} column that references ${parent?.name}.${ref?.name}.`);
    if (fk && ref && fk.type.toLowerCase() !== ref.type.toLowerCase() && !(ref.type.toLowerCase() === "serial" && fk.type.toLowerCase() === "int"))
      problems.push(`${child!.name}.${fk.name} is ${fk.type} but ${parent!.name}.${ref.name} is ${ref.type}.`);
  }
  if (new Set(pairs.map((p) => p.fk).filter((f) => f && f !== NEW_COLUMN)).size !== pairs.filter((p) => p.fk && p.fk !== NEW_COLUMN).length)
    problems.push("Each foreign key column can be used once.");

  const save = () => { if (!problems.length) { onSave(materialize()); onClose(); } };
  const close = () => { if (!existing || !changed || window.confirm("Discard the changes to this relationship?")) onClose(); };

  if (schema.tables.length === 0) {
    return <Modal title="New relationship" onClose={onClose}><p>Add a table first.</p></Modal>;
  }

  const fkMap = child ? foreignKeysOf(draft, child) : new Map();
  return <Modal wide title={existing ? <>Relationship <code>{parent?.name} → {child?.name}</code></> : "New relationship"} onClose={close} footer={<>
    {existing && (confirmDelete
      ? <span className="confirm">Delete this relationship? Its columns stay in {child?.name}.
          <button className="btn danger" onClick={() => { onSave({ ...schema, relations: schema.relations.filter((r) => r.id !== existing.id) }); onClose(); }}>Delete</button>
          <button className="btn ghost" onClick={() => setConfirmDelete(false)}>Keep</button></span>
      : <button className="btn ghost danger-text" onClick={() => setConfirmDelete(true)}>Delete relationship</button>)}
    <span className="spacer" />
    <button className="btn ghost" onClick={close}>Cancel</button>
    <button className="btn primary" disabled={!!problems.length || !changed} onClick={save}>{existing ? "Save" : "Create"}</button>
  </>}>
    <div className="relation-grid">
      <fieldset>
        <legend>Referenced table (parent)</legend>
        <select aria-label="Parent table" value={relation.parent} onChange={(e) => setTables({ parent: e.target.value })}>
          {draft.tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <label>Each {child?.name ?? "child"} row has
          <select value={relation.parentCard} onChange={(e) => setRelation({ ...relation, parentCard: e.target.value as Cardinality })}>
            {(["one", "zeroOrOne"] as Cardinality[]).map((c) => <option key={c} value={c}>{CARDINALITY[c].toLowerCase()}</option>)}
          </select> {parent?.name ?? "parent"}</label>
        {parent && <KeyList table={parent} fks={new Set()} onOpen={() => onOpenTable(parent.id)} />}
      </fieldset>
      <div className="relation-arrow" aria-hidden="true">→</div>
      <fieldset>
        <legend>Referencing table (child)</legend>
        <select aria-label="Child table" value={relation.child} onChange={(e) => setTables({ child: e.target.value })}>
          {draft.tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <label>Each {parent?.name ?? "parent"} row has
          <select value={relation.childCard} onChange={(e) => setRelation({ ...relation, childCard: e.target.value as Cardinality })}>
            {(Object.keys(CARDINALITY) as Cardinality[]).map((c) => <option key={c} value={c}>{CARDINALITY[c].toLowerCase()}</option>)}
          </select> {child?.name ?? "child"}</label>
        {child && <KeyList table={child} fks={new Set([...fkMap.keys(), ...pairs.map((p) => p.fk)])} onOpen={() => onOpenTable(child.id)} />}
      </fieldset>
    </div>

    <div className="form-grid">
      <label>Label<input value={relation.label} placeholder="places, owns, belongs to…" onChange={(e) => setRelation({ ...relation, label: e.target.value })} /></label>
      <label className="check"><input type="checkbox" checked={relation.identifying} onChange={(e) => setRelation({ ...relation, identifying: e.target.checked })} />
        Identifying (the child's primary key includes the parent's; drawn as a solid line)</label>
    </div>

    <h3>Foreign key columns</h3>
    {parent && child && <table className="columns pairs">
      <thead><tr><th>{child.name} column (FK)</th><th /><th>{parent.name} column</th><th aria-label="Actions" /></tr></thead>
      <tbody>{pairs.map((pair, i) => <tr key={i}>
        <td><select aria-label="Foreign key column" value={pair.fk} onChange={(e) => setPairs(pairs.map((p, j) => (j === i ? { ...p, fk: e.target.value } : p)))}>
          <option value="">Choose a column…</option>
          {child.columns.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
          <option value={NEW_COLUMN}>+ New column</option>
        </select></td>
        <td aria-hidden="true">→</td>
        <td><select aria-label="Referenced column" value={pair.ref} onChange={(e) => setPairs(pairs.map((p, j) => (j === i ? { ...p, ref: e.target.value } : p)))}>
          {parent.columns.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.type}){c.pk ? " PK" : c.unique ? " UK" : ""}</option>)}
        </select></td>
        <td><button className="pill-btn" aria-label="Remove this pair" title="Remove" onClick={() => setPairs(pairs.filter((_, j) => j !== i))}>×</button></td>
      </tr>)}</tbody>
    </table>}
    {parent && <button className="btn ghost" onClick={() => setPairs([...pairs, { fk: "", ref: parent.columns.find((c) => c.pk)?.id ?? parent.columns[0]?.id ?? "" }])}>+ Add column pair</button>}
    {pairs.length === 0 && <p className="hint">No foreign key columns: the diagram shows the relationship, and SQL export leaves out its constraint.</p>}
    {problems.length > 0 && <ul className="problems" role="alert">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
  </Modal>;
}

function KeyList({ table, fks, onOpen }: { table: Table; fks: Set<string>; onOpen: () => void }) {
  return <div className="key-list">
    <ul>{table.columns.map((c) => <li key={c.id} className={c.pk ? "is-pk" : fks.has(c.id) ? "is-fk" : ""}>
      <span className="badges">{c.pk && <span className="badge pk">PK</span>}{fks.has(c.id) && <span className="badge fk">FK</span>}</span>
      <span className="col-name">{c.name}</span><span className="col-type">{c.type}</span>
    </li>)}</ul>
    <button className="link small" onClick={onOpen}>Edit {table.name}…</button>
  </div>;
}
