"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

interface User {
  name?: string;
  emails?: string[];
  roles?: string[];
}

export default function DashboardPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [org, setOrg] = useState<Record<string, unknown> | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [usage, setUsage] = useState<Record<string, unknown> | null>(null);
  const [audit, setAudit] = useState<unknown[]>([]);
  const [error, setError] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [tab, setTab] = useState<"users" | "usage" | "audit" | "sso" | "groups">("users");

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/orgs/${orgId}`),
      apiFetch(`/api/orgs/${orgId}/users`).catch(() => ({ users: [] })),
      apiFetch(`/api/orgs/${orgId}/usage`).catch(() => null),
      apiFetch(`/api/orgs/${orgId}/audit`).catch(() => ({ logs: [] })),
    ]).then(([orgData, usersData, usageData, auditData]) => {
      setOrg(orgData.org);
      setUsers(usersData.users ?? []);
      setUsage(usageData);
      setAudit(auditData.logs ?? []);
    }).catch((e) => setError(e.message));
  }, [orgId]);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    try {
      const result = await apiFetch(`/api/orgs/${orgId}/users`, {
        method: "POST",
        body: JSON.stringify({ name: newName, email: newEmail }),
      });
      alert(result.temporaryPassword
        ? `User created. Temporary password: ${result.temporaryPassword}`
        : "User created.");
      setNewEmail("");
      setNewName("");
      const usersData = await apiFetch(`/api/orgs/${orgId}/users`);
      setUsers(usersData.users ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add user");
    }
  }

  if (!org) return <div className="container">Loading…</div>;

  return (
    <>
      <nav className="nav">
        <span className="nav-brand">RMail Workspace</span>
        <Link href={`/onboarding/${orgId}`}>DNS setup</Link>
        <a href="http://localhost:3001" target="_blank" rel="noreferrer">Webmail</a>
      </nav>
      <div className="container">
        <h1>{org.name as string}</h1>
        <p style={{ color: "var(--muted)" }}>
          {org.domain as string} · {org.plan as string} · {org.status as string}
        </p>
        {error && <p className="error">{error}</p>}

        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
          {(["users", "usage", "audit", "sso", "groups"] as const).map((t) => (
            <button
              key={t}
              className={`btn ${tab === t ? "" : "btn-secondary"}`}
              onClick={() => setTab(t)}
              type="button"
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === "users" && (
          <>
            <div className="card">
              <h2>Team members</h2>
              <table>
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Role</th></tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.emails?.[0]}>
                      <td>{u.name}</td>
                      <td>{u.emails?.[0]}</td>
                      <td>{u.roles?.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form onSubmit={addUser} className="card">
              <h2>Add user</h2>
              <label>Name</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} required />
              <label>Email</label>
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
              <button type="submit" className="btn">Add user</button>
            </form>
          </>
        )}

        {tab === "usage" && usage && (
          <div className="card">
            <h2>Usage</h2>
            <p>Seats used: {usage.seatsUsed as number} / {usage.seatLimit as number}</p>
            <p>Storage quota: {Number(usage.storageQuotaBytes) / 1_073_741_824} GB</p>
          </div>
        )}

        {tab === "audit" && (
          <div className="card">
            <h2>Audit log</h2>
            <table>
              <thead>
                <tr><th>Action</th><th>User</th><th>Time</th></tr>
              </thead>
              <tbody>
                {(audit as { action: string; user?: { email: string }; createdAt: string }[]).map((log) => (
                  <tr key={log.createdAt + log.action}>
                    <td>{log.action}</td>
                    <td>{log.user?.email ?? "—"}</td>
                    <td>{new Date(log.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "sso" && <SsoPanel orgId={orgId} />}
        {tab === "groups" && <GroupsPanel orgId={orgId} />}
      </div>
    </>
  );
}

function SsoPanel({ orgId }: { orgId: string }) {
  const [provider, setProvider] = useState("oidc");
  const [issuerUrl, setIssuerUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [message, setMessage] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch(`/api/orgs/${orgId}/sso`, {
        method: "PUT",
        body: JSON.stringify({ provider, issuerUrl, clientId, clientSecret, enabled: true }),
      });
      setMessage("SSO configuration saved");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <form onSubmit={save} className="card">
      <h2>Single Sign-On (OIDC)</h2>
      <p style={{ color: "var(--muted)", marginBottom: "1rem" }}>
        Configure OIDC for Google Workspace or Microsoft Entra ID federation.
      </p>
      <label>Provider</label>
      <select value={provider} onChange={(e) => setProvider(e.target.value)}>
        <option value="oidc">Generic OIDC</option>
        <option value="google">Google</option>
        <option value="microsoft">Microsoft</option>
      </select>
      <label>Issuer URL</label>
      <input value={issuerUrl} onChange={(e) => setIssuerUrl(e.target.value)} placeholder="https://accounts.google.com" />
      <label>Client ID</label>
      <input value={clientId} onChange={(e) => setClientId(e.target.value)} />
      <label>Client Secret</label>
      <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
      <button type="submit" className="btn">Save SSO config</button>
      {message && <p className="success" style={{ marginTop: "1rem" }}>{message}</p>}
    </form>
  );
}

function GroupsPanel({ orgId }: { orgId: string }) {
  const [groups, setGroups] = useState<unknown[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    apiFetch(`/api/orgs/${orgId}/groups`).then((d) => setGroups(d.groups ?? [])).catch(() => {});
  }, [orgId]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await apiFetch(`/api/orgs/${orgId}/groups`, {
      method: "POST",
      body: JSON.stringify({ name, type: "group" }),
    });
    setName("");
    const d = await apiFetch(`/api/orgs/${orgId}/groups`);
    setGroups(d.groups ?? []);
  }

  return (
    <div>
      <div className="card">
        <h2>Groups</h2>
        <ul>
          {(groups as { name?: string }[]).map((g) => (
            <li key={g.name}>{g.name}</li>
          ))}
        </ul>
      </div>
      <form onSubmit={create} className="card">
        <h2>Create group</h2>
        <label>Group name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required />
        <button type="submit" className="btn">Create</button>
      </form>
    </div>
  );
}
