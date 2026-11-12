import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { CLAUDE_CODE_URL, PROVIDERS, savedProvider, saveAiPreference, signInChatGPT, type AiProvider } from "./ai";
import { CustomEndpointSettings } from "./CustomEndpointSettings";

export function Settings({ onClose }: { onClose: () => void }) {
  const ai = window.vdooDesktop?.ai;
  const [provider, setProvider] = useState<AiProvider>(savedProvider);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  useEffect(() => { void ai?.status().then(setStatus).catch(() => setError("Couldn't check AI connections.")); }, [ai]);

  return <Modal title="Settings" onClose={onClose}>
    <section className="settings">
      <h3>Ask AI</h3>
      {!ai ? <p className="hint">Ask AI is available in the desktop app.</p> : <>
        <label className="settings-row">Provider
          <select aria-label="AI provider" value={provider} onChange={(e) => {
            const next = e.target.value as AiProvider;
            setProvider(next); setError(null); saveAiPreference("vdoo:ai-provider", next);
          }}>{Object.entries(PROVIDERS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
        </label>
        {!status ? <p className="hint">Checking connection…</p>
        : provider === "claude" ? <div className="settings-row">
            <div className="settings-label"><span>Claude</span><small>{!status.claude.installed
              ? <>Uses your Claude subscription through <a href={CLAUDE_CODE_URL} onClick={(e) => { e.preventDefault(); void window.vdooDesktop?.openLink(CLAUDE_CODE_URL); }}>Claude Code</a> or Claude for Windows. Install it and sign in once.</>
              : status.claude.loggedIn ? `Claude Code ${status.claude.version ?? ""} is signed in${status.claude.subscription ? " with your Claude subscription" : ""}.`
              : "Claude Code is installed but not signed in. Run claude in a terminal and sign in."}</small></div>
            <button className="btn ghost" onClick={async () => setStatus({ ...status, claude: await ai.recheckClaude() })}>Check again</button>
          </div>
        : provider === "chatgpt" ? <div className="settings-row">
            <div className="settings-label"><span>ChatGPT</span><small>{status.chatgpt.connected ? `Signed in${status.chatgpt.email ? ` as ${status.chatgpt.email}` : ""}.` : "Use your ChatGPT plan. No API key needed."}</small></div>
            {status.chatgpt.connected
              ? <button className="btn ghost" onClick={async () => setStatus({ ...status, chatgpt: await ai.signOutChatGPT() })}>Sign out</button>
              : <button className="btn primary" onClick={async () => {
                  setSigningIn(true); setError(null);
                  const result = await signInChatGPT(ai);
                  setSigningIn(false); setError(result.error); setStatus(result.status);
                }}>{signingIn ? "Open the sign-in page again" : "Continue with ChatGPT"}</button>}
          </div>
        : <CustomEndpointSettings ai={ai} status={status.custom} onStatus={(custom) => setStatus({ ...status, custom })} />}
        {error && <p className="form-error" role="alert">{error}</p>}
      </>}
    </section>
  </Modal>;
}
