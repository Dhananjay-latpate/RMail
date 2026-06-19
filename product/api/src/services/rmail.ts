const RMAIL_API_URL = process.env.RMAIL_API_URL ?? "http://localhost:8080";
const RMAIL_ADMIN_USER = process.env.RMAIL_ADMIN_USER ?? "admin";
const RMAIL_ADMIN_SECRET = process.env.RMAIL_ADMIN_SECRET ?? "";

export class RmailUnavailableError extends Error {
  constructor(message = "Mail server is not reachable") {
    super(message);
    this.name = "RmailUnavailableError";
  }
}

export class RmailProvisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RmailProvisionError";
  }
}

function authHeader(): string {
  const encoded = Buffer.from(
    `${RMAIL_ADMIN_USER}:${RMAIL_ADMIN_SECRET}`,
  ).toString("base64");
  return `Basic ${encoded}`;
}

async function rmailFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `${RMAIL_API_URL}/api/manage${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  } catch {
    throw new RmailUnavailableError(
      `Cannot connect to RMail at ${RMAIL_API_URL}. Ensure the mail server is running.`,
    );
  }
  return res;
}

export interface ProvisionParams {
  tenantName: string;
  domain: string;
  adminName: string;
  adminPassword: string;
  adminEmail: string;
  description?: string;
  brandName?: string;
  brandLogoUrl?: string;
  brandTheme?: string;
  quota?: number;
}

export interface ProvisionResult {
  tenantId: number;
  domainId: number;
  adminId: number;
}

export async function provisionOrganization(
  params: ProvisionParams,
): Promise<ProvisionResult> {
  const res = await rmailFetch("/organization/provision", {
    method: "POST",
    body: JSON.stringify({
      tenantName: params.tenantName,
      domain: params.domain,
      adminName: params.adminName,
      adminPassword: params.adminPassword,
      adminEmail: params.adminEmail,
      description: params.description,
      brandName: params.brandName,
      brandLogoUrl: params.brandLogoUrl,
      brandTheme: params.brandTheme,
      quota: params.quota,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new RmailProvisionError(`RMail provision failed: ${res.status} ${text}`);
  }

  const json = (await res.json()) as { data: ProvisionResult };
  return json.data;
}

export async function createDkim(domain: string): Promise<unknown> {
  const res = await rmailFetch("/dkim", {
    method: "POST",
    body: JSON.stringify({ domain, algorithm: "Ed25519" }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DKIM creation failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function listPrincipals(
  type: string,
  tenantName?: string,
): Promise<unknown[]> {
  const params = new URLSearchParams({ type });
  const res = await rmailFetch(`/principal?${params}`);
  if (!res.ok) throw new Error(`List principals failed: ${res.status}`);
  const json = (await res.json()) as { data: unknown[] };
  return json.data;
}

export async function createUser(params: {
  name: string;
  email: string;
  password: string;
  tenantName: string;
  roles?: string[];
}): Promise<unknown> {
  const res = await rmailFetch("/principal", {
    method: "POST",
    body: JSON.stringify({
      type: "individual",
      name: params.name,
      emails: [params.email],
      secrets: [params.password],
      tenant: params.tenantName,
      roles: params.roles ?? ["user"],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create user failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function deleteUser(name: string): Promise<void> {
  const res = await rmailFetch(`/principal/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Delete user failed: ${res.status}`);
  }
}

export async function createGroup(params: {
  name: string;
  tenantName: string;
  members?: string[];
  type?: "group" | "list";
}): Promise<unknown> {
  const res = await rmailFetch("/principal", {
    method: "POST",
    body: JSON.stringify({
      type: params.type ?? "group",
      name: params.name,
      tenant: params.tenantName,
      members: params.members ?? [],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create group failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function updateTenantQuota(
  tenantName: string,
  quota: number,
): Promise<void> {
  const res = await rmailFetch(`/principal/${encodeURIComponent(tenantName)}`, {
    method: "PUT",
    body: JSON.stringify([
      { action: "set", field: "quota", value: quota },
    ]),
  });
  if (!res.ok) {
    throw new Error(`Update quota failed: ${res.status}`);
  }
}

export async function suspendTenant(tenantName: string): Promise<void> {
  await updateTenantQuota(tenantName, 0);
}
