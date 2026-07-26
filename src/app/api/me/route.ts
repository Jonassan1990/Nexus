import { NextRequest, NextResponse } from "next/server";
import { getNexusAuthMode } from "@/lib/auth/auth-mode";
import { getCognitoUserFromPayload, verifyCognitoIdToken } from "@/lib/auth/cognito-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MeResponse = {
  data: {
    name: string;
    email: string;
  };
  meta: {
    source: "cognito_session" | "test_env";
  };
};

function jsonNoStore(body: MeResponse, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

function readTestUser(): { name: string; email: string } | null {
  const name = (process.env.NEXT_PUBLIC_NEXUS_TEST_USER_NAME ?? "").trim();
  const email = (process.env.NEXT_PUBLIC_NEXUS_TEST_USER_EMAIL ?? "").trim().toLowerCase();

  if (!name && !email) {
    return null;
  }

  return { name: name || "Signed-in user", email };
}

export async function GET(request: NextRequest) {
  if (getNexusAuthMode() === "cognito") {
    const sessionToken = request.cookies.get("nexus_auth_session")?.value?.trim();

    if (sessionToken) {
      try {
        const verified = await verifyCognitoIdToken(sessionToken);
        const user = getCognitoUserFromPayload(verified);

        return jsonNoStore(
          {
            data: user,
            meta: { source: "cognito_session" }
          },
          200
        );
      } catch {
        // Fall through to test-user fallback or unauthenticated response.
      }
    }
  }

  if (getNexusAuthMode() !== "cognito") {
    const testUser = readTestUser();

    if (testUser) {
      return jsonNoStore(
        {
          data: testUser,
          meta: { source: "test_env" }
        },
        200
      );
    }
  }

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
