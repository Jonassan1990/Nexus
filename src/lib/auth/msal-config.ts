import { getEntraPlatformConfig } from "@/lib/platform-secrets";

/** Scopes requested at sign-in — keep minimal so users can consent without admin approval. */
export const graphLoginScopes = ["User.Read"] as const;

/** Extra scopes requested only when creating Outlook/Teams meetings. */
export const graphMeetingScopes = [
  "User.Read",
  "Calendars.ReadWrite",
  "OnlineMeetings.ReadWrite"
] as const;

export const graphTokenScopes = [...graphLoginScopes];

export type EntraPublicConfig = {
  clientId: string;
  tenantId: string;
  redirectUri: string;
  authority: string;
};

function readLocalEntraConfig(): Pick<EntraPublicConfig, "clientId" | "tenantId" | "redirectUri"> {
  const platformConfig = getEntraPlatformConfig();

  return {
    clientId: platformConfig.clientId,
    tenantId: platformConfig.tenantId,
    redirectUri: platformConfig.redirectUri
  };
}

export function getEntraPublicConfig(): EntraPublicConfig {
  const localConfig = readLocalEntraConfig();
  const envClientId = (
    process.env.NEXT_PUBLIC_MICROSOFT_GRAPH_CLIENT_ID ??
    process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID ??
    ""
  ).trim();
  const envTenantId = (
    process.env.NEXT_PUBLIC_MICROSOFT_GRAPH_TENANT_ID ??
    process.env.NEXT_PUBLIC_MICROSOFT_TENANT_ID ??
    ""
  ).trim();
  const clientId = localConfig.clientId || envClientId;
  const tenantId = localConfig.tenantId || envTenantId;
  const redirectUri =
    localConfig.redirectUri ||
    (process.env.NEXT_PUBLIC_MICROSOFT_GRAPH_REDIRECT_URI ?? "").trim() ||
    (typeof window !== "undefined" ? window.location.origin : "");

  if (!clientId || !tenantId) {
    throw new Error(
      "Entra ID is not configured. Set NEXT_PUBLIC_MICROSOFT_GRAPH_CLIENT_ID and NEXT_PUBLIC_MICROSOFT_GRAPH_TENANT_ID."
    );
  }

  return {
    clientId,
    tenantId,
    redirectUri,
    authority: `https://login.microsoftonline.com/${tenantId}`
  };
}

export function isEntraConfigured(): boolean {
  try {
    getEntraPublicConfig();
    return true;
  } catch {
    return false;
  }
}

export function getAccountEmail(account: {
  username?: string;
  name?: string;
  idTokenClaims?: Record<string, unknown>;
}): string {
  const claims = account.idTokenClaims ?? {};
  const claimEmail =
    (typeof claims.preferred_username === "string" && claims.preferred_username) ||
    (typeof claims.email === "string" && claims.email) ||
    (typeof claims.upn === "string" && claims.upn) ||
    "";

  return (claimEmail || account.username || "").trim().toLowerCase();
}

export function formatEntraSignInError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("AADSTS9002326") || message.toLowerCase().includes("single-page application")) {
    return [
      "Entra app platform is wrong for browser login.",
      "In Entra → App registration → Authentication, add a Single-page application platform",
      "with redirect URI http://localhost:3000 (exact match).",
      "Remove that URI from the Web platform if it is listed there.",
      "User.Read is already enough for login — this is not a permission issue."
    ].join(" ");
  }

  if (message.includes("AADSTS500113") || message.toLowerCase().includes("no reply address")) {
    return [
      "No redirect URI is registered for this app in Entra.",
      "Add a Single-page application redirect URI exactly matching the app origin",
      "(usually http://localhost:3000), then save and try again.",
      "If you deleted the old Web URI, make sure the SPA URI was added before retrying."
    ].join(" ");
  }

  if (message.includes("AADSTS65001") || message.toLowerCase().includes("need admin approval")) {
    return "An Entra admin must grant consent for this app. Login only needs User.Read.";
  }

  return message;
}
