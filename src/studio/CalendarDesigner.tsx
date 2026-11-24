// The calendar designer: which dates place a record, its colour, the default range and the popover's fields.
import { type CalendarArch, type CalendarMode, type OdooView, CALENDAR_MODES, defaultCalendar, fieldById, isDate, isGroupable, replaceView } from "../odoo/studioModel";
import { Check, Prop } from "./controls";
import { sampleValue } from "./preview";
import { FieldList, FieldSelect, type ModelProps, ViewHead, labelOf } from "./viewKit";

type CalendarView = Extract<OdooView, { type: "calendar" }>;
const MODE_LABEL: Record<CalendarMode, string> = { day: "Day", week: "Week", month: "Month", year: "Year" };
/** Sample events: day of the month, length in days, sample row. */
const EVENTS: [number, number, number][] = [[3, 1, 0], [9, 2, 1], [16, 1, 2], [17, 1, 0], [24, 3, 1]];

export function CalendarDesigner({ app, model, view, onApp }: ModelProps<CalendarView>) {
  const arch = view.arch;
  const setArch = (next: CalendarArch) => onApp(replaceView(app, { ...view, arch: next }));
  const start = fieldById(model, arch.dateStartFieldId), stop = fieldById(model, arch.dateStopFieldId), color = fieldById(model, arch.colorFieldId);
  const name = fieldById(model, model.recName) ?? model.fields.find((f) => f.name === "name");
  const popover = arch.popoverFieldIds.map((id) => fieldById(model, id)).filter((f) => !!f);
  // November 2026 starts on a Sunday; the grid shows Monday-first weeks.
  const cells = Array.from({ length: 35 }, (_, i) => i - 5);

  return <div className="st-designer">
    <div className="sf-canvas">
      <div className="sc-calendar">
        <div className="sl-bar"><span className="sf-btn primary">New</span><b className="sl-title">November 2026</b>
          <span className="segmented sc-modes">{CALENDAR_MODES.map((m) => <span key={m} className={`btn ghost small${arch.mode === m ? " active" : ""}`}>{MODE_LABEL[m]}</span>)}</span></div>
        {!start ? <p className="st-empty sc-empty">Choose the date field that places each record on the calendar.</p> : <>
          <div className="sc-grid">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <b key={d} className="sc-day-name">{d}</b>)}
            {cells.map((day, i) => <div key={i} className={`sc-cell${day < 1 || day > 30 ? " out" : ""}`}>
              <small>{day < 1 ? 31 + day : day > 30 ? day - 30 : day}</small>
              {EVENTS.filter(([d]) => d === day).map(([d, len, row]) =>
                <span key={d} className={`sc-event c${color ? row % 3 : 0}`} style={stop ? { width: `calc(${len * 100}% + ${(len - 1) * 1}px)` } : undefined}>
                  {start.ttype === "datetime" && !arch.allDayFieldId ? `${["09:30", "14:00", "16:45"][row]} ` : ""}{name ? sampleValue(name, row) : "Record"}</span>)}
              {day === 9 && popover.length > 0 && <span className="sc-popover">
                <b>{name ? sampleValue(name, 1) : "Record"}</b>{popover.map((f) => <span key={f!.id}><i>{labelOf(f)}</i> {sampleValue(f!, 1)}</span>)}</span>}
            </div>)}
          </div>
          {color && <p className="hint sc-legend">Colour by {labelOf(color)}.</p>}
        </>}
      </div>
    </div>

    <aside className="st-props" aria-label="Properties">
      <ViewHead app={app} view={view} onApp={onApp}>
        <FieldSelect label="Start" value={arch.dateStartFieldId} fields={model.fields} none="Choose a field" filter={(f) => isDate(f.ttype)}
          onChange={(id) => setArch({ ...arch, dateStartFieldId: id, dateStopFieldId: fieldById(model, arch.dateStopFieldId)?.ttype === fieldById(model, id)?.ttype ? arch.dateStopFieldId : "" })} />
        <FieldSelect label="End" value={arch.dateStopFieldId} fields={model.fields} none="No end (one-day events)" filter={(f) => f.id !== start?.id && f.ttype === start?.ttype}
          hint="Same type as the start." onChange={(dateStopFieldId) => setArch({ ...arch, dateStopFieldId })} />
        <FieldSelect label="All day" value={arch.allDayFieldId} fields={model.fields} filter={(f) => f.ttype === "boolean"}
          hint="A checkbox: when ticked, the event fills the whole day." onChange={(allDayFieldId) => setArch({ ...arch, allDayFieldId })} />
        <FieldSelect label="Colour by" value={arch.colorFieldId} fields={model.fields} filter={(f) => isGroupable(f.ttype)} onChange={(colorFieldId) => setArch({ ...arch, colorFieldId })} />
        <Prop label="Opens on"><select value={arch.mode} onChange={(e) => setArch({ ...arch, mode: e.target.value as CalendarMode })}>
          {CALENDAR_MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}</select></Prop>
        <Check label="Quick create (type a name on a day)" checked={arch.quickCreate} onChange={(quickCreate) => setArch({ ...arch, quickCreate })} />
        <FieldList label="Popover fields" ids={arch.popoverFieldIds} fields={model.fields} filter={(f) => f.ttype !== "one2many" && f.ttype !== "html"}
          hint="Shown when someone clicks an event." onChange={(popoverFieldIds) => setArch({ ...arch, popoverFieldIds })} />
        <button className="btn ghost small" onClick={() => { if (window.confirm("Replace this calendar with the default settings?")) setArch(defaultCalendar(model)); }}>Reset to the defaults</button>
      </ViewHead>
    </aside>
  </div>;
}
