import { NextRequest, NextResponse } from "next/server";
import { buildCognitoLogoutUrl, buildLogoutRedirectUrl, getCognitoConfig } from "@/lib/auth/cognito";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSecureRequest(request: NextRequest): boolean {
  return request.nextUrl.protocol === "https:";
}

function clearCookie(response: NextResponse, name: string, path: string, secure: boolean) {
  response.cookies.set({
    name,
    value: "",
    httpOnly: true,
    secure,
    sameSite: "lax",
    path,
    maxAge: 0
  });
}

export async function GET(request: NextRequest) {
  const config = getCognitoConfig();
  const secure = isSecureRequest(request);
  const loginUrl = buildLogoutRedirectUrl();
  const response = NextResponse.redirect(buildCognitoLogoutUrl(config, loginUrl));

  clearCookie(response, "nexus_auth_session", "/", secure);
  clearCookie(response, "nexus_auth_state", "/api/auth", secure);
  clearCookie(response, "nexus_auth_verifier", "/api/auth", secure);
  clearCookie(response, "nexus_auth_return_to", "/api/auth", secure);

  return response;
}
