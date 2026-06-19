import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../config.js";
import { signToken, requireAuth } from "../lib/auth.js";
import { logAudit } from "../lib/audit.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", async (req, reply) => {
    const body = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({
      where: { email: body.email },
    });
    if (existing) {
      return reply.status(409).send({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        name: body.name,
      },
    });

    await logAudit({
      userId: user.id,
      action: "user.registered",
      details: { email: user.email },
      ipAddress: req.ip,
    });

    const token = signToken({ userId: user.id, email: user.email });
    return { token, user: { id: user.id, email: user.email, name: user.name } };
  });

  app.post("/login", async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const token = signToken({ userId: user.id, email: user.email });
    return { token, user: { id: user.id, email: user.email, name: user.name } };
  });

  app.get("/me", async (req, reply) => {
    let auth;
    try {
      auth = requireAuth(req);
    } catch {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: {
        orgMembers: {
          include: { org: { include: { subscription: true } } },
        },
      },
    });

    if (!user) return reply.status(404).send({ error: "Not found" });
    return { user };
  });
}
