import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { type Column, type Schema, type Table, COLUMN_TYPES, NAME, foreignKeysOf, newColumn, referencesTo, removeTable, replaceTable, tableById } from "./model";

interface Props {
  schema: Schema;
  tableId: string;
  onSave: (schema: Schema) => void;
  onOpenRelation: (id: string) => void;
  onClose: () => void;
}

/** Every column of one table with its type and keys. Changes apply when saved. */
export function TableEditor({ schema, tableId, onSave, onOpenRelation, onClose }: Props) {
  const original = tableById(schema, tableId)!;
  const [draft, setDraft] = useState<Table>(original);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fks = useMemo(() => foreignKeysOf(schema, draft), [schema, draft]);
  const referencedBy = useMemo(() => referencesTo(schema, draft), [schema, draft]);
  const changed = JSON.stringify(draft) !== JSON.stringify(original);

  const problems: string[] = [];
  if (!NAME.test(draft.name)) problems.push("The table name may contain only letters, digits and underscores, and can't start with a digit.");
  if (schema.tables.some((t) => t.id !== draft.id && t.name.toLowerCase() === draft.name.toLowerCase())) problems.push(`Another table is already named "${draft.name}".`);
  const names = new Map<string, number>();
  for (const c of draft.columns) names.set(c.name.toLowerCase(), (names.get(c.name.toLowerCase()) ?? 0) + 1);
  for (const c of draft.columns) {
    if (!NAME.test(c.name)) problems.push(`Column "${c.name || "(empty)"}": use only letters, digits and underscores.`);
    if (!c.type.trim()) problems.push(`Column "${c.name}" needs a data type.`);
  }
  for (const [name, count] of names) if (count > 1) problems.push(`More than one column is named "${name}".`);
  const removedFks = original.columns.filter((c) => !draft.columns.some((d) => d.id === c.id) && foreignKeysOf(schema, original).has(c.id));
  const removedRefs = original.columns.filter((c) => !draft.columns.some((d) => d.id === c.id) && referencesTo(schema, original).some((r) => r.ref?.id === c.id));

  const update = (id: string, patch: Partial<Column>) => setDraft((t) => ({
    ...t, columns: t.columns.map((c) => (c.id === id ? { ...c, ...patch, ...(patch.pk ? { nullable: false } : {}) } : c)),
  }));
  const move = (index: number, by: number) => setDraft((t) => {
    const columns = t.columns.slice();
    const [item] = columns.splice(index, 1);
    columns.splice(Math.max(0, Math.min(columns.length, index + by)), 0, item);
    return { ...t, columns };
  });
  const save = () => { if (!problems.length) { onSave(replaceTable(schema, draft)); onClose(); } };
  const close = () => { if (!changed || window.confirm("Discard the changes to this table?")) onClose(); };

  return <Modal wide title={<>Table <code>{original.name}</code></>} onClose={close} footer={<>
    {confirmDelete
      ? <span className="confirm">Delete {original.name} and its relationships?
          <button className="btn danger" onClick={() => { onSave(removeTable(schema, original.id)); onClose(); }}>Delete</button>
          <button className="btn ghost" onClick={() => setConfirmDelete(false)}>Keep</button></span>
      : <button className="btn ghost danger-text" onClick={() => setConfirmDelete(true)}>Delete table</button>}
    <span className="spacer" />
    <button className="btn ghost" onClick={close}>Cancel</button>
    <button className="btn primary" disabled={!!problems.length || !changed} onClick={save}>Save</button>
  </>}>
    <div className="form-grid" onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) save(); }}>
      <label>Name<input value={draft.name} spellCheck={false} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus /></label>
      <label>Description<input value={draft.comment} placeholder="What one row represents" onChange={(e) => setDraft({ ...draft, comment: e.target.value })} /></label>
    </div>

    <table className="columns">
      <thead><tr>
        <th title="Primary key">PK</th><th>Column</th><th>Data type</th><th title="Allows NULL">Null</th><th title="Unique">Unique</th>
        <th>Foreign key</th><th>Comment</th><th aria-label="Actions" />
      </tr></thead>
      <tbody>
        {draft.columns.map((column, index) => {
          const refs = fks.get(column.id) ?? [];
          return <tr key={column.id} className={column.pk ? "is-pk" : refs.length ? "is-fk" : ""}>
            <td><input type="checkbox" aria-label={`${column.name} is part of the primary key`} checked={column.pk} onChange={(e) => update(column.id, { pk: e.target.checked })} /></td>
            <td className="name-cell">
              {column.pk && <span className="badge pk" title="Primary key">PK</span>}
              {refs.length > 0 && <span className="badge fk" title="Foreign key">FK</span>}
              <input aria-label="Column name" value={column.name} spellCheck={false} onChange={(e) => update(column.id, { name: e.target.value })} />
            </td>
            <td><input aria-label={`${column.name} data type`} list="column-types" value={column.type} spellCheck={false} onChange={(e) => update(column.id, { type: e.target.value })} /></td>
            <td><input type="checkbox" aria-label={`${column.name} allows NULL`} checked={column.nullable && !column.pk} disabled={column.pk} onChange={(e) => update(column.id, { nullable: e.target.checked })} /></td>
            <td><input type="checkbox" aria-label={`${column.name} is unique`} checked={column.unique || column.pk} disabled={column.pk} onChange={(e) => update(column.id, { unique: e.target.checked })} /></td>
            <td className="fk-cell">{refs.map(({ relation, parent, ref }) =>
              <button key={relation.id} className="link small" title="Edit this relationship" onClick={() => onOpenRelation(relation.id)}>
                → {parent?.name ?? "?"}.{ref?.name ?? "?"}</button>)}</td>
            <td><input aria-label={`${column.name} comment`} value={column.comment} onChange={(e) => update(column.id, { comment: e.target.value })} /></td>
            <td className="row-actions">
              <button className="pill-btn" title="Move up" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
              <button className="pill-btn" title="Move down" aria-label="Move down" disabled={index === draft.columns.length - 1} onClick={() => move(index, 1)}>↓</button>
              <button className="pill-btn" title="Remove column" aria-label={`Remove ${column.name}`} onClick={() => setDraft((t) => ({ ...t, columns: t.columns.filter((c) => c.id !== column.id) }))}>×</button>
            </td>
          </tr>;
        })}
      </tbody>
    </table>
    <datalist id="column-types">{COLUMN_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
    <button className="btn ghost" onClick={() => {
      let n = draft.columns.length + 1, name = `column_${n}`;
      while (draft.columns.some((c) => c.name === name)) name = `column_${++n}`;
      setDraft((t) => ({ ...t, columns: [...t.columns, newColumn({ name })] }));
    }}>+ Add column</button>

    {referencedBy.length > 0 && <section className="refs">
      <h3>Referenced by</h3>
      <ul>{referencedBy.map(({ relation, child, fk, ref }, i) => <li key={relation.id + i}>
        <button className="link small" onClick={() => onOpenRelation(relation.id)}>{child?.name}.{fk?.name ?? "?"} → {draft.name}.{ref?.name ?? "?"}</button>
      </li>)}</ul>
    </section>}
    {(removedFks.length > 0 || removedRefs.length > 0) && <p className="hint warn">
      Removing {[...removedFks, ...removedRefs].map((c) => c.name).join(", ")} also removes it from the relationships that use it.</p>}
    {problems.length > 0 && <ul className="problems" role="alert">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
  </Modal>;
}
