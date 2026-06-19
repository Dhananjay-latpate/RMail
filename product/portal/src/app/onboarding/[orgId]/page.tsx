"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

interface DnsRecord {
  type: string;
  name: string;
  value: string;
  purpose: string;
}

export default function OnboardingPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();
  const [records, setRecords] = useState<Record<string, DnsRecord>>({});
  const [status, setStatus] = useState<Record<string, unknown>>({});
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [orgStatus, setOrgStatus] = useState<string | null>(null);
  const [provisionMessage, setProvisionMessage] = useState("");

  useEffect(() => {
    apiFetch(`/api/orgs/${orgId}`)
      .then((d) => setOrgStatus(d.org.status as string))
      .catch(() => {});
    apiFetch(`/api/orgs/${orgId}/dns`)
      .then((d) => {
        setRecords(d.records);
        setStatus(d.status);
      })
      .catch((e) => setError(e.message));
  }, [orgId]);

  async function provisionMail() {
    setProvisioning(true);
    setProvisionMessage("");
    setError("");
    try {
      const result = await apiFetch(`/api/orgs/${orgId}/provision`, { method: "POST" });
      setOrgStatus("ONBOARDING");
      if (result.adminPassword) {
        setProvisionMessage(`Mail server provisioned. Admin password: ${result.adminPassword}`);
      } else {
        setProvisionMessage("Mail server provisioned successfully.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Provisioning failed");
    } finally {
      setProvisioning(false);
    }
  }

  async function verifyDns() {
    setVerifying(true);
    setError("");
    try {
      const result = await apiFetch(`/api/orgs/${orgId}/dns/verify`, { method: "POST" });
      setStatus(result);
      if (result.domainVerified && result.mxVerified) {
        await apiFetch(`/api/orgs/${orgId}/onboarding/complete`, { method: "POST" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="container">
      <h1>Domain setup</h1>
      <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
        Add these DNS records at your domain registrar to enable email for your organization.
      </p>
      {error && <p className="error">{error}</p>}
      {provisionMessage && <p className="success">{provisionMessage}</p>}

      {(orgStatus === "PENDING_PAYMENT" || orgStatus === "PROVISIONING") && (
        <div className="card">
          <h2>Activate mail server</h2>
          <p style={{ color: "var(--muted)", marginBottom: "1rem" }}>
            Provision your organization on the RMail mail platform before configuring DNS.
          </p>
          <button className="btn" onClick={provisionMail} disabled={provisioning}>
            {provisioning ? "Provisioning…" : "Provision mail server"}
          </button>
        </div>
      )}

      <div className="card">
        <h2>Verification status</h2>
        <p>Domain verified: {status.domainVerified ? "✓" : "✗"}</p>
        <p>MX configured: {status.mxVerified ? "✓" : "✗"}</p>
        <button className="btn" onClick={verifyDns} disabled={verifying}>
          {verifying ? "Checking…" : "Verify DNS records"}
        </button>
      </div>

      {Object.entries(records).map(([key, rec]) => (
        <div key={key} className="card">
          <h3>{rec.purpose}</h3>
          <div className="dns-record">
            <strong>{rec.type}</strong> {rec.name}<br />
            {rec.value}
          </div>
        </div>
      ))}

      <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem" }}>
        <Link href={`/dashboard/${orgId}`} className="btn">
          Go to admin console
        </Link>
        <a href="http://localhost:3001" className="btn btn-secondary" target="_blank" rel="noreferrer">
          Open webmail
        </a>
      </div>
    </div>
  );
}
