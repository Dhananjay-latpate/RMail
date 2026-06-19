import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../config.js";
import { requireAuth, ForbiddenError } from "../lib/auth.js";
import { logAudit } from "../lib/audit.js";

async function assertOrgAccess(userId: string, orgId: string) {
  const member = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
  if (!member || member.role !== "admin") throw new ForbiddenError();
}

const ssoSchema = z.object({
  provider: z.enum(["oidc", "google", "microsoft"]),
  issuerUrl: z.string().url(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  enabled: z.boolean().default(false),
});

export async function ssoRoutes(app: FastifyInstance) {
  app.get("/:orgId/sso", async (req, reply) => {
    const auth = requireAuth(req);
    const { orgId } = req.params as { orgId: string };
    try {
      await assertOrgAccess(auth.userId, orgId);
    } catch {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const config = await prisma.ssoConfig.findUnique({ where: { orgId } });
    if (!config) return { configured: false };
    return {
      configured: true,
      provider: config.provider,
      issuerUrl: config.issuerUrl,
      clientId: config.clientId,
      enabled: config.enabled,
    };
  });

  app.put("/:orgId/sso", async (req, reply) => {
    const auth = requireAuth(req);
    const { orgId } = req.params as { orgId: string };
    const body = ssoSchema.parse(req.body);
    try {
      await assertOrgAccess(auth.userId, orgId);
    } catch {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const config = await prisma.ssoConfig.upsert({
      where: { orgId },
      create: { orgId, ...body },
      update: body,
    });

    await logAudit({
      orgId,
      userId: auth.userId,
      action: "sso.updated",
      details: { provider: body.provider, enabled: body.enabled },
      ipAddress: req.ip,
    });

    return {
      provider: config.provider,
      issuerUrl: config.issuerUrl,
      clientId: config.clientId,
      enabled: config.enabled,
    };
  });
}
