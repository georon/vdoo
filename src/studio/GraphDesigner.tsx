// The graph designer: bar, line or pie, the fields it groups by and the measure it plots.
import { type GraphArch, type GraphChart, type OdooView, GRAPH_CHARTS, defaultGraph, fieldById, isGroupable, isNumeric, replaceView } from "../odoo/studioModel";
import { Check } from "./controls";
import { FieldList, FieldSelect, type ModelProps, ViewHead, labelOf, sampleGroups } from "./viewKit";

type GraphView = Extract<OdooView, { type: "graph" }>;
const CHART_LABEL: Record<GraphChart, string> = { bar: "Bar", line: "Line", pie: "Pie" };
const VALUES = [[62, 38, 20], [88, 22, 35], [45, 51, 12], [70, 30, 44]];
const W = 420, H = 220;

export function GraphDesigner({ app, model, view, onApp }: ModelProps<GraphView>) {
  const arch = view.arch;
  const setArch = (next: GraphArch) => onApp(replaceView(app, { ...view, arch: next }));
  const x = fieldById(model, arch.groupFieldIds[0]), series = fieldById(model, arch.groupFieldIds[1]), measure = fieldById(model, arch.measureFieldId);
  const groups = x ? sampleGroups(x, 4) : ["Total"];
  const parts = series ? sampleGroups(series, 3) : [""];

  return <div className="st-designer">
    <div className="sf-canvas">
      <div className="sg-graph">
        <div className="sl-bar"><span className="sf-btn primary">{measure ? labelOf(measure) : "Count"} ▾</span><b className="sl-title">{model.description}</b>
          <span className="segmented">{GRAPH_CHARTS.map((c) => <span key={c} className={`btn ghost small${arch.chart === c ? " active" : ""}`}>{CHART_LABEL[c]}</span>)}</span></div>
        <svg className="sg-svg" viewBox={`0 0 ${W} ${H + 30}`} role="img" aria-label={`${CHART_LABEL[arch.chart]} chart preview`}>
          {arch.chart === "pie" ? pie() : arch.chart === "line" ? line() : bars()}
        </svg>
        {series && <p className="sg-legend">{parts.map((p, i) => <span key={p}><i className={`c${i % 4}`} />{p}</span>)}</p>}
      </div>
    </div>

    <aside className="st-props" aria-label="Properties">
      <ViewHead app={app} view={view} onApp={onApp}>
        <label className="st-prop"><span>Chart</span><span className="segmented" role="group" aria-label="Chart">
          {GRAPH_CHARTS.map((c) => <button key={c} type="button" className={`btn ghost small${arch.chart === c ? " active" : ""}`} aria-pressed={arch.chart === c}
            onClick={() => setArch({ ...arch, chart: c })}>{CHART_LABEL[c]}</button>)}</span></label>
        {arch.chart !== "pie" && <Check label="Stacked" checked={arch.stacked} onChange={(stacked) => setArch({ ...arch, stacked })} />}
        <FieldList label="Group by" ids={arch.groupFieldIds} fields={model.fields} filter={(f) => isGroupable(f.ttype)}
          hint="The first field is the axis; a second one splits each bar or line." empty="None: one total."
          onChange={(groupFieldIds) => setArch({ ...arch, groupFieldIds })} />
        <FieldSelect label="Measure" value={arch.measureFieldId} fields={model.fields} none="Count of records" filter={(f) => isNumeric(f.ttype)}
          onChange={(measureFieldId) => setArch({ ...arch, measureFieldId })} />
        <button className="btn ghost small" onClick={() => { if (window.confirm("Replace this graph with the default settings?")) setArch(defaultGraph(model)); }}>Reset to the defaults</button>
      </ViewHead>
    </aside>
  </div>;

  function bars() {
    const slot = W / groups.length, bw = arch.stacked || !series ? slot * 0.5 : (slot * 0.7) / parts.length;
    return <>{groups.map((g, gi) => {
      let y = H;
      return <g key={g}>{parts.map((_, pi) => {
        const h = VALUES[gi % 4][pi % 3] * (arch.stacked && series ? 0.9 : 2);
        const bx = arch.stacked || !series ? gi * slot + slot * 0.25 : gi * slot + slot * 0.15 + pi * bw;
        const by = arch.stacked && series ? (y -= h) : H - h;
        return <rect key={pi} className={`c${pi % 4}`} x={bx} y={by} width={bw - 2} height={h} />;
      })}<text x={gi * slot + slot / 2} y={H + 18} textAnchor="middle">{g}</text></g>;
    })}<line className="sg-axis" x1="0" y1={H} x2={W} y2={H} /></>;
  }
  function line() {
    const step = W / Math.max(groups.length - 1, 1);
    return <>{parts.map((_, pi) => <polyline key={pi} className={`sg-line c${pi % 4}`} points={groups.map((_, gi) => `${gi * step},${H - VALUES[gi % 4][pi % 3] * 2}`).join(" ")} />)}
      {groups.map((g, gi) => <text key={g} x={Math.min(Math.max(gi * step, 30), W - 30)} y={H + 18} textAnchor="middle">{g}</text>)}
      <line className="sg-axis" x1="0" y1={H} x2={W} y2={H} /></>;
  }
  function pie() {
    const total = groups.reduce((s, _, i) => s + VALUES[i % 4][0], 0);
    let angle = -Math.PI / 2;
    const cx = W / 2, cy = H / 2 + 10, r = 100;
    if (groups.length === 1) return <circle className="c0" cx={cx} cy={cy} r={r}><title>{groups[0]}</title></circle>;
    return <>{groups.map((g, i) => {
      const a = (VALUES[i % 4][0] / total) * Math.PI * 2, x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
      angle += a;
      const x2 = cx + r * Math.cos(angle), y2 = cy + r * Math.sin(angle);
      return <path key={g} className={`c${i % 4}`} d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${a > Math.PI ? 1 : 0} 1 ${x2},${y2} Z`}><title>{g}</title></path>;
    })}</>;
  }
}
