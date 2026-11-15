import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Modal } from "./Modal";

/**
 * Asks for the Odoo password and signs in with it. Show it whenever a connection to Odoo is needed: the password is
 * used for that one sign-in and never saved. Stays open on a wrong password; `onConnected` gets what the server reported.
 */
export function OdooPasswordDialog({ odoo, status, onConnected, onClose }: { odoo: VdooOdoo; status: OdooStatus;
  onConnected: (connection: OdooConnection) => void; onClose: () => void }) {
  const password = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // After the Modal has focused its first control (the close button).
  useEffect(() => { password.current?.focus(); }, []);
  const host = (() => { try { return new URL(status.url).host; } catch { return status.url; } })();
  const connect = async () => {
    const value = password.current?.value ?? "";
    if (!value) { setError("Enter the password."); password.current?.focus(); return; }
    if (password.current) password.current.value = "";
    setError(""); setBusy(true);
    try {
      const result = await odoo.connect(value);
      if (result.ok && result.connection) { onConnected(result.connection); return; }
      setError(result.error || "Couldn't connect to Odoo.");
    } catch { setError("Couldn't connect to Odoo. Try again."); }
    setBusy(false);
    setTimeout(() => password.current?.focus());
  };
  // In a portal, so it also works from inside another dialog (Settings) without sharing its focus trap.
  return createPortal(<Modal title="Odoo password" onClose={() => { if (!busy) onClose(); }}>
    <form className="odoo-password" onSubmit={(event) => { event.preventDefault(); void connect(); }}>
      <p>Enter the password for <strong>{status.user}</strong> at <strong>{host}</strong>.</p>
      <input ref={password} type="password" aria-label="Odoo password" autoComplete="off" spellCheck={false} maxLength={1024} disabled={busy} />
      <p className="hint">vdoo uses the password for this connection only and doesn't save it.</p>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="odoo-actions">
        <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy}>{busy ? "Connecting…" : "Connect"}</button>
      </div>
    </form>
  </Modal>, document.body);
}
