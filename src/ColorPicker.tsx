import { useEffect, useRef, useState } from "react";
import { TABLE_COLORS, TABLE_COLOR_ALPHA } from "./model";

/** The see-through colour as it is drawn in the diagram. */
export const highlight = (hex: string) => `${hex}${TABLE_COLOR_ALPHA}`;

/**
 * A button showing the table's highlight; pressing it opens a small palette of light, see-through colours.
 * Arrow keys move between the swatches, Escape closes, and "None" removes the highlight.
 */
export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = TABLE_COLORS.find((c) => c.hex === value);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const onDown = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", onDown, true);
    return () => window.removeEventListener("mousedown", onDown, true);
  }, [open]);

  const pick = (hex: string) => { onChange(hex); setOpen(false); root.current?.querySelector<HTMLElement>(".color-button")?.focus(); };
  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") { event.stopPropagation(); setOpen(false); root.current?.querySelector<HTMLElement>(".color-button")?.focus(); return; }
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const items = [...(root.current?.querySelectorAll<HTMLElement>(".color-palette [role='radio']") ?? [])];
    items[(items.indexOf(document.activeElement as HTMLElement) + step + items.length) % items.length]?.focus();
  };

  return <div ref={root} className="color-picker">
    <button type="button" className="btn ghost color-button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span className={`swatch${value ? "" : " none"}`} style={value ? { background: highlight(value) } : undefined} aria-hidden="true" />
      {current?.name ?? (value || "None")}
    </button>
    {open && <div className="color-palette" role="radiogroup" aria-label="Highlight colour" onKeyDown={onKey}>
      <button type="button" role="radio" aria-checked={!value} className="swatch none" title="None" aria-label="No highlight" onClick={() => pick("")} />
      {TABLE_COLORS.map((c) => <button type="button" key={c.hex} role="radio" aria-checked={c.hex === value} className="swatch" title={c.name} aria-label={c.name}
        style={{ background: highlight(c.hex) }} onClick={() => pick(c.hex)} />)}
    </div>}
  </div>;
}
