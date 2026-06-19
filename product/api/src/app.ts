import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { authRoutes } from "./routes/auth.js";
import { planRoutes } from "./routes/plans.js";
import { checkoutRoutes } from "./routes/checkout.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { orgRoutes } from "./routes/orgs.js";
import { userRoutes } from "./routes/users.js";
import { onboardingRoutes } from "./routes/onboarding.js";
import { auditRoutes } from "./routes/audit.js";
import { usageRoutes } from "./routes/usage.js";
import { ssoRoutes } from "./routes/sso.js";
import { groupRoutes } from "./routes/groups.js";
import { AuthError, ForbiddenError } from "./lib/auth.js";
import { ZodError } from "zod";
import { RmailUnavailableError, RmailProvisionError } from "./services/rmail.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof AuthError) {
      return reply.status(401).send({ error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return reply.status(403).send({ error: error.message });
    }
    if (error instanceof RmailUnavailableError) {
      return reply.status(503).send({ error: error.message, code: "RMAIL_UNAVAILABLE" });
    }
    if (error instanceof RmailProvisionError) {
      return reply.status(502).send({ error: error.message, code: "RMAIL_PROVISION_FAILED" });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: "Invalid request", details: error.issues });
    }
    app.log.error(error);
    return reply.status(500).send({ error: "Internal server error" });
  });

  await app.register(cors, { origin: true });

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(planRoutes, { prefix: "/api/plans" });
  await app.register(checkoutRoutes, { prefix: "/api/checkout" });
  await app.register(webhookRoutes, { prefix: "/api/webhooks" });
  await app.register(orgRoutes, { prefix: "/api/orgs" });
  await app.register(userRoutes, { prefix: "/api/orgs" });
  await app.register(onboardingRoutes, { prefix: "/api/orgs" });
  await app.register(auditRoutes, { prefix: "/api/orgs" });
  await app.register(usageRoutes, { prefix: "/api/orgs" });
  await app.register(ssoRoutes, { prefix: "/api/orgs" });
  await app.register(groupRoutes, { prefix: "/api/orgs" });

  return app;
}
