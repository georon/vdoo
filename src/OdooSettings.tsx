import { useEffect, useRef, useState } from "react";
import { OdooPasswordDialog } from "./OdooPasswordDialog";

export function OdooSettings({ odoo }: { odoo: VdooOdoo }) {
  const url = useRef<HTMLInputElement>(null);
  const user = useRef<HTMLInputElement>(null);
  const database = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<OdooStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { void odoo.status().then(setStatus).catch(() => setError("Couldn't read the Odoo settings.")); }, [odoo]);

  /** Saves what is in the fields; returns whether it worked. */
  const save = async () => {
    setNotice(""); setError(""); setBusy(true);
    try {
      const result = await odoo.save({ url: url.current?.value.trim() ?? "", user: user.current?.value.trim() ?? "", database: database.current?.value.trim() ?? "" });
      if (!result.ok || !result.status) { setError(result.error || "Couldn't save the Odoo settings."); return false; }
      setStatus(result.status);
      // Show what was stored: the address without a trailing slash, admin for an empty user.
      if (url.current) url.current.value = result.status.url;
      if (user.current) user.current.value = result.status.user;
      return true;
    } catch { setError("Couldn't save the Odoo settings. Try again."); return false; }
    finally { setBusy(false); }
  };

  if (!status) return error ? <p role="alert" className="form-error">{error}</p> : <p className="hint">Reading settings…</p>;
  // The password dialog sits outside the form: React events bubble through portals, and its submit must not save.
  return <><form className="odoo-settings" onSubmit={async (event) => { event.preventDefault(); if (await save()) setNotice("Saved."); }}>
    <p className="settings-hint">The Odoo server vdoo connects to. Addresses must use https, except on this computer or your local network,
      where vdoo asks first. The password is not kept here: vdoo asks for it each time it connects.</p>
    <div className="odoo-fields">
      <label>Odoo URL
        <input ref={url} type="url" autoComplete="off" spellCheck={false} maxLength={512} required disabled={busy}
          placeholder="http://localhost:8069" defaultValue={status.url} /></label>
      <label>Admin user
        <input ref={user} type="text" autoComplete="off" spellCheck={false} maxLength={256} disabled={busy}
          placeholder="admin" defaultValue={status.user} /></label>
      <label>Database (optional)
        <input ref={database} type="text" autoComplete="off" spellCheck={false} maxLength={63} disabled={busy}
          placeholder="The server's only database" defaultValue={status.database} /></label>
    </div>
    <div className="odoo-actions">
      <button className="btn ghost" disabled={busy}>Save</button>
      <button type="button" className="btn ghost" disabled={busy} onClick={async () => {
        if (!url.current?.reportValidity()) return;
        if (await save()) setAsking(true);
      }}>Test connection</button>
    </div>
    {notice && <p role="status" className="settings-hint">{notice}</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </form>
    {asking && <OdooPasswordDialog odoo={odoo} status={status} onClose={() => setAsking(false)} onConnected={(c) => {
      setAsking(false);
      setNotice(`Connection verified: Odoo ${c.version}, database ${c.database}, signed in as ${c.user}.`
        + (c.isAdmin ? "" : " This user is not an administrator."));
    }} />}
  </>;
}
