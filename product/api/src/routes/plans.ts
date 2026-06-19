import type { FastifyInstance } from "fastify";
import { PLANS } from "../config.js";

export async function planRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    return {
      plans: Object.values(PLANS).map((p) => ({
        tier: p.tier,
        name: p.name,
        seats: p.seats,
        storageGb: Number(p.storageQuotaBytes / 1_073_741_824n),
        monthlyPricePerSeat: p.monthlyPrice,
      })),
    };
  });
}
