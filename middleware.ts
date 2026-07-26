import { NextRequest, NextResponse } from "next/server";
import { getNexusAuthMode } from "@/lib/auth/auth-mode";
import { getPublicAppUrl } from "@/lib/auth/cognito";
import { verifyCognitoIdToken } from "@/lib/auth/cognito-session";

const PUBLIC_PREFIXES = [
  "/_next",
  "/api/auth",
  "/api/health",
  "/favicon.ico",
  "/robots.txt",
  "/branding",
  "/img",
  "/fonts",
  "/manifest.json"
];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") {
    return true;
  }

  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isPublicApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/auth") || pathname === "/api/health";
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

function buildSecurityHeaders(): Record<string, string> {
  return {
    "Content-Security-Policy":
      "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: blob: https:; font-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https:; form-action 'self'; frame-src 'self' https://login.microsoftonline.com https://*.amazoncognito.com https://graph.microsoft.com;",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
    "X-Content-Type-Options": "nosniff"
  };
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  const headers = buildSecurityHeaders();

  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }

  return response;
}

function unauthorizedApiResponse(message = "Authentication is required.") {
  return applySecurityHeaders(
    NextResponse.json(
      {
        error: {
          code: "unauthorized",
          message
        }
      },
      { status: 401 }
    )
  );
}

function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL("/api/auth/login", getPublicAppUrl());
  loginUrl.searchParams.set("returnTo", request.nextUrl.pathname + request.nextUrl.search);
  return applySecurityHeaders(NextResponse.redirect(loginUrl));
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (getNexusAuthMode() !== "cognito") {
    return applySecurityHeaders(NextResponse.next());
  }

  if (isPublicPath(pathname)) {
    return applySecurityHeaders(NextResponse.next());
  }

  const sessionToken = request.cookies.get("nexus_auth_session")?.value?.trim();

  if (!sessionToken) {
    if (isApiPath(pathname) && !isPublicApiPath(pathname)) {
      return unauthorizedApiResponse();
    }

    return redirectToLogin(request);
  }

  try {
    await verifyCognitoIdToken(sessionToken);
    return applySecurityHeaders(NextResponse.next());
  } catch {
    if (isApiPath(pathname) && !isPublicApiPath(pathname)) {
      return unauthorizedApiResponse();
    }

    return redirectToLogin(request);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
