import { NextRequest, NextResponse } from "next/server";
import { resolveApiPrincipal } from "@/lib/auth/api-auth";
import { getNexusAuthMode } from "@/lib/auth/auth-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const hasSessionToken = Boolean(request.cookies.get("nexus_auth_session")?.value?.trim());
  const principal = await resolveApiPrincipal(request);

  if (principal instanceof NextResponse) {
    return principal;
  }

  if (!hasSessionToken && getNexusAuthMode() === "cognito") {
    return NextResponse.json(
      {
        error: {
          code: "unauthenticated",
          message: "No authenticated user context was provided."
        }
      },
      { status: 401 }
    );
  }

  const response = NextResponse.json(
    {
      data: {
        name: principal.name,
        email: principal.email
      },
      meta: {
        source: hasSessionToken ? "cognito_session" : "test_env",
        role: principal.primaryRole,
        isAdmin: principal.isAdmin
      }
    },
    { status: 200 }
  );

  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
