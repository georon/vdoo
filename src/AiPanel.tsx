import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CLAUDE_CODE_URL, PROVIDERS, savedProvider, saveAiPreference, signInChatGPT, subscribeAiPreferences, USAGE_URL } from "./ai";
import { AiMarkdown } from "./AiMarkdown";
import { readSetting } from "./preferences";
import type { Schema } from "./model";
import { toMermaid } from "./mermaid";

interface Message extends AiMessage {
  error?: { message: string; code?: string; link?: string };
}

const CLAUDE_MODELS = [
  { id: "", name: "Default model" },
  { id: "sonnet", name: "Sonnet" },
  { id: "opus", name: "Opus" },
  { id: "haiku", name: "Haiku" },
];

/** What the assistant sees: the schema as Mermaid (easy to read and to answer in) and as JSON (every detail). */
function schemaDocument(schema: Schema) {
  const json = JSON.stringify({
    tables: schema.tables.map((t) => ({ name: t.name, comment: t.comment || undefined,
      columns: t.columns.map((c) => ({ name: c.name, type: c.type, pk: c.pk || undefined, nullable: c.nullable, unique: c.unique || undefined, comment: c.comment || undefined })) })),
    relations: schema.relations.map((r) => {
      const parent = schema.tables.find((t) => t.id === r.parent), child = schema.tables.find((t) => t.id === r.child);
      return { parent: parent?.name, child: child?.name, parentCardinality: r.parentCard, childCardinality: r.childCard, identifying: r.identifying, label: r.label,
        foreignKey: r.columns.map((p) => `${child?.name}.${child?.columns.find((c) => c.id === p.fk)?.name} -> ${parent?.name}.${parent?.columns.find((c) => c.id === p.ref)?.name}`) };
    }),
  });
  return { name: schema.name, text: `${toMermaid(schema).text}\nJSON:\n${json}`, truncated: false, recognized: false };
}

const SUGGESTIONS_EMPTY = ["Design a schema for an online store", "Design a schema for a library with members and loans", "Design a blog with posts, tags and comments"];
const SUGGESTIONS = ["Review this schema for problems", "Suggest indexes for common queries", "Normalize this schema to 3NF", "Explain the relationships"];

