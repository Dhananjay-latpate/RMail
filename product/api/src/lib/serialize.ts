import type { Organization, Subscription } from "@prisma/client";

type OrgWithSubscription = Organization & { subscription?: Subscription | null };

export function serializeOrg(org: OrgWithSubscription) {
  return {
    ...org,
    storageQuotaBytes: org.storageQuotaBytes.toString(),
    subscription: org.subscription
      ? {
          ...org.subscription,
        }
      : null,
  };
}
