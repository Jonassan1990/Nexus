import { createRemoteJWKSet, jwtVerify } from "jose";
import { getCognitoConfig, getCognitoIssuer, getCognitoJwksUrl } from "./cognito";

type CognitoSessionClaims = {
  token_use?: string;
  name?: string;
  email?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  exp?: number;
};

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks() {
  const config = getCognitoConfig();
  const cacheKey = `${config.region}:${config.userPoolId}`;

  if (!jwksCache.has(cacheKey)) {
    jwksCache.set(cacheKey, createRemoteJWKSet(new URL(getCognitoJwksUrl(config))));
  }

  return jwksCache.get(cacheKey)!;
}

export async function verifyCognitoIdToken(token: string): Promise<CognitoSessionClaims> {
  const config = getCognitoConfig();
  const result = await jwtVerify(token, getJwks(), {
    issuer: getCognitoIssuer(config),
    audience: config.clientId
  });
  const payload = result.payload as CognitoSessionClaims;

  if (payload.token_use && payload.token_use !== "id") {
    throw new Error("Cognito session token is not an ID token.");
  }

  return payload;
}

export function getCognitoUserFromPayload(payload: CognitoSessionClaims): { name: string; email: string } {
  const name =
    payload.name?.trim() ||
    [payload.given_name, payload.family_name].filter(Boolean).join(" ").trim() ||
    payload.preferred_username?.trim() ||
    payload.email?.trim() ||
    "Signed-in user";
  const email = (payload.email ?? payload.preferred_username ?? "").trim().toLowerCase();

  return { name, email };
}
