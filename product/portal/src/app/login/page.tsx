"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, setToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const data = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(data.token);
      const me = await apiFetch("/api/auth/me");
      const org = me.user.orgMembers[0]?.org;
      if (org) {
        router.push(`/dashboard/${org.id}`);
      } else {
        router.push("/signup");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <div className="container" style={{ maxWidth: 420 }}>
      <h1>Sign in</h1>
      <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
        Access your organization admin console
      </p>
      {error && <p className="error">{error}</p>}
      <form onSubmit={handleSubmit} className="card">
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="submit" className="btn" style={{ width: "100%" }}>Sign in</button>
      </form>
      <p style={{ marginTop: "1rem" }}>
        No account? <Link href="/signup">Get started</Link>
      </p>
    </div>
  );
}
