import { useEffect, useState } from "react";
import { baseName } from "./textEdit";

interface Props {
  /** The open folder, or null when none has been chosen yet. */
  folder: string | null;
  /** Path of the file in the active tab, to mark it in the tree. */
  activePath: string | null;
  /** Changes when the folder's contents may have changed; open folders are read again. */
  version: number;
  onOpenFile: (path: string) => void;
  onChooseFolder: () => void;
  onRefresh: () => void;
}

/** The folder tree in the left pane. Sub-folders are read when they are first opened. */
export function Explorer({ folder, activePath, version, onOpenFile, onChooseFolder, onRefresh }: Props) {
  if (!window.vdooDesktop) return <div className="explorer empty"><p>Folders can be browsed in the desktop app. Here, use File › Open file.</p></div>;
  if (!folder) return <div className="explorer empty">
    <p>No folder open.</p>
    <button className="btn ghost" onClick={onChooseFolder}>Open folder</button>
  </div>;
  return <div className="explorer">
    <div className="explorer-head">
      <span className="explorer-name" title={folder}>{baseName(folder)}</span>
      <button className="pill-btn" title="Refresh" aria-label="Refresh folder" onClick={onRefresh}>⟳</button>
      <button className="pill-btn" title="Open another folder" aria-label="Open another folder" onClick={onChooseFolder}>…</button>
    </div>
    <div className="tree" role="tree" aria-label="Files">
      <Folder key={folder} path={folder} depth={0} activePath={activePath} version={version} onOpenFile={onOpenFile} />
    </div>
  </div>;
}

function Folder({ path, depth, activePath, version, onOpenFile }: { path: string; depth: number; activePath: string | null; version: number; onOpenFile: (path: string) => void }) {
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    let current = true;
    window.vdooDesktop!.files.list(path).then(
      (list) => { if (current) { setEntries(list); setError(false); } },
      () => { if (current) { setEntries([]); setError(true); } });
    return () => { current = false; };
  }, [path, version]);

  const indent = { paddingLeft: 8 + depth * 14 };
  if (error) return <p className="tree-msg" style={indent}>Can't read this folder.</p>;
  if (!entries) return <p className="tree-msg" style={indent}>Loading…</p>;
  if (!entries.length) return <p className="tree-msg" style={indent}>(empty)</p>;
  const toggle = (dir: string) => setOpen((was) => { const next = new Set(was); if (!next.delete(dir)) next.add(dir); return next; });

  return <ul role="group">
    {entries.map((entry) => entry.isDir
      ? <li key={entry.path} role="treeitem" aria-expanded={open.has(entry.path)}>
        <button className="tree-row" style={indent} title={entry.path} onClick={() => toggle(entry.path)}>
          <span className="tree-arrow" aria-hidden="true">{open.has(entry.path) ? "▾" : "▸"}</span><span className="tree-name">{entry.name}</span>
        </button>
        {open.has(entry.path) && <Folder path={entry.path} depth={depth + 1} activePath={activePath} version={version} onOpenFile={onOpenFile} />}
      </li>
      : <li key={entry.path} role="treeitem" aria-selected={entry.path === activePath}>
        <button className={`tree-row file${entry.path === activePath ? " active" : ""}`} style={indent} title={entry.path} onClick={() => onOpenFile(entry.path)}>
          <span className="tree-arrow" aria-hidden="true" /><span className="tree-name">{entry.name}</span>
        </button>
      </li>)}
  </ul>;
}
