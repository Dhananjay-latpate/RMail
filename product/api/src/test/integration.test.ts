import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../app.js";
import { prisma } from "../config.js";
import type { FastifyInstance } from "fastify";

const TEST_EMAIL = `test-${Date.now()}@example.com`;
const TEST_PASSWORD = "TestPass123!";

let app: FastifyInstance;
let authToken: string;
let orgId: string;

before(async () => {
  if (!process.env.DATABASE_URL?.includes("rmail_product_test")) {
    throw new Error(
      "Set DATABASE_URL to test database (e.g. postgresql://product:product@localhost:5433/rmail_product_test)",
    );
  }
  app = await buildApp();
  await app.ready();
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("Product API integration", () => {
  it("GET /health returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { status: "ok" });
  });

  it("GET /api/plans returns three tiers", async () => {
    const res = await app.inject({ method: "GET", url: "/api/plans" });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { plans: { tier: string }[] };
    assert.equal(body.plans.length, 3);
    assert.ok(body.plans.some((p) => p.tier === "STARTER"));
  });

  it("POST /api/auth/register creates user", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD, name: "Test Admin" },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { token: string; user: { email: string } };
    assert.ok(body.token);
    assert.equal(body.user.email, TEST_EMAIL);
    authToken = body.token;
  });

  it("POST /api/auth/register rejects duplicate email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD, name: "Test Admin" },
    });
    assert.equal(res.statusCode, 409);
  });

  it("POST /api/auth/login returns token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { token: string };
    assert.ok(body.token);
    authToken = body.token;
  });

  it("GET /api/auth/me requires auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/auth/me" });
    assert.equal(res.statusCode, 401);
  });

  it("GET /api/auth/me returns user with orgs", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${authToken}` },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { user: { email: string } };
    assert.equal(body.user.email, TEST_EMAIL);
  });

  it("POST /api/checkout/create-session creates org without Stripe", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/checkout/create-session",
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        orgName: "Test Corp",
        domain: `test-${Date.now()}.example.com`,
        plan: "STARTER",
        seats: 5,
      },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { orgId: string; checkoutUrl: null };
    assert.ok(body.orgId);
    assert.equal(body.checkoutUrl, null);
    orgId = body.orgId;
  });

  it("GET /api/orgs/:id returns org for member", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/orgs/${orgId}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { org: { name: string; status: string } };
    assert.equal(body.org.name, "Test Corp");
    assert.equal(body.org.status, "PENDING_PAYMENT");
  });

  it("GET /api/orgs/:id/dns returns DNS records", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/orgs/${orgId}/dns`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { records: Record<string, { type: string }> };
    assert.ok(body.records.mx);
    assert.equal(body.records.mx.type, "MX");
    assert.ok(body.records.spf);
    assert.ok(body.records.dmarc);
  });

  it("POST /api/orgs/:id/dns/verify returns verification result", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/orgs/${orgId}/dns/verify`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { domainVerified: boolean; mxVerified: boolean };
    assert.equal(typeof body.domainVerified, "boolean");
    assert.equal(typeof body.mxVerified, "boolean");
  });

  it("GET /api/orgs/:id/audit returns audit log", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/orgs/${orgId}/audit`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { logs: unknown[] };
    assert.ok(Array.isArray(body.logs));
    assert.ok(body.logs.length > 0);
  });

  it("GET /api/orgs/:id/usage returns seat usage", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/orgs/${orgId}/usage`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { seatLimit: number; seatsUsed: number };
    assert.equal(body.seatLimit, 5);
    assert.equal(typeof body.seatsUsed, "number");
  });

  it("PUT /api/orgs/:id/sso saves SSO config", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/orgs/${orgId}/sso`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        provider: "oidc",
        issuerUrl: "https://accounts.example.com",
        clientId: "test-client",
        clientSecret: "test-secret",
        enabled: false,
      },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { provider: string; enabled: boolean };
    assert.equal(body.provider, "oidc");
    assert.equal(body.enabled, false);
  });

  it("GET /api/orgs/:id forbids non-members", async () => {
    const other = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: `other-${Date.now()}@example.com`,
        password: TEST_PASSWORD,
        name: "Other",
      },
    });
    const otherToken = (other.json() as { token: string }).token;
    const res = await app.inject({
      method: "GET",
      url: `/api/orgs/${orgId}`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    assert.equal(res.statusCode, 403);
  });

  it("POST /api/orgs/:id/provision returns 503 when RMail unreachable", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/orgs/${orgId}/provision`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    assert.equal(res.statusCode, 503);
    const body = res.json() as { code: string };
    assert.equal(body.code, "RMAIL_UNAVAILABLE");
  });
});
