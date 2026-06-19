import type { FastifyInstance } from "fastify";
import { prisma } from "../config.js";
import { requireAuth, ForbiddenError } from "../lib/auth.js";

async function assertOrgAccess(userId: string, orgId: string) {
  const member = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
  if (!member) throw new ForbiddenError();
}

export async function auditRoutes(app: FastifyInstance) {
  app.get("/:orgId/audit", async (req, reply) => {
    const auth = requireAuth(req);
    const { orgId } = req.params as { orgId: string };
    try {
      await assertOrgAccess(auth.userId, orgId);
    } catch {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const logs = await prisma.auditLog.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { email: true, name: true } } },
    });

    return { logs };
  });
}
