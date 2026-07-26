import { NextRequest, NextResponse } from "next/server";
import {
  buildCallbackUrl,
  exchangeCognitoCodeForTokens,
  getCognitoConfig,
  getPublicAppUrl,
  sanitizeReturnTo
} from "@/lib/auth/cognito";
import { verifyCognitoIdToken } from "@/lib/auth/cognito-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSecureRequest(request: NextRequest): boolean {
  return request.nextUrl.protocol === "https:";
}

function clearAuthCookies(response: NextResponse, secure: boolean) {
  const cookieBase = {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    maxAge: 0
  };

  response.cookies.set({ ...cookieBase, name: "nexus_auth_state", value: "", path: "/api/auth" });
  response.cookies.set({ ...cookieBase, name: "nexus_auth_verifier", value: "", path: "/api/auth" });
  response.cookies.set({ ...cookieBase, name: "nexus_auth_return_to", value: "", path: "/api/auth" });
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const appUrl = getPublicAppUrl();
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, appUrl));
  }

  const code = url.searchParams.get("code")?.trim();
  const state = url.searchParams.get("state")?.trim();

  if (!code || !state) {
    return NextResponse.redirect(new URL("/login?error=missing_authorization_code", appUrl));
  }

  const storedState = request.cookies.get("nexus_auth_state")?.value?.trim();
  const codeVerifier = request.cookies.get("nexus_auth_verifier")?.value?.trim();
  const returnTo = sanitizeReturnTo(request.cookies.get("nexus_auth_return_to")?.value);
  const secure = isSecureRequest(request);

  if (!storedState || storedState !== state) {
    const response = NextResponse.redirect(new URL("/login?error=invalid_state", appUrl));
    clearAuthCookies(response, secure);
    return response;
  }

  if (!codeVerifier) {
    const response = NextResponse.redirect(new URL("/login?error=missing_pkce_verifier", appUrl));
    clearAuthCookies(response, secure);
    return response;
  }

  try {
    const config = getCognitoConfig();
    const redirectUri = buildCallbackUrl();
    const tokenResponse = await exchangeCognitoCodeForTokens({
      config,
      code,
      redirectUri,
      codeVerifier
    });
    const claims = await verifyCognitoIdToken(tokenResponse.id_token as string);
    const maxAge = Math.max(60, Math.floor((claims.exp ?? 0) - Date.now() / 1000));
    const response = NextResponse.redirect(new URL(returnTo, appUrl));

    response.cookies.set({
      name: "nexus_auth_session",
      value: tokenResponse.id_token as string,
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge
    });

    clearAuthCookies(response, secure);
    return response;
  } catch (authError) {
    const message = authError instanceof Error ? authError.message : "Cognito sign-in failed.";
    const response = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, appUrl));
    clearAuthCookies(response, secure);
    return response;
  }
}
