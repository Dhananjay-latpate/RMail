import { useCallback, useEffect, useState } from "react";
import {
  applyBranding,
  fetchBranding,
  fetchJmapSession,
  jmapCall,
  mailAccountId,
  sendEmail,
  type Branding,
  type JmapSession,
  API_URL,
} from "./jmap";

interface Email {
  id: string;
  subject: string;
  from: { name?: string; email: string }[];
  receivedAt: string;
  preview: string;
  isUnread: boolean;
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("rmail_jmap_token") ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<JmapSession | null>(null);
  const [branding, setBranding] = useState<Branding>({});
  const [emails, setEmails] = useState<Email[]>([]);
  const [selected, setSelected] = useState<Email | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [composing, setComposing] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendNotice, setSendNotice] = useState("");

  const loadInbox = useCallback(async (authToken: string, jmapSession: JmapSession) => {
    type Response = [string, { list?: { id: string; subject?: string; from?: Email["from"]; receivedAt?: string; preview?: string; keywords?: Record<string, boolean> }[] }];
    const accountId = mailAccountId(jmapSession);
    const responses = await jmapCall<Response[]>(jmapSession, authToken, [
      ["Email/query", { accountId, limit: 50 }, "q0"],
      ["Email/get", { accountId, "#ids": { resultOf: "q0", name: "Email/query", path: "/ids" }, properties: ["id", "subject", "from", "receivedAt", "preview", "keywords"] }, "g0"],
    ]);

    const getResult = responses.find((r) => r[0] === "Email/get");
    const list = getResult?.[1]?.list ?? [];
    setEmails(
      list.map((m) => ({
        id: m.id,
        subject: m.subject ?? "(no subject)",
        from: m.from ?? [],
        receivedAt: m.receivedAt ?? "",
        preview: m.preview ?? "",
        isUnread: !!m.keywords?.["$seen"] === false,
      })),
    );
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const basic = btoa(`${email}:${password}`);
      const res = await fetch(`${API_URL}/api/oauth`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "code", scopes: ["jmap"] }),
      });

      let authToken = `Basic ${basic}`;
      if (res.ok) {
        const data = await res.json();
        const oauthToken = data.access_token ?? data.token;
        if (oauthToken) authToken = `Bearer ${oauthToken}`;
      }

      localStorage.setItem("rmail_jmap_token", authToken);
      setToken(authToken);

      const brand = await fetchBranding(authToken);
      setBranding(brand);
      applyBranding(brand);

      const jmapSession = await fetchJmapSession(authToken);
      setSession(jmapSession);
      await loadInbox(authToken, jmapSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const brand = await fetchBranding(token);
        setBranding(brand);
        applyBranding(brand);
        const jmapSession = await fetchJmapSession(token);
        setSession(jmapSession);
        await loadInbox(token, jmapSession);
      } catch {
        localStorage.removeItem("rmail_jmap_token");
        setToken("");
      }
    })();
  }, [token, loadInbox]);

  function logout() {
    localStorage.removeItem("rmail_jmap_token");
    setToken("");
    setSession(null);
    setEmails([]);
    setComposing(false);
    setSendNotice("");
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !token) return;
    setSending(true);
    setSendNotice("");
    setError("");
    try {
      await sendEmail(session, token, composeTo, composeSubject, composeBody);
      setComposing(false);
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
      setSendNotice("Message sent");
      await loadInbox(token, session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function refreshInbox() {
    if (!session || !token) return;
    setLoading(true);
    try {
      await loadInbox(token, session);
    } finally {
      setLoading(false);
    }
  }

  if (!token || !session) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>{branding.brandName ?? "RMail"}</h1>
          <p>Sign in to your mailbox</p>
          {error && <p className="error">{error}</p>}
          <form onSubmit={handleLogin} data-testid="login-form">
            <label htmlFor="login-email">Email</label>
            <input id="login-email" data-testid="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <label htmlFor="login-password">Password</label>
            <input id="login-password" data-testid="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="submit" data-testid="login-submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        {branding.brandLogoUrl ? (
          <img src={branding.brandLogoUrl} alt="" className="logo" />
        ) : (
          <strong>{branding.brandName ?? "RMail"}</strong>
        )}
        <span className="spacer" />
        <button type="button" onClick={logout} className="btn-ghost">Sign out</button>
      </header>
      <div className="layout">
        <aside className="sidebar">
          <button type="button" className="compose-btn" data-testid="compose-btn" onClick={() => setComposing(true)}>Compose</button>
          <nav>
            <button type="button" className="nav-item active" data-testid="nav-inbox" onClick={() => void refreshInbox()}>Inbox</button>
            <button type="button" className="nav-item">Sent</button>
            <button type="button" className="nav-item">Drafts</button>
          </nav>
        </aside>
        <main className="mail-list">
          {sendNotice && <p className="notice" data-testid="send-notice">{sendNotice}</p>}
          {error && <p className="error">{error}</p>}
          {composing ? (
            <form className="compose-form" data-testid="compose-form" onSubmit={(e) => void handleSend(e)}>
              <h3>New message</h3>
              <label htmlFor="compose-to">To</label>
              <input id="compose-to" data-testid="compose-to" type="email" value={composeTo} onChange={(e) => setComposeTo(e.target.value)} required />
              <label htmlFor="compose-subject">Subject</label>
              <input id="compose-subject" data-testid="compose-subject" value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} required />
              <label htmlFor="compose-body">Message</label>
              <textarea id="compose-body" data-testid="compose-body" value={composeBody} onChange={(e) => setComposeBody(e.target.value)} rows={8} required />
              <div className="compose-actions">
                <button type="button" className="btn-ghost" onClick={() => setComposing(false)}>Cancel</button>
                <button type="submit" data-testid="compose-send" disabled={sending}>{sending ? "Sending…" : "Send"}</button>
              </div>
            </form>
          ) : emails.length === 0 ? (
            <p className="empty" data-testid="inbox-empty">No messages in inbox</p>
          ) : (
            emails.map((m) => (
              <button
                key={m.id}
                type="button"
                data-testid="mail-row"
                data-subject={m.subject}
                className={`mail-row ${selected?.id === m.id ? "selected" : ""} ${m.isUnread ? "unread" : ""}`}
                onClick={() => setSelected(m)}
              >
                <span className="from">{m.from[0]?.name ?? m.from[0]?.email ?? "Unknown"}</span>
                <span className="subject">{m.subject}</span>
                <span className="preview">{m.preview}</span>
              </button>
            ))
          )}
        </main>
        <section className="mail-view">
          {selected ? (
            <>
              <h2>{selected.subject}</h2>
              <p className="meta">From: {selected.from.map((f) => f.email).join(", ")}</p>
              <p className="body">{selected.preview}</p>
            </>
          ) : (
            <p className="empty">Select a message</p>
          )}
        </section>
      </div>
    </div>
  );
}
