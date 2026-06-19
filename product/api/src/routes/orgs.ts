import type { FastifyInstance } from "fastify";
import { prisma } from "../config.js";
import { requireAuth, ForbiddenError } from "../lib/auth.js";
import { registerDevProvision } from "./webhooks.js";
import crypto from "node:crypto";
import { provisionOrganization, createDkim, RmailUnavailableError, RmailProvisionError } from "../services/rmail.js";
import { logAudit } from "../lib/audit.js";
import { serializeOrg } from "../lib/serialize.js";

async function assertOrgAccess(userId: string, orgId: string) {
  const member = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
    include: { org: { include: { subscription: true } } },
  });
  if (!member) throw new ForbiddenError();
  return member;
}

export async function orgRoutes(app: FastifyInstance) {
  await registerDevProvision(app);

  app.get("/:orgId", async (req) => {
    const auth = requireAuth(req);
    const { orgId } = req.params as { orgId: string };
    const member = await assertOrgAccess(auth.userId, orgId);
    return { org: serializeOrg(member.org) };
  });

  app.post("/:orgId/provision", async (req, reply) => {
    const auth = requireAuth(req);
    const { orgId } = req.params as { orgId: string };
    await assertOrgAccess(auth.userId, orgId);

    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) return reply.status(404).send({ error: "Not found" });
    if (org.rmailTenantId) {
      return { alreadyProvisioned: true, tenantId: org.rmailTenantId };
    }

    const password = crypto.randomBytes(16).toString("base64url");
    const adminEmail = `admin@${org.domain}`;

    const result = await provisionOrganization({
        tenantName: org.slug,
        domain: org.domain,
        adminName: "admin",
        adminPassword: password,
        adminEmail,
        description: org.name,
        brandName: org.brandName ?? org.name,
        quota: Number(org.storageQuotaBytes),
    });

    try {
      await createDkim(org.domain);
    } catch {
      /* DKIM may already exist */
    }

    await prisma.organization.update({
      where: { id: orgId },
      data: {
        rmailTenantId: result.tenantId,
        rmailDomainId: result.domainId,
        rmailAdminId: result.adminId,
        status: "ONBOARDING",
      },
    });

    await logAudit({
      orgId,
      userId: auth.userId,
      action: "org.provisioned.manual",
      details: result as object,
    });

    return { ...result, adminEmail, adminPassword: password };
  });
}
