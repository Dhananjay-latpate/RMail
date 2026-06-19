"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, setToken } from "@/lib/api";

interface Plan {
  tier: string;
  name: string;
  seats: number;
  storageGb: number;
  monthlyPricePerSeat: number;
}

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<"account" | "org" | "plan">("account");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [domain, setDomain] = useState("");
  const [plan, setPlan] = useState("STARTER");
  const [seats, setSeats] = useState(5);

  useEffect(() => {
    apiFetch("/api/plans").then((d) => setPlans(d.plans)).catch(() => {});
  }, []);

  async function handleAccount(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const data = await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, name }),
      });
      setToken(data.token);
      setStep("org");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    }
  }

  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const data = await apiFetch("/api/checkout/create-session", {
        method: "POST",
        body: JSON.stringify({ orgName, domain, plan, seats, brandName: orgName }),
      });

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        try {
          await apiFetch(`/api/orgs/${data.orgId}/provision`, { method: "POST" });
        } catch {
          // Mail server may be offline during setup — onboarding allows retry
        }
        router.push(`/onboarding/${data.orgId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    }
  }

  const selectedPlan = plans.find((p) => p.tier === plan);

  return (
    <div className="container" style={{ maxWidth: 520 }}>
      <h1>Get started with RMail</h1>
      {error && <p className="error">{error}</p>}

      {step === "account" && (
        <form onSubmit={handleAccount} className="card">
          <h2>Create your account</h2>
          <label htmlFor="name">Your name</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          <label htmlFor="email">Work email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          <button type="submit" className="btn" style={{ width: "100%" }}>Continue</button>
        </form>
      )}

      {step === "org" && (
        <form onSubmit={(e) => { e.preventDefault(); setStep("plan"); }} className="card">
          <h2>Your organization</h2>
          <label htmlFor="orgName">Organization name</label>
          <input id="orgName" value={orgName} onChange={(e) => setOrgName(e.target.value)} required />
          <label htmlFor="domain">Email domain</label>
          <input id="domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="yourcompany.com" required />
          <button type="submit" className="btn" style={{ width: "100%" }}>Choose plan</button>
        </form>
      )}

      {step === "plan" && (
        <form onSubmit={handleCheckout} className="card">
          <h2>Choose a plan</h2>
          <label htmlFor="plan">Plan</label>
          <select id="plan" value={plan} onChange={(e) => {
            setPlan(e.target.value);
            const p = plans.find((x) => x.tier === e.target.value);
            if (p) setSeats(p.seats);
          }}>
            {plans.map((p) => (
              <option key={p.tier} value={p.tier}>
                {p.name} — ${p.monthlyPricePerSeat}/user · {p.seats} seats · {p.storageGb} GB
              </option>
            ))}
          </select>
          <label htmlFor="seats">Number of seats</label>
          <input id="seats" type="number" min={1} max={selectedPlan?.seats ?? 999} value={seats} onChange={(e) => setSeats(Number(e.target.value))} />
          <button type="submit" className="btn" style={{ width: "100%" }}>
            Subscribe &amp; set up email
          </button>
        </form>
      )}

      <p style={{ marginTop: "1rem" }}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </div>
  );
}
