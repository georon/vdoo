import { type ReactNode, useEffect, useRef } from "react";

/** A dialog over the editor. Escape cancels; focus moves inside and comes back to where it was. */
export function Modal({ title, onClose, children, wide, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>("[autofocus], input, select, textarea, button")?.focus();
    return () => previous?.focus?.();
  }, []);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={box} className={`modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); onClose(); }
        if (event.key !== "Tab") return;
        const items = [...(box.current?.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex='0']") ?? [])].filter((n) => !n.hasAttribute("disabled"));
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <header className="modal-head"><h2>{title}</h2>
        <button className="pill-btn" aria-label="Close" title="Close" onClick={onClose}>×</button></header>
      <div className="modal-body">{children}</div>
      {footer && <footer className="modal-foot">{footer}</footer>}
    </div>
  </div>;
}
