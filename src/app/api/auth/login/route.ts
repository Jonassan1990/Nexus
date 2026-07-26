import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  buildCallbackUrl,
  buildCognitoAuthorizeUrl,
  getCognitoConfig,
  sanitizeReturnTo
} from "@/lib/auth/cognito";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSecureRequest(request: NextRequest): boolean {
  return request.nextUrl.protocol === "https:";
}

function createPkceVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function createPkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function setTransientCookie(response: NextResponse, name: string, value: string, secure: boolean) {
  response.cookies.set({
    name,
    value,
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 10 * 60
  });
}

export async function GET(request: NextRequest) {
  const config = getCognitoConfig();
  const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const redirectUri = buildCallbackUrl();
  const state = randomBytes(24).toString("base64url");
  const codeVerifier = createPkceVerifier();
  const codeChallenge = createPkceChallenge(codeVerifier);
  const authorizeUrl = buildCognitoAuthorizeUrl(config, {
    redirectUri,
    state,
    codeChallenge
  });

  const response = NextResponse.redirect(authorizeUrl);
  const secure = isSecureRequest(request);

  setTransientCookie(response, "nexus_auth_state", state, secure);
  setTransientCookie(response, "nexus_auth_verifier", codeVerifier, secure);
  setTransientCookie(response, "nexus_auth_return_to", returnTo, secure);

  return response;
}
