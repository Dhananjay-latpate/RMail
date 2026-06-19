import { prisma } from "../config.js";

export async function logAudit(params: {
  orgId?: string;
  userId?: string;
  action: string;
  details?: Record<string, unknown> | object;
  ipAddress?: string;
}) {
  await prisma.auditLog.create({
    data: {
      orgId: params.orgId,
      userId: params.userId,
      action: params.action,
      details: (params.details ?? {}) as object,
      ipAddress: params.ipAddress,
    },
  });
}
