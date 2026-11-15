import { useEffect, useRef, useState } from "react";

export type MenuItem = "separator" | { label: string; shortcut?: string; disabled?: boolean; checked?: boolean; onSelect: () => void };
export interface Menu { label: string; items: MenuItem[] }

/**
 * The menu bar across the top. Click a title to open its menu; while one is open, pointing at another title
 * switches to it. Arrow keys move, Escape closes. Pressing a menu never takes the focus from the editor, so
 * Edit commands act on the text that was selected.
 */
export function MenuBar({ menus }: { menus: Menu[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const [highlight, setHighlight] = useState(-1);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === null) return;
    const items = menus[open].items;
    const step = (from: number, by: number) => {
      for (let i = 1; i <= items.length; i++) {
        const at = (from + by * i + items.length * i) % items.length;
        const item = items[at];
        if (item !== "separator" && !item.disabled) return at;
      }
      return -1;
    };
    const onKey = (event: KeyboardEvent) => {
      const move = (menu: number) => { setOpen((menu + menus.length) % menus.length); setHighlight(-1); };
      if (event.key === "Escape") setOpen(null);
      else if (event.key === "ArrowRight") move(open + 1);
      else if (event.key === "ArrowLeft") move(open - 1);
      else if (event.key === "ArrowDown") setHighlight((h) => step(h, 1));
      else if (event.key === "ArrowUp") setHighlight((h) => step(h < 0 ? 0 : h, -1));
      else if (event.key === "Enter" && highlight >= 0) {
        const item = items[highlight];
        setOpen(null);
        if (item !== "separator" && !item.disabled) item.onSelect();
      } else return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onDown = (event: MouseEvent) => { if (!bar.current?.contains(event.target as Node)) setOpen(null); };
    const close = () => setOpen(null);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("blur", close);
    };
  }, [open, highlight, menus]);

  return <div ref={bar} className="menubar" role="menubar" onMouseDown={(event) => event.preventDefault()}>
    {menus.map((menu, index) => <div key={menu.label} className="menu">
      <button role="menuitem" aria-haspopup="menu" aria-expanded={open === index} tabIndex={-1} className={`menu-title${open === index ? " open" : ""}`}
        onClick={() => { setOpen(open === index ? null : index); setHighlight(-1); }}
        onMouseEnter={() => { if (open !== null && open !== index) { setOpen(index); setHighlight(-1); } }}>{menu.label}</button>
      {open === index && <div className="menu-list" role="menu" aria-label={menu.label}>
        {menu.items.map((item, i) => item === "separator" ? <div key={i} className="menu-sep" role="separator" />
          : <button key={i} role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"} aria-checked={item.checked} tabIndex={-1} disabled={item.disabled}
            className={`menu-item${highlight === i ? " highlight" : ""}`} onMouseEnter={() => setHighlight(i)}
            onClick={() => { setOpen(null); item.onSelect(); }}>
            <span className="menu-check" aria-hidden="true">{item.checked ? "✓" : ""}</span>
            <span className="menu-label">{item.label}</span>
            {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
          </button>)}
      </div>}
    </div>)}
  </div>;
}
