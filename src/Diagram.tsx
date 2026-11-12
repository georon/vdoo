import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import type { Schema } from "./model";
import { toMermaid } from "./mermaid";

let renders = 0;
let initializedTheme = "";
function setup(dark: boolean) {
  const theme = dark ? "dark" : "default";
  if (initializedTheme === theme) return;
  // strict: Mermaid sanitizes every label, so a column comment can't add markup or script to the page.
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme, er: { useMaxWidth: false }, fontFamily: "inherit" });
  initializedTheme = theme;
}

function useDarkMode() {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const [dark, setDark] = useState(query.matches);
  useEffect(() => {
    const change = () => setDark(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, [query]);
  return dark;
}

interface Props {
  schema: Schema;
  selected: { kind: "table" | "relation"; id: string } | null;
  onTable: (id: string) => void;
  onRelation: (id: string) => void;
  onSvg?: (svg: string) => void;
}

/**
 * Mermaid lays the diagram out. Its SVG names each entity `entity-<name>-<n>` and numbers each relationship line in the
 * order the lines are written, which is how a click is traced back to the table or relationship it belongs to.
 */
export function Diagram({ schema, selected, onTable, onRelation, onSvg }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const dark = useDarkMode();
  const handlers = useRef({ onTable, onRelation, onSvg });
  handlers.current = { onTable, onRelation, onSvg };

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    if (!schema.tables.length) { el.replaceChildren(); setError(""); return; }
    let current = true;
    setup(dark);
    const { text, relationOrder } = toMermaid(schema);
    const tableIds = new Map(schema.tables.map((t) => [t.name, t.id]));
    mermaid.render(`vdoo-diagram-${++renders}`, text).then(({ svg }) => {
      if (!current) return;
      el.innerHTML = svg;
      setError("");
      wire(el, tableIds, relationOrder, handlers);
      handlers.current.onSvg?.(svg);
    }).catch((e: unknown) => {
      if (!current) return;
      setError(e instanceof Error ? e.message.split("\n")[0] : "Mermaid couldn't draw this diagram.");
      document.getElementById(`dvdoo-diagram-${renders}`)?.remove(); // Mermaid leaves its error graphic behind
    });
    return () => { current = false; };
  }, [schema, dark]);

  // Marks the selection without drawing the diagram again.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.querySelectorAll(".vdoo-selected").forEach((n) => n.classList.remove("vdoo-selected"));
    if (selected) el.querySelectorAll(`[data-vdoo-${selected.kind}="${CSS.escape(selected.id)}"]`).forEach((n) => n.classList.add("vdoo-selected"));
  });

  return <div className="diagram-wrap">
    <div className="diagram-scroll" onWheel={(event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoom((z) => clamp(z * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
    }}>
      {!schema.tables.length && <div className="diagram-empty"><p>No tables yet.</p><p>Add a table, paste Mermaid in the Source tab, or ask AI to design one.</p></div>}
      <div ref={host} className="diagram" style={{ transform: `scale(${zoom})` }} aria-label="ER diagram" role="img" />
    </div>
    <div className="zoom" role="group" aria-label="Zoom">
      <button className="pill-btn" title="Zoom out" aria-label="Zoom out" onClick={() => setZoom((z) => clamp(z / 1.2))}>−</button>
      <button className="pill-btn zoom-level" title="Reset zoom" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
      <button className="pill-btn" title="Zoom in" aria-label="Zoom in" onClick={() => setZoom((z) => clamp(z * 1.2))}>+</button>
    </div>
    {error && <div className="diagram-error" role="alert">{error}</div>}
  </div>;
}

const clamp = (z: number) => Math.min(4, Math.max(0.2, z));

type Handlers = React.RefObject<{ onTable: (id: string) => void; onRelation: (id: string) => void }>;

function wire(el: HTMLElement, tableIds: Map<string, string>, relationOrder: string[], handlers: Handlers) {
  const bind = (node: Element, kind: "table" | "relation", id: string, label: string) => {
    node.setAttribute(`data-vdoo-${kind}`, id);
    node.classList.add("vdoo-clickable");
    node.setAttribute("tabindex", "0");
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", label);
    const open = () => (kind === "table" ? handlers.current.onTable(id) : handlers.current.onRelation(id));
    node.addEventListener("click", (event) => { event.stopPropagation(); open(); });
    node.addEventListener("keydown", (event) => {
      const key = (event as KeyboardEvent).key;
      if (key === "Enter" || key === " ") { event.preventDefault(); open(); }
    });
  };

  for (const node of el.querySelectorAll("g.node")) {
    const match = /entity-(.+)-\d+$/.exec(node.id || node.getAttribute("data-id") || "");
    const id = match && tableIds.get(match[1]);
    if (id) bind(node, "table", id, `Edit table ${match[1]}`);
  }

  const edgeIndex = (node: Element) => {
    const match = /_(\d+)$/.exec(node.getAttribute("data-id") || node.id || "");
    return match ? Number(match[1]) : -1;
  };
  const lines = [...el.querySelectorAll("path.relationshipLine")];
  lines.forEach((path, position) => {
    const index = edgeIndex(path);
    const id = relationOrder[index >= 0 ? index : position];
    if (!id) return;
    // A wide, invisible copy of the line makes thin and dashed lines easy to click.
    const hit = path.cloneNode() as SVGPathElement;
    hit.removeAttribute("id");
    hit.removeAttribute("marker-start");
    hit.removeAttribute("marker-end");
    hit.removeAttribute("style");
    hit.setAttribute("class", "vdoo-hit");
    path.after(hit);
    bind(hit, "relation", id, "Edit relationship");
    path.setAttribute("data-vdoo-relation", id);
  });
  const labels = [...el.querySelectorAll("g.edgeLabel")];
  labels.forEach((label, position) => {
    const index = edgeIndex(label.querySelector("[data-id]") ?? label);
    const id = relationOrder[index >= 0 ? index : position];
    if (id && label.textContent?.trim()) bind(label, "relation", id, `Edit relationship ${label.textContent.trim()}`);
  });
}
