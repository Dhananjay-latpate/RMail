import type { FastifyInstance } from "fastify";
import { prisma } from "../config.js";
import { requireAuth, ForbiddenError } from "../lib/auth.js";
import { listPrincipals } from "../services/rmail.js";

async function assertOrgAccess(userId: string, orgId: string) {
  const member = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
    include: { org: true },
  });
  if (!member) throw new ForbiddenError();
  return member;
}

export async function usageRoutes(app: FastifyInstance) {
  app.get("/:orgId/usage", async (req, reply) => {
    const auth = requireAuth(req);
    const { orgId } = req.params as { orgId: string };
    let member;
    try {
      member = await assertOrgAccess(auth.userId, orgId);
    } catch {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const org = member.org;
    let userCount = 0;
    if (org.rmailTenantId) {
      try {
        const users = await listPrincipals("individual");
        userCount = (users as { emails?: string[] }[]).filter((u) =>
          u.emails?.some((e) => e.endsWith(`@${org.domain}`)),
        ).length;
      } catch {
        userCount = 0;
      }
    }

    const snapshot = await prisma.usageSnapshot.create({
      data: {
        orgId,
        userCount,
        storageUsedBytes: 0n,
      },
    });

    return {
      seatLimit: org.seatLimit,
      seatsUsed: userCount,
      storageQuotaBytes: org.storageQuotaBytes.toString(),
      storageUsedBytes: snapshot.storageUsedBytes.toString(),
      plan: org.plan,
      capturedAt: snapshot.capturedAt,
    };
  });
}
