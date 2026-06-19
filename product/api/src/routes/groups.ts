import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../config.js";
import { requireAuth, ForbiddenError } from "../lib/auth.js";
import { createGroup, listPrincipals } from "../services/rmail.js";
import { logAudit } from "../lib/audit.js";

async function assertOrgAccess(userId: string, orgId: string) {
  const member = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
    include: { org: true },
  });
  if (!member) throw new ForbiddenError();
  return member;
}

const createGroupSchema = z.object({
  name: z.string().min(1),
  members: z.array(z.string()).default([]),
  type: z.enum(["group", "list"]).default("group"),
});

export async function groupRoutes(app: FastifyInstance) {
  app.get("/:orgId/groups", async (req, reply) => {
    const auth = requireAuth(req);
    const { orgId } = req.params as { orgId: string };
    let member;
    try {
      member = await assertOrgAccess(auth.userId, orgId);
    } catch {
      return reply.status(403).send({ error: "Forbidden" });
    }

    if (!member.org.rmailTenantId) {
      return { groups: [], lists: [] };
    }

    const [groups, lists] = await Promise.all([
      listPrincipals("group"),
      listPrincipals("list"),
    ]);

    return { groups, lists };
  });

  app.post("/:orgId/groups", async (req, reply) => {
    const auth = requireAuth(req);
    const { orgId } = req.params as { orgId: string };
    const body = createGroupSchema.parse(req.body);
    let member;
    try {
      member = await assertOrgAccess(auth.userId, orgId);
    } catch {
      return reply.status(403).send({ error: "Forbidden" });
    }

    if (!member.org.rmailTenantId) {
      return reply.status(400).send({ error: "Organization not provisioned" });
    }

    const result = await createGroup({
      name: body.name,
      tenantName: member.org.slug,
      members: body.members,
      type: body.type,
    });

    await logAudit({
      orgId,
      userId: auth.userId,
      action: "group.created",
      details: { name: body.name, type: body.type },
      ipAddress: req.ip,
    });

    return result;
  });
}
