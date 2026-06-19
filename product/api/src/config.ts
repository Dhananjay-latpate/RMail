import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export const PLANS = {
  STARTER: {
    tier: "STARTER" as const,
    name: "Starter",
    seats: 5,
    storageQuotaBytes: 10_737_418_240n,
    priceEnvKey: "STRIPE_PRICE_STARTER",
    monthlyPrice: 6,
  },
  BUSINESS: {
    tier: "BUSINESS" as const,
    name: "Business",
    seats: 25,
    storageQuotaBytes: 53_687_091_200n,
    priceEnvKey: "STRIPE_PRICE_BUSINESS",
    monthlyPrice: 12,
  },
  ENTERPRISE: {
    tier: "ENTERPRISE" as const,
    name: "Enterprise",
    seats: 999,
    storageQuotaBytes: 536_870_912_000n,
    priceEnvKey: "STRIPE_PRICE_ENTERPRISE",
    monthlyPrice: 25,
  },
} as const;

export type PlanTier = keyof typeof PLANS;

export function getPlan(tier: PlanTier) {
  return PLANS[tier];
}

export function getStripePriceId(tier: PlanTier): string | undefined {
  const plan = PLANS[tier];
  return process.env[plan.priceEnvKey];
}
