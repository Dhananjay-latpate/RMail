const API_URL = import.meta.env.VITE_RMAIL_API_URL ?? "http://localhost:8080";

export interface Branding {
  brandName?: string;
  brandLogoUrl?: string;
  brandTheme?: string;
}

export interface JmapSession {
  apiUrl: string;
  downloadUrl?: string;
  uploadUrl?: string;
  capabilities?: Record<string, unknown>;
}

function authHeader(token: string): string {
  if (token.startsWith("Basic ") || token.startsWith("Bearer ")) {
    return token;
  }
  return `Bearer ${token}`;
}

export async function fetchBranding(token: string): Promise<Branding> {
  const res = await fetch(`${API_URL}/api/branding`, {
    headers: { Authorization: authHeader(token) },
  });
  if (!res.ok) return {};
  const json = await res.json();
  return json.data ?? {};
}

export async function fetchJmapSession(token: string): Promise<JmapSession> {
  const res = await fetch(`${API_URL}/.well-known/jmap`, {
    headers: { Authorization: authHeader(token) },
  });
  if (!res.ok) throw new Error("Failed to load JMAP session");
  return res.json();
}

const JMAP_USING = [
  "urn:ietf:params:jmap:core",
  "urn:ietf:params:jmap:mail",
  "urn:ietf:params:jmap:submission",
] as const;

export async function jmapCall<T>(
  session: JmapSession,
  token: string,
  methodCalls: unknown[][],
  using: readonly string[] = JMAP_USING,
): Promise<T> {
  const res = await fetch(session.apiUrl, {
    method: "POST",
    headers: {
      Authorization: authHeader(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ using, methodCalls }),
  });
  if (!res.ok) throw new Error(`JMAP error: ${res.status}`);
  const json = await res.json();
  return json.methodResponses as T;
}

export async function sendEmail(
  session: JmapSession,
  token: string,
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  type MethodResponse = [string, Record<string, unknown>];

  const responses = await jmapCall<MethodResponse[]>(session, token, [
    ["Identity/query", { accountId: "self" }, "iq"],
    [
      "Identity/get",
      {
        accountId: "self",
        "#ids": { resultOf: "iq", name: "Identity/query", path: "/ids" },
        properties: ["id", "email", "name"],
      },
      "ig",
    ],
    ["Mailbox/query", { accountId: "self", filter: { role: "drafts" } }, "mq"],
    [
      "Mailbox/get",
      {
        accountId: "self",
        "#ids": { resultOf: "mq", name: "Mailbox/query", path: "/ids" },
        properties: ["id"],
      },
      "mg",
    ],
  ]);

  const identityGet = responses.find((r) => r[0] === "Identity/get")?.[1] as
    | { list?: { id: string; email: string; name?: string }[] }
    | undefined;
  const identity = identityGet?.list?.[0];
  if (!identity) throw new Error("No sending identity found");

  const mailboxGet = responses.find((r) => r[0] === "Mailbox/get")?.[1] as
    | { list?: { id: string }[] }
    | undefined;
  const mailboxId = mailboxGet?.list?.[0]?.id;
  if (!mailboxId) throw new Error("No drafts mailbox found");

  const draftId = "draft-e2e";
  const partId = "body1";
  const createResponses = await jmapCall<MethodResponse[]>(session, token, [
    [
      "Email/set",
      {
        accountId: "self",
        create: {
          [draftId]: {
            mailboxIds: { [mailboxId]: true },
            from: [{ email: identity.email, name: identity.name }],
            to: [{ email: to }],
            subject,
            bodyValues: { [partId]: { value: body } },
            textBody: [{ partId }],
          },
        },
      },
      "es",
    ],
  ]);

  const emailSet = createResponses.find((r) => r[0] === "Email/set")?.[1] as
    | {
        created?: Record<string, { id?: string }>;
        notCreated?: Record<string, { description?: string }>;
      }
    | undefined;
  if (emailSet?.notCreated && Object.keys(emailSet.notCreated).length > 0) {
    const err = Object.values(emailSet.notCreated)[0]?.description ?? "Failed to create email";
    throw new Error(err);
  }
  const emailId = emailSet?.created?.[draftId]?.id;
  if (!emailId) throw new Error("Failed to create email draft");

  const sendResponses = await jmapCall<MethodResponse[]>(session, token, [
    [
      "EmailSubmission/set",
      {
        accountId: "self",
        create: {
          send1: {
            identityId: identity.id,
            emailId,
            envelope: {
              mailFrom: { email: identity.email, parameters: null },
              rcptTo: [{ email: to, parameters: null }],
            },
          },
        },
      },
      "ss",
    ],
  ]);

  const submissionSet = sendResponses.find((r) => r[0] === "EmailSubmission/set")?.[1] as
    | { notCreated?: Record<string, { description?: string }> }
    | undefined;
  if (submissionSet?.notCreated && Object.keys(submissionSet.notCreated).length > 0) {
    const err = Object.values(submissionSet.notCreated)[0]?.description ?? "Failed to send email";
    throw new Error(err);
  }
}

export function applyBranding(branding: Branding) {
  if (branding.brandName) {
    document.title = branding.brandName;
  }
  if (branding.brandTheme) {
    try {
      const theme = JSON.parse(branding.brandTheme) as Record<string, string>;
      const root = document.documentElement;
      if (theme.primaryColor) root.style.setProperty("--primary", theme.primaryColor);
      if (theme.accentColor) root.style.setProperty("--accent", theme.accentColor);
      if (theme.backgroundColor) root.style.setProperty("--bg", theme.backgroundColor);
      if (theme.textColor) root.style.setProperty("--text", theme.textColor);
      if (theme.fontFamily) root.style.setProperty("--font", theme.fontFamily);
    } catch {
      /* ignore invalid theme JSON */
    }
  }
}

export { API_URL };