export function AiPanel({ schema, onApply, onSettings, onClose }: { schema: Schema; onApply: (mermaid: string) => void; onSettings: () => void; onClose: () => void }) {
  const ai = window.vdooDesktop?.ai;
  const [status, setStatus] = useState<AiStatus | null>(null);
  const provider = useSyncExternalStore(subscribeAiPreferences, savedProvider);
  const keyRevision = useSyncExternalStore(subscribeAiPreferences, () => readSetting("vdoo:ai-key-revision"));
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const modelKey = `vdoo:ai-model:${provider}`;
  const savedModel = useSyncExternalStore(subscribeAiPreferences, () => readSetting(modelKey) ?? "");
  const model = provider === "chatgpt" && models.length && !models.some((m) => m.id === savedModel) ? models[0].id : savedModel;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const busyRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current = true;
    void ai?.status().then((value) => { if (current) setStatus(value); }).catch(() => { if (current) setSetupError("Couldn't check AI connections."); });
    return () => { current = false; };
  }, [ai, keyRevision]);

  const chatgptConnected = !!status?.chatgpt.connected;
  useEffect(() => {
    setSetupError(null);
    if (!ai || provider !== "chatgpt" || !chatgptConnected) return;
    let current = true;
    void ai.chatgptModels().then((result) => {
      if (!current) return;
      if (!result.ok) { if (result.code === "signed_out") void ai.status().then(setStatus); setSetupError(result.error ?? null); return; }
      setModels(result.models ?? []);
    });
    return () => { current = false; };
  }, [ai, provider, chatgptConnected]);

  useEffect(() => {
    if (!ai) return;
    return ai.onEvent((event) => {
      if (event.id !== busyRef.current) return;
      setMessages((list) => {
        const next = list.slice();
        const last = next[next.length - 1];
        if (!last || last.role !== "assistant") return list;
        if (event.type === "delta") next[next.length - 1] = { ...last, content: last.content + (event.text ?? "") };
        if (event.type === "error") next[next.length - 1] = { ...last, error: { message: event.message ?? "Something went wrong.", code: event.code, link: event.link } };
        return next;
      });
      if (event.type !== "delta") {
        busyRef.current = null;
        setBusy(null);
        if (event.code === "signed_out") void ai.status().then(setStatus);
      }
    });
  }, [ai]);

  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages]);
  // Closing the panel ends an answer in progress, as Stop does.
  useEffect(() => () => { if (busyRef.current) void ai?.cancel(busyRef.current); }, [ai]);

  const connected = { chatgpt: chatgptConnected, claude: !!status?.claude.installed && status.claude.loggedIn, custom: !!status?.custom?.configured && !!model };
  const ready = !!status && connected[provider];

  const send = useCallback(async (question: string) => {
    if (!ai || !question.trim() || busyRef.current || !ready) return;
    const turn: Message = { role: "user", content: question.trim() };
    const history = [...messages.filter((m) => !m.error && m.content), turn];
    const id = crypto.randomUUID();
    busyRef.current = id;
    setBusy(id);
    setMessages([...messages, turn, { role: "assistant", content: "" }]);
    setInput("");
    try {
      await ai.ask({ id, provider, model, document: schemaDocument(schema), messages: history.map(({ role, content }) => ({ role, content })) });
    } catch {
      if (busyRef.current !== id) return;
      busyRef.current = null;
      setBusy(null);
      setMessages((list) => { const next = list.slice(); next[next.length - 1] = { role: "assistant", content: "", error: { message: "vdoo couldn't send that question." } }; return next; });
    }
  }, [ai, messages, provider, model, schema, ready]);

  const signIn = async () => {
    if (!ai) return;
    setSigningIn(true); setSetupError(null);
    const result = await signInChatGPT(ai);
    setSigningIn(false); setSetupError(result.error); setStatus(result.status);
  };

  return <aside className="ai-panel" aria-label="Ask AI">
    <header className="ai-head">
      <strong>Ask AI</strong>
      {ai && <select className="ai-provider" aria-label="AI provider" value={provider} disabled={!!busy} onChange={(e) => saveAiPreference("vdoo:ai-provider", e.target.value)}>
        {Object.entries(PROVIDERS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>}
      <span className="spacer" />
      <button className="pill-btn" title="New conversation" aria-label="New conversation" disabled={!messages.length || !!busy} onClick={() => setMessages([])}>+</button>
      <button className="pill-btn" title="Close" aria-label="Close Ask AI" onClick={onClose}>×</button>
    </header>

    <div className="ai-body" ref={listRef}>
      {!ai ? <div className="ai-card"><p>Ask AI is available in the vdoo desktop app.</p></div>
      : !status ? <p className="hint">Checking connections…</p>
      : provider === "claude" && !connected.claude ? <div className="ai-card">
          <h3>Use your Claude subscription</h3>
          {!status.claude.installed
            ? <p>vdoo uses Claude Code signed in with your Claude account. Install Claude Code (or Claude for Windows), sign in once, then check again.</p>
            : <p>Claude Code is installed but not signed in. Open a terminal, run <code>claude</code>, and sign in with your Claude account.</p>}
          <div className="ai-card-actions">
            {!status.claude.installed && <a className="btn ghost" href={CLAUDE_CODE_URL} onClick={(e) => { e.preventDefault(); void window.vdooDesktop?.openLink(CLAUDE_CODE_URL); }}>Get Claude Code</a>}
            <button className="btn primary" onClick={async () => setStatus({ ...status, claude: await ai.recheckClaude() })}>Check again</button>
          </div>
          <p className="fine">vdoo never sees your Claude password or tokens. When you ask, it sends your question and the schema to Anthropic through Claude Code.</p>
        </div>
      : provider === "chatgpt" && !connected.chatgpt ? <div className="ai-card">
          <h3>Use your ChatGPT plan</h3>
          <p>Sign in with ChatGPT to ask questions using your ChatGPT plan. No API key needed.</p>
          <button className="btn primary" onClick={signIn}>{signingIn ? "Open the sign-in page again" : "Continue with ChatGPT"}</button>
          <p className="fine">When you ask, vdoo sends your question and the schema to OpenAI.</p>
        </div>
      : provider === "custom" && !connected.custom ? <div className="ai-card">
          <h3>Connect an endpoint</h3>
          <p>{status.custom?.configured ? "Choose a model for your questions." : "Enter your server's address, an optional key, and a model in Settings."}</p>
          <button className="btn primary" onClick={onSettings}>Open AI settings</button>
        </div>
      : <>
          {messages.length === 0 && <div className="ai-empty">
            <p>Ask about <strong>{schema.name}</strong>, or have AI design or change it. Proposed schemas come with an <em>Apply to diagram</em> button.</p>
            <div className="suggestions">{(schema.tables.length ? SUGGESTIONS : SUGGESTIONS_EMPTY).map((q) =>
              <button key={q} className="suggestion" onClick={() => void send(q)}>{q}</button>)}</div>
          </div>}
          {messages.map((m, i) => <div key={i} className={`msg ${m.role}`}>
            {m.role === "user" ? <p>{m.content}</p>
            : m.error ? <div className="msg-error"><p>{m.error.message}</p>
                {m.error.code === "usage_limit" && provider === "chatgpt" && <button className="btn primary" onClick={() => void window.vdooDesktop?.openLink(m.error?.link || USAGE_URL)}>Manage usage</button>}
                {m.error.code === "signed_out" && provider === "chatgpt" && <button className="btn primary" onClick={signIn}>Continue with ChatGPT</button>}
              </div>
            : m.content ? <AiMarkdown text={m.content} onApply={onApply} streaming={!!busy && i === messages.length - 1} />
            : <div className="typing" aria-label="Thinking"><span /><span /><span /></div>}
          </div>)}
        </>}
      {setupError && <div className="msg-error"><p>{setupError}</p></div>}
    </div>

    <footer className="ai-foot">
      <form className="composer" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
        <textarea value={input} rows={3} disabled={!ready} placeholder={ready ? "Ask about this schema…" : "Connect an AI provider to ask questions"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }} />
        {busy ? <button type="button" className="btn ghost" onClick={() => void ai?.cancel(busy)}>Stop</button>
          : <button type="submit" className="btn primary" disabled={!ready || !input.trim()}>Send</button>}
      </form>
      {ready && <div className="ai-meta">
        {provider === "custom" ? <button className="link small" title={model} onClick={onSettings}>{model}</button>
          : <select value={model} aria-label="Model" onChange={(e) => saveAiPreference(modelKey, e.target.value)}>
              {(provider === "chatgpt" ? models : CLAUDE_MODELS).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>}
        <span>{provider === "claude" ? (status?.claude.subscription ? "Using your Claude subscription via Claude Code" : "Using Claude Code")
          : provider === "chatgpt" ? "Using your ChatGPT plan" : `Sent to ${status?.custom.configured ? new URL(status.custom.baseUrl).host : "your endpoint"}`}</span>
      </div>}
    </footer>
  </aside>;
}
