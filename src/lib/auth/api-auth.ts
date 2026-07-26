import { NextRequest, NextResponse } from "next/server";
import { adminConfig, getAdminRoleLabel, type AdminConfig } from "@/lib/admin-config";
import { getNexusAuthMode } from "@/lib/auth/auth-mode";
import { getCognitoUserFromPayload, verifyCognitoIdToken } from "@/lib/auth/cognito-session";
import { roles as roleDefinitions } from "@/lib/nexus-data";
import type { RoleKey, Ticket } from "@/lib/types";

type CognitoClaims = {
  name?: string;
  email?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  token_use?: string;
  exp?: number;
  [key: string]: unknown;
};

export type ApiPrincipal = {
  name: string;
  email: string;
  roles: RoleKey[];
  primaryRole: RoleKey;
  isAdmin: boolean;
};

const knownRoleKeys = new Set<RoleKey>(roleDefinitions.map((role) => role.key));
const allScopeValue = "__all__";

function uniqueRoles(roles: RoleKey[]): RoleKey[] {
  return Array.from(new Set(roles));
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function isKnownRoleKey(value: string): value is RoleKey {
  return knownRoleKeys.has(value as RoleKey);
}

function readEnv(value: string | undefined): string {
  return (value ?? "").trim();
}

function splitRoleCandidates(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => splitRoleCandidates(item));
  }

  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function collectClaimRoles(claims: CognitoClaims): RoleKey[] {
  const rawClaims = [
    claims["cognito:groups"],
    claims["custom:roles"],
    claims["custom:role"],
    claims.role
  ];
  const roles: RoleKey[] = [];

  for (const rawClaim of rawClaims) {
    for (const candidate of splitRoleCandidates(rawClaim)) {
      if (isKnownRoleKey(candidate)) {
        roles.push(candidate);
      }
    }
  }

  return uniqueRoles(roles);
}

function resolveMappedRoles(email: string): RoleKey[] {
  const normalizedEmail = email.trim().toLowerCase();
  const user = adminConfig.users.find((candidate) => candidate.email.trim().toLowerCase() === normalizedEmail);

  if (!user) {
    return [];
  }

  return uniqueRoles([user.primaryRole, ...user.actionRoles]);
}

function buildPrincipal(name: string, email: string, roles: RoleKey[]): ApiPrincipal {
  const normalizedRoles = uniqueRoles(roles.length > 0 ? roles : ["requester"]);
  const primaryRole = normalizedRoles.includes("admin")
    ? "admin"
    : normalizedRoles[0] ?? "requester";

  return {
    name: name.trim() || "Signed-in user",
    email: email.trim().toLowerCase(),
    roles: normalizedRoles,
    primaryRole,
    isAdmin: normalizedRoles.includes("admin")
  };
}

function buildPrincipalFromClaims(claims: CognitoClaims): ApiPrincipal {
  const identity = getCognitoUserFromPayload(claims);
  const mappedRoles = resolveMappedRoles(identity.email);
  const claimRoles = collectClaimRoles(claims);

  return buildPrincipal(identity.name, identity.email, uniqueRoles([...mappedRoles, ...claimRoles]));
}

function buildPrincipalFromExternalEnv(): ApiPrincipal | null {
  const name = readEnv(process.env.NEXT_PUBLIC_NEXUS_TEST_USER_NAME);
  const email = readEnv(process.env.NEXT_PUBLIC_NEXUS_TEST_USER_EMAIL);

  if (!name && !email) {
    return null;
  }

  return buildPrincipal(name || "Signed-in user", email, resolveMappedRoles(email));
}

export function getPrincipalRoleLabel(role: RoleKey): string {
  return getAdminRoleLabel(role);
}

export function principalHasRole(principal: ApiPrincipal, role: RoleKey): boolean {
  return principal.roles.includes(role);
}

function matchRoleText(role: RoleKey, value: string): boolean {
  const normalizedValue = normalizeText(value);
  const normalizedRoleKey = normalizeText(role);
  const normalizedRoleLabel = normalizeText(getAdminRoleLabel(role));

  return (
    normalizedValue === normalizedRoleKey ||
    normalizedValue === normalizedRoleLabel ||
    normalizedValue.includes(normalizedRoleKey) ||
    normalizedValue.includes(normalizedRoleLabel)
  );
}

