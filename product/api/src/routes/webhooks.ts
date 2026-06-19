import type { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { prisma } from "../config.js";
import { provisionOrganization, createDkim } from "../services/rmail.js";
import { logAudit } from "../lib/audit.js";
import crypto from "node:crypto";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

async function provisionOrg(orgId: string, adminPassword: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org || org.rmailTenantId) return;

  const adminMember = await prisma.orgMember.findFirst({
    where: { orgId, role: "admin" },
    include: { user: true },
  });
  if (!adminMember) throw new Error("No admin user for org");

  await prisma.organization.update({
    where: { id: orgId },
    data: { status: "PROVISIONING" },
  });

  const adminEmail = `admin@${org.domain}`;
  const result = await provisionOrganization({
    tenantName: org.slug,
    domain: org.domain,
    adminName: "admin",
    adminPassword,
    adminEmail,
    description: org.name,
    brandName: org.brandName ?? org.name,
    brandLogoUrl: org.brandLogoUrl ?? undefined,
    brandTheme: org.brandTheme ?? undefined,
    quota: Number(org.storageQuotaBytes),
  });

  try {
    await createDkim(org.domain);
  } catch (err) {
    console.warn("DKIM creation warning:", err);
  }

  await prisma.organization.update({
    where: { id: orgId },
    data: {
      rmailTenantId: result.tenantId,
      rmailDomainId: result.domainId,
      rmailAdminId: result.adminId,
      status: "ONBOARDING",
      onboardingStep: "DNS_VERIFICATION",
    },
  });

  await logAudit({
    orgId,
    action: "org.provisioned",
    details: { ...result },
  });
}

export async function webhookRoutes(app: FastifyInstance) {
  app.post("/stripe", {
    config: { rawBody: true },
  }, async (req, reply) => {
    if (!stripe) return reply.status(503).send({ error: "Stripe not configured" });

    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

    let event: Stripe.Event;
    try {
      const rawBody = (req as { rawBody?: Buffer }).rawBody ?? JSON.stringify(req.body);
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
      return reply.status(400).send({ error: `Webhook error: ${err}` });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.metadata?.orgId;
        if (!orgId) break;

        const tempPassword = crypto.randomBytes(16).toString("base64url");
        await provisionOrg(orgId, tempPassword);

        await prisma.subscription.update({
          where: { orgId },
          data: {
            status: "ACTIVE",
            stripeSubscriptionId: session.subscription as string,
          },
        });

        await logAudit({
          orgId,
          action: "subscription.activated",
          details: { sessionId: session.id },
        });
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata?.orgId;
        if (!orgId) break;

        const statusMap: Record<string, "ACTIVE" | "PAST_DUE" | "CANCELLED" | "UNPAID"> = {
          active: "ACTIVE",
          past_due: "PAST_DUE",
          canceled: "CANCELLED",
          unpaid: "UNPAID",
        };

        await prisma.subscription.update({
          where: { orgId },
          data: {
            status: statusMap[sub.status] ?? "ACTIVE",
            seatCount: sub.items.data[0]?.quantity ?? 5,
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
          },
        });
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata?.orgId;
        if (!orgId) break;

        const org = await prisma.organization.findUnique({ where: { id: orgId } });
        if (org) {
          const { suspendTenant } = await import("../services/rmail.js");
          try {
            await suspendTenant(org.slug);
          } catch (err) {
            console.warn("Suspend tenant warning:", err);
          }
        }

        await prisma.organization.update({
          where: { id: orgId },
          data: { status: "CANCELLED" },
        });
        await prisma.subscription.update({
          where: { orgId },
          data: { status: "CANCELLED" },
        });

        await logAudit({ orgId, action: "subscription.cancelled" });
        break;
      }
    }

    return { received: true };
  });
}

// Dev-only manual provision endpoint
export async function registerDevProvision(app: FastifyInstance) {
  app.post("/dev-provision/:orgId", async (req, reply) => {
    if (process.env.NODE_ENV === "production") {
      return reply.status(404).send({ error: "Not found" });
    }
    const { orgId } = req.params as { orgId: string };
    const password = crypto.randomBytes(12).toString("base64url");
    await provisionOrg(orgId, password);
    return { provisioned: true, adminPassword: password };
  });
}
