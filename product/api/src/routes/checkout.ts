import type { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { z } from "zod";
import { prisma, getPlan, getStripePriceId, type PlanTier } from "../config.js";
import { requireAuth } from "../lib/auth.js";
import { logAudit } from "../lib/audit.js";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const checkoutSchema = z.object({
  orgName: z.string().min(1),
  domain: z.string().min(3),
  plan: z.enum(["STARTER", "BUSINESS", "ENTERPRISE"]),
  seats: z.number().int().min(1).max(999),
  brandName: z.string().optional(),
});

export async function checkoutRoutes(app: FastifyInstance) {
  app.post("/create-session", async (req, reply) => {
    const auth = requireAuth(req);
    const body = checkoutSchema.parse(req.body);
    const plan = getPlan(body.plan as PlanTier);
    const slug = body.orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const existing = await prisma.organization.findFirst({
      where: { OR: [{ slug }, { domain: body.domain }] },
    });
    if (existing) {
      return reply.status(409).send({ error: "Organization or domain already exists" });
    }

    const org = await prisma.organization.create({
      data: {
        name: body.orgName,
        slug,
        domain: body.domain,
        plan: body.plan,
        seatLimit: body.seats,
        storageQuotaBytes: plan.storageQuotaBytes,
        brandName: body.brandName ?? body.orgName,
        status: "PENDING_PAYMENT",
        members: {
          create: { userId: auth.userId, role: "admin" },
        },
        subscription: {
          create: {
            status: "TRIALING",
            seatCount: body.seats,
          },
        },
      },
    });

    await logAudit({
      orgId: org.id,
      userId: auth.userId,
      action: "org.created",
      details: { slug, domain: body.domain, plan: body.plan },
      ipAddress: req.ip,
    });

    if (!stripe) {
      return {
        orgId: org.id,
        checkoutUrl: null,
        message: "Stripe not configured — use POST /api/orgs/:id/provision for dev",
      };
    }

    const priceId = getStripePriceId(body.plan as PlanTier);
    if (!priceId) {
      return reply.status(500).send({ error: "Stripe price not configured" });
    }

    let customerId = org.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: auth.email,
        metadata: { orgId: org.id },
      });
      customerId = customer.id;
      await prisma.organization.update({
        where: { id: org.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: body.seats }],
      success_url: `${process.env.PORTAL_URL ?? "http://localhost:3000"}/onboarding/${org.id}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.PORTAL_URL ?? "http://localhost:3000"}/signup?cancelled=1`,
      metadata: { orgId: org.id },
      subscription_data: {
        metadata: { orgId: org.id },
      },
    });

    return { orgId: org.id, checkoutUrl: session.url };
  });
}