function valueMatchesAnyRole(value: string, roles: RoleKey[]): boolean {
  return roles.some((role) => matchRoleText(role, value));
}

function mappingMatchesTicket(
  config: AdminConfig,
  mapping: AdminConfig["responsibilityMappings"][number],
  ticket: Ticket
): boolean {
  const allScopeMatches = (values: string[]) => !values.length || values.includes(allScopeValue);
  const product = ticket.product.trim();
  const site = ticket.site.trim();
  const pru = ticket.pru.trim();
  const productId = config.products.find((candidate) => candidate.productName === product)?.id ?? "";
  const siteId = config.regionSites.find((candidate) => candidate.site === site)?.id ?? "";

  const productMatches =
    !productId && allScopeMatches(mapping.productIds)
      ? true
      : mapping.productIds.includes(allScopeValue) || mapping.productIds.includes(productId);
  const siteMatches =
    !siteId && allScopeMatches(mapping.regionSiteIds)
      ? true
      : mapping.regionSiteIds.includes(allScopeValue) || mapping.regionSiteIds.includes(siteId);
  const pruMatches = !pru && allScopeMatches(mapping.pruNames) ? true : mapping.pruNames.includes(allScopeValue) || mapping.pruNames.includes(pru);

  return productMatches && siteMatches && pruMatches;
}

export function canAccessTicket(ticket: Ticket, principal: ApiPrincipal, config: AdminConfig = adminConfig): boolean {
  if (principal.isAdmin) {
    return true;
  }

  const roles = principal.roles;
  const roleSet = new Set<RoleKey>(roles);

  if (ticket.workflow.some((step) => roleSet.has(step.ownerRole))) {
    return true;
  }

  if (ticket.participants.some((participant) => valueMatchesAnyRole(participant.role, roles))) {
    return true;
  }

  if (ticket.dynamicFields["User role"] && valueMatchesAnyRole(ticket.dynamicFields["User role"], roles)) {
    return true;
  }

  if (
    config.responsibilityMappings.some(
      (mapping) =>
        mapping.active &&
        (mapping.roles?.length ? mapping.roles : [mapping.role]).some((role) => roleSet.has(role)) &&
        mappingMatchesTicket(config, mapping, ticket)
    )
  ) {
    return true;
  }

  return false;
}

export function filterTicketsForPrincipal(ticketList: Ticket[], principal: ApiPrincipal, config: AdminConfig = adminConfig): Ticket[] {
  return ticketList.filter((ticket) => canAccessTicket(ticket, principal, config));
}

export function buildUnauthorizedResponse(message: string): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "unauthorized",
        message
      }
    },
    { status: 401 }
  );
}

export function buildForbiddenResponse(message: string): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "forbidden",
        message
      }
    },
    { status: 403 }
  );
}

export async function resolveApiPrincipal(request: NextRequest): Promise<ApiPrincipal | NextResponse> {
  if (getNexusAuthMode() === "cognito") {
    const sessionToken = request.cookies.get("nexus_auth_session")?.value?.trim();

    if (!sessionToken) {
      return buildUnauthorizedResponse("Authentication is required.");
    }

    try {
      const verified = (await verifyCognitoIdToken(sessionToken)) as CognitoClaims;
      return buildPrincipalFromClaims(verified);
    } catch {
      return buildUnauthorizedResponse("Authentication is required.");
    }
  }

  const externalPrincipal = buildPrincipalFromExternalEnv();

  if (externalPrincipal) {
    return externalPrincipal;
  }

  return buildUnauthorizedResponse("Authentication is required.");
}

export async function requireApiPrincipal(request: NextRequest): Promise<ApiPrincipal | NextResponse> {
  return resolveApiPrincipal(request);
}

export async function requireAdminPrincipal(request: NextRequest): Promise<ApiPrincipal | NextResponse> {
  const principal = await resolveApiPrincipal(request);

  if (principal instanceof NextResponse) {
    return principal;
  }

  if (!principal.isAdmin) {
    return buildForbiddenResponse("Administrator access is required.");
  }

  return principal;
}
