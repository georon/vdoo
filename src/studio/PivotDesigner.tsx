// The pivot designer: row and column groupings and the measures summed in each cell.
import { type OdooView, type PivotArch, defaultPivot, fieldById, isGroupable, isNumeric, replaceView } from "../odoo/studioModel";
import { FieldList, type ModelProps, ViewHead, labelOf, sampleGroups } from "./viewKit";

type PivotView = Extract<OdooView, { type: "pivot" }>;
const NUMBERS = [[1250, 480, 72.5], [3100, 0, 845], [640, 1520, 210], [95, 300, 1180]];

export function PivotDesigner({ app, model, view, onApp }: ModelProps<PivotView>) {
  const arch = view.arch;
  const setArch = (next: PivotArch) => onApp(replaceView(app, { ...view, arch: next }));
  const row = fieldById(model, arch.rowFieldIds[0]), col = fieldById(model, arch.colFieldIds[0]);
  const measures = arch.measureFieldIds.map((id) => fieldById(model, id)).filter((f) => !!f);
  const heads = measures.length ? measures.map((f) => labelOf(f)) : ["Count"];
  const rows = row ? sampleGroups(row, 4) : [];
  const cols = col ? sampleGroups(col, 3) : [];
  const colCount = Math.max(cols.length, 1);
  const rowCount = Math.max(rows.length, 1);
  const money = (m: number) => measures.length > 0 && measures[m]!.ttype !== "integer";
  /** A sample cell: c === colCount is the column total, r === -1 the row total, so the totals add up. */
  const raw = (r: number, c: number, m: number): number => {
    if (r < 0) return Array.from({ length: rowCount }, (_, i) => raw(i, c, m)).reduce((a, b) => a + b, 0);
    if (col && c === colCount) return Array.from({ length: colCount }, (_, j) => raw(r, j, m)).reduce((a, b) => a + b, 0);
    const n = NUMBERS[r % 4][(c + m) % 3];
    return money(m) ? n : Math.round(n / 100) || 1;
  };
  const value = (r: number, c: number, m: number) => { const n = raw(r, c, m); return money(m) ? n.toLocaleString("en-US", { minimumFractionDigits: 2 }) : String(n); };

  return <div className="st-designer">
    <div className="sf-canvas">
      <div className="sp-pivot">
        <div className="sl-bar"><span className="sf-btn primary">Measures ▾</span><b className="sl-title">{model.description}</b></div>
        <table className="sl-table sp-table">
          <thead>
            <tr><th rowSpan={col ? 3 : 2} /><th colSpan={(col ? colCount + 1 : 1) * heads.length}>⊟ Total</th></tr>
            {col && <tr>{cols.map((c) => <th key={c} colSpan={heads.length}>⊞ {c}</th>)}<th colSpan={heads.length}>Total</th></tr>}
            <tr>{Array.from({ length: col ? colCount + 1 : 1 }).flatMap((_, c) => heads.map((h) => <th key={`${c}-${h}`} className="num">{h}</th>))}</tr>
          </thead>
          <tbody>
            <tr className="sp-total"><th>⊟ Total</th>{Array.from({ length: col ? colCount + 1 : 1 }).flatMap((_, c) => heads.map((h, m) => <td key={`${c}-${h}`} className="num">{value(-1, c, m)}</td>))}</tr>
            {rows.map((r, i) => <tr key={r}><th className="sp-row">⊞ {r}</th>
              {Array.from({ length: col ? colCount + 1 : 1 }).flatMap((_, c) => heads.map((h, m) => <td key={`${c}-${h}`} className="num">{value(i, c, m)}</td>))}</tr>)}
          </tbody>
        </table>
        {!row && !col && <p className="hint">Add row or column groupings to break the totals down.</p>}
        {(arch.rowFieldIds.length > 1 || arch.colFieldIds.length > 1) && <p className="hint">Further groupings open as nested levels in Odoo.</p>}
      </div>
    </div>

    <aside className="st-props" aria-label="Properties">
      <ViewHead app={app} view={view} onApp={onApp}>
        <FieldList label="Rows" ids={arch.rowFieldIds} fields={model.fields} filter={(f) => isGroupable(f.ttype) && !arch.colFieldIds.includes(f.id)}
          empty="No row groups." onChange={(rowFieldIds) => setArch({ ...arch, rowFieldIds })} />
        <FieldList label="Columns" ids={arch.colFieldIds} fields={model.fields} filter={(f) => isGroupable(f.ttype) && !arch.rowFieldIds.includes(f.id)}
          empty="No column groups." hint="A date groups by month." onChange={(colFieldIds) => setArch({ ...arch, colFieldIds })} />
        <FieldList label="Measures" ids={arch.measureFieldIds} fields={model.fields} filter={(f) => isNumeric(f.ttype)}
          empty="None: the cells count records." hint="Number fields, summed in each cell." onChange={(measureFieldIds) => setArch({ ...arch, measureFieldIds })} />
        <button className="btn ghost small" onClick={() => { if (window.confirm("Replace this pivot with the default settings?")) setArch(defaultPivot(model)); }}>Reset to the defaults</button>
      </ViewHead>
    </aside>
  </div>;
}
