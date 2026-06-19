import type { FastifyInstance } from "fastify";
import dns from "node:dns/promises";
import { prisma } from "../config.js";
import { requireAuth, ForbiddenError } from "../lib/auth.js";
import { serializeOrg } from "../lib/serialize.js";

const MAIL_HOSTNAME = process.env.MAIL_HOSTNAME ?? "mail.example.com";

async function assertOrgAccess(userId: string, orgId: string) {
  const member = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
    include: { org: true },
  });
  if (!member) throw new ForbiddenError();
  return member;
}

function dnsRecords(domain: string) {
  const verificationToken = `rmail-verify=${domain}`;
  return {
    verification: {
      type: "TXT",
      name: `_rmail-verify.${domain}`,
      value: verificationToken,
      purpose: "Prove domain ownership",
    },
    mx: {
      type: "MX",
      name: domain,
      value: `10 ${MAIL_HOSTNAME}`,
      purpose: "Route inbound mail",
    },
    spf: {
      type: "TXT",
      name: domain,
      value: `v=spf1 mx a:${MAIL_HOSTNAME} -all`,
      purpose: "Sender Policy Framework",
    },
    dmarc: {
      type: "TXT",
      name: `_dmarc.${domain}`,
      value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}`,
      purpose: "DMARC policy",
    },
    autodiscover: {
      type: "CNAME",
      name: `autodiscover.${domain}`,
      value: MAIL_HOSTNAME,
      purpose: "Outlook autodiscover",
    },
    autoconfig: {
      type: "CNAME",
      name: `autoconfig.${domain}`,
      value: MAIL_HOSTNAME,
      purpose: "Thunderbird autoconfig",
    },
    dkim: {
      type: "TXT",
      name: `default._domainkey.${domain}`,
      value: "Create via RMail admin: POST /api/manage/dkim",
      purpose: "DKIM signing — fetch from mail admin after provisioning",
    },
  };
}

export async function onboardingRoutes(app: FastifyInstance) {
  app.get("/:orgId/dns", async (req, reply) => {
    const auth = requireAuth(req);
    const { orgId } = req.params as { orgId: string };
    let member;
    try {
      member = await assertOrgAccess(auth.userId, orgId);
    } catch {
      return reply.status(403).send({ error: "Forbidden" });
    }

    return {
      domain: member.org.domain,
      mailHostname: MAIL_HOSTNAME,
      records: dnsRecords(member.org.domain),
      status: {
        domainVerified: member.org.domainVerified,
        mxVerified: member.org.mxVerified,
        dkimVerified: member.org.dkimVerified,
        onboardingStep: member.org.onboardingStep,
      },
    };
  });

  app.post("/:orgId/dns/verify", async (req, reply) => {
    const auth = requireAuth(req);
    const { orgId } = req.params as { orgId: string };
    let member;
    try {
      member = await assertOrgAccess(auth.userId, orgId);
    } catch {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const domain = member.org.domain;
    const expectedTxt = `rmail-verify=${domain}`;
    let domainVerified = false;
    let mxVerified = false;

    try {
      const txtRecords = await dns.resolveTxt(`_rmail-verify.${domain}`);
      domainVerified = txtRecords.some((r) => r.join("").includes(expectedTxt));
    } catch {
      domainVerified = false;
    }

    try {
      const mxRecords = await dns.resolveMx(domain);
      mxVerified = mxRecords.some((r) =>
        r.exchange.toLowerCase().includes(MAIL_HOSTNAME.toLowerCase()),
      );
    } catch {
      mxVerified = false;
    }

    let onboardingStep = member.org.onboardingStep;
    if (domainVerified && mxVerified) {
      onboardingStep = "USERS";
    } else if (domainVerified) {
      onboardingStep = "MX_SETUP";
    }

    const org = await prisma.organization.update({
      where: { id: orgId },
      data: {
        domainVerified,
        mxVerified,
        onboardingStep,
        status: domainVerified && mxVerified ? "ACTIVE" : "ONBOARDING",
      },
    });

    return {
      domainVerified,
      mxVerified,
      onboardingStep: org.onboardingStep,
      status: org.status,
    };
  });

  app.post("/:orgId/onboarding/complete", async (req, reply) => {
    const auth = requireAuth(req);
    const { orgId } = req.params as { orgId: string };
    try {
      await assertOrgAccess(auth.userId, orgId);
    } catch {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const org = await prisma.organization.update({
      where: { id: orgId },
      data: { onboardingStep: "COMPLETE", status: "ACTIVE" },
    });

    return { org: serializeOrg(org) };
  });
}
