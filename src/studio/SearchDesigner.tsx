// The search view designer: the fields the search box looks in, predefined filters and the Group By options.
import { useState } from "react";
import { type OdooView, type SearchArch, type SearchFilter, defaultSearch, fieldById, isDate, isGroupable, replaceView, searchFilter, viewOf } from "../odoo/studioModel";
import { conditionToDomain } from "../odoo/conditions";
import { CommitInput, ConditionEditor, Prop } from "./controls";
import { FieldList, FieldSelect, type ModelProps, ViewHead, labelOf } from "./viewKit";

type SearchView = Extract<OdooView, { type: "search" }>;
const SEARCHABLE = new Set(["char", "text", "html", "integer", "float", "monetary", "selection", "many2one", "many2many", "one2many", "date", "datetime"]);

export function SearchDesigner({ app, model, view, onApp }: ModelProps<SearchView>) {
  const arch = view.arch;
  const [sel, setSel] = useState<string | null>(null);
  const setArch = (next: SearchArch) => onApp(replaceView(app, { ...view, arch: next }));
  const filter = arch.filters.find((f) => f.id === sel);
  const searchFields = arch.fieldIds.map((id) => fieldById(model, id)).filter((f) => !!f);
  const addFilter = (partial: Partial<SearchFilter>) => { const f = searchFilter(partial); setArch({ ...arch, filters: [...arch.filters, f] }); setSel(f.id); };
  const firstDate = model.fields.find((f) => isDate(f.ttype));

  return <div className="st-designer">
    <div className="sf-canvas" onClick={() => setSel(null)}>
      <div className="ss-search">
        <div className="ss-box"><span aria-hidden="true">🔍</span><span className="ss-placeholder">Search…</span><span className="ss-toggle">▾</span></div>
        {searchFields.length > 0 && <ul className="ss-suggest st-plain">{searchFields.map((f) => <li key={f!.id}>Search <b>{labelOf(f)}</b> for: <i>lap</i></li>)}</ul>}
        <div className="ss-panel">
          <div><h4>⏷ Filters</h4>
            {arch.filters.length ? arch.filters.map((f, i) => <div key={f.id}>
              {i > 0 && <hr />}
              <button className={`ss-item${sel === f.id ? " selected" : ""}${problem(f) ? " danger-text" : ""}`} onClick={(e) => { e.stopPropagation(); setSel(f.id); }}>
                {f.label || "(no label)"}{f.kind === "date" && " ▸"}</button></div>) : <p className="hint">No filters yet.</p>}
          </div>
          <div><h4>≡ Group By</h4>
            {arch.groupByFieldIds.map((id) => fieldById(model, id)).filter((f) => !!f).map((f) => <span key={f!.id} className="ss-item">{labelOf(f)}</span>)}
            {!arch.groupByFieldIds.length && <p className="hint">No group-by options.</p>}
          </div>
        </div>
      </div>
    </div>

    <aside className="st-props" aria-label="Properties">
      {filter ? filterProps(filter) : <ViewHead app={app} view={view} onApp={onApp}>
        <FieldList label="Search in" ids={arch.fieldIds} fields={model.fields} filter={(f) => SEARCHABLE.has(f.ttype)}
          hint="What typing in the search box looks in." empty="Nothing: the search box finds nothing." onChange={(fieldIds) => setArch({ ...arch, fieldIds })} />
        <fieldset className="st-modifier">
          <legend>Filters</legend>
          {arch.filters.length > 0 && <ul className="st-plain">{arch.filters.map((f) =>
            <li key={f.id}><button className={`link${problem(f) ? " danger-text" : ""}`} onClick={() => setSel(f.id)}>{f.label || "(no label)"}</button>
              <small className="hint"> {f.kind === "date" ? "date" : "condition"}</small></li>)}</ul>}
          <div className="st-move">
            <button className="btn ghost small" onClick={() => addFilter({})}>+ Condition filter</button>
            <button className="btn ghost small" disabled={!firstDate} onClick={() => addFilter({ kind: "date", label: labelOf(firstDate), dateFieldId: firstDate?.id ?? "" })}>+ Date filter</button>
          </div>
          <small className="hint">Choosing several filters narrows the results: each one is in a group of its own.</small>
        </fieldset>
        <FieldList label="Group By" ids={arch.groupByFieldIds} fields={model.fields} filter={(f) => isGroupable(f.ttype)}
          onChange={(groupByFieldIds) => setArch({ ...arch, groupByFieldIds })} />
        <button className="btn ghost small" onClick={() => {
          if (window.confirm("Replace this search view with the default one?")) setArch(defaultSearch(model, viewOf(app, model.id, "list")?.arch));
        }}>Reset to the default</button>
      </ViewHead>}
    </aside>
  </div>;

  function problem(f: SearchFilter) {
    return f.kind === "date" ? !fieldById(model, f.dateFieldId) : !conditionToDomain(f.expr, model.fields);
  }

  function filterProps(f: SearchFilter) {
    const set = (patch: Partial<SearchFilter>) => setArch({ ...arch, filters: arch.filters.map((x) => (x.id === f.id ? { ...x, ...patch } : x)) });
    const i = arch.filters.indexOf(f);
    const move = (by: number) => { const next = arch.filters.slice(); next.splice(i + by, 0, next.splice(i, 1)[0]); setArch({ ...arch, filters: next }); };
    const domain = f.kind === "condition" ? conditionToDomain(f.expr, model.fields) : null;
    return <>
      <div className="st-props-head"><h3>{f.label || "Filter"}</h3>
        <button className="btn ghost small danger-text" onClick={() => { setArch({ ...arch, filters: arch.filters.filter((x) => x.id !== f.id) }); setSel(null); }}>Remove</button></div>
      <Prop label="Label"><CommitInput value={f.label} onCommit={(label) => set({ label })} /></Prop>
      <label className="st-prop"><span>Kind</span><span className="segmented" role="group" aria-label="Kind">
        {(["condition", "date"] as const).map((k) => <button key={k} type="button" className={`btn ghost small${f.kind === k ? " active" : ""}`} aria-pressed={f.kind === k}
          onClick={() => set({ kind: k, dateFieldId: k === "date" && !f.dateFieldId ? firstDate?.id ?? "" : f.dateFieldId })}>{k === "condition" ? "Condition" : "Date period"}</button>)}</span></label>
      {f.kind === "condition" ? <>
        <ConditionEditor label="Records that match" value={f.expr} fields={model.fields} onChange={(expr) => set({ expr })} />
        <p className="hint">Use <code>uid</code> as the value for "the current user", e.g. a "My records" filter on a user field.</p>
        {domain ? <p className="hint">Domain: <code>{domain}</code></p> : <p className="hint warn">Add a condition the builder can read.</p>}
      </> : <FieldSelect label="Date field" value={f.dateFieldId} fields={model.fields} none="Choose a field" filter={(x) => isDate(x.ttype)}
        hint="Odoo offers this month, quarter, year and so on for it." onChange={(dateFieldId) => set({ dateFieldId })} />}
      <div className="st-move">
        <button className="btn ghost small" disabled={i === 0} onClick={() => move(-1)}>↑ Move up</button>
        <button className="btn ghost small" disabled={i === arch.filters.length - 1} onClick={() => move(1)}>↓ Move down</button>
      </div>
    </>;
  }
}
