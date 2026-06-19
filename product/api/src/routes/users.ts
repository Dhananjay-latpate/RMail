import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../config.js";
import { requireAuth, ForbiddenError } from "../lib/auth.js";
import { createUser, deleteUser, listPrincipals } from "../services/rmail.js";
import { logAudit } from "../lib/audit.js";
import crypto from "node:crypto";

async function assertOrgAccess(userId: string, orgId: string) {
  const member = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
    include: { org: true },
  });
  if (!member) throw new ForbiddenError();
  return member;
}

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  role: z.enum(["user", "tenant-admin"]).default("user"),
});

export async function userRoutes(app: FastifyInstance) {
  app.get("/:orgId/users", async (req, reply) => {
    const auth = requireAuth(req);
    const { orgId } = req.params as { orgId: string };
    let member;
    try {
      member = await assertOrgAccess(auth.userId, orgId);
    } catch {
      return reply.status(403).send({ error: "Forbidden" });
    }

    if (!member.org.rmailTenantId) {
      return reply.status(400).send({ error: "Organization not provisioned yet" });
    }

    const users = await listPrincipals("individual");
    const domain = member.org.domain;
    const filtered = (users as { emails?: string[]; name?: string; roles?: string[] }[]).filter(
      (u) => u.emails?.some((e) => e.endsWith(`@${domain}`)),
    );

    return { users: filtered };
  });

  app.post("/:orgId/users", async (req, reply) => {
    const auth = requireAuth(req);
    const { orgId } = req.params as { orgId: string };
    const body = createUserSchema.parse(req.body);

    let member;
    try {
      member = await assertOrgAccess(auth.userId, orgId);
    } catch {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const org = member.org;
    if (!org.rmailTenantId) {
      return reply.status(400).send({ error: "Organization not provisioned yet" });
    }

    const currentUsers = await prisma.usageSnapshot.findFirst({
      where: { orgId },
      orderBy: { capturedAt: "desc" },
    });
    const userCount = currentUsers?.userCount ?? 0;
    if (userCount >= org.seatLimit) {
      return reply.status(402).send({ error: "Seat limit reached. Upgrade your plan." });
    }

    const password = body.password ?? crypto.randomBytes(12).toString("base64url");
    const localPart = body.email.split("@")[0];

    await createUser({
      name: localPart,
      email: body.email,
      password,
      tenantName: org.slug,
      roles: body.role === "tenant-admin" ? ["tenant-admin"] : ["user"],
    });

    await logAudit({
      orgId,
      userId: auth.userId,
      action: "user.created",
      details: { email: body.email },
      ipAddress: req.ip,
    });

    return { email: body.email, temporaryPassword: body.password ? undefined : password };
  });

  app.delete("/:orgId/users/:userName", async (req, reply) => {
    const auth = requireAuth(req);
    const { orgId, userName } = req.params as { orgId: string; userName: string };
    try {
      await assertOrgAccess(auth.userId, orgId);
    } catch {
      return reply.status(403).send({ error: "Forbidden" });
    }

    await deleteUser(userName);
    await logAudit({
      orgId,
      userId: auth.userId,
      action: "user.deleted",
      details: { userName },
      ipAddress: req.ip,
    });

    return { deleted: true };
  });
}
