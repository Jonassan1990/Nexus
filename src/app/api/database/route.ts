import { NextRequest, NextResponse } from "next/server";
import { requireAdminPrincipal } from "@/lib/auth/api-auth";
import {
  clearLocalTicketsForDevelopment,
  getLocalDatabasePath,
  listDatabaseTables,
  runReadOnlyDatabaseQuery
} from "@/lib/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function forbiddenResponse(message = "Database inspection is available only to the Admin role.") {
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

function isLocalTestingHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

/**
 * PoC safety: do not trust client-supplied role alone.
 * Database inspector / wipe tools are limited to loopback or an explicit opt-in flag.
 */
function isDatabaseToolsEnabled(request: NextRequest): boolean {
  return (
    process.env.NEXUS_ENABLE_LOCAL_TEST_TOOLS === "true" ||
    isLocalTestingHost(request.nextUrl.hostname)
  );
}

function ensureDatabaseToolsAllowed(request: NextRequest): NextResponse | null {
  if (isDatabaseToolsEnabled(request)) {
    return null;
  }

  return forbiddenResponse(
    "Database inspector tools are disabled for this host. Use localhost or set NEXUS_ENABLE_LOCAL_TEST_TOOLS=true for PoC admin tooling."
  );
}

export async function GET(request: NextRequest) {
  const principal = await requireAdminPrincipal(request);

  if (principal instanceof NextResponse) {
    return principal;
  }

  const toolsGate = ensureDatabaseToolsAllowed(request);
  if (toolsGate) {
    return toolsGate;
  }

  const databasePath = getLocalDatabasePath();

  return NextResponse.json({
    data: {
      tables: await listDatabaseTables()
    },
    meta: {
      databasePath,
      databaseKind: databasePath.startsWith("aurora://") ? "aurora" : "sqlite"
    }
  });
}

export async function POST(request: NextRequest) {
  const principal = await requireAdminPrincipal(request);

  if (principal instanceof NextResponse) {
    return principal;
  }

  const toolsGate = ensureDatabaseToolsAllowed(request);
  if (toolsGate) {
    return toolsGate;
  }

  const payload = (await request.json().catch(() => null)) as {
    role?: string;
    sql?: unknown;
  } | null;

  if (typeof payload?.sql !== "string") {
    return NextResponse.json(
      {
        error: {
          code: "validation_failed",
          message: "sql must be a string."
        }
      },
      { status: 400 }
    );
  }

  try {
    const databasePath = getLocalDatabasePath();

    return NextResponse.json({
      data: await runReadOnlyDatabaseQuery(payload.sql),
      meta: {
        databasePath,
        databaseKind: databasePath.startsWith("aurora://") ? "aurora" : "sqlite"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "query_rejected",
          message: error instanceof Error ? error.message : "Database query failed."
        }
      },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const principal = await requireAdminPrincipal(request);

  if (principal instanceof NextResponse) {
    return principal;
  }

  const toolsGate = ensureDatabaseToolsAllowed(request);
  if (toolsGate) {
    return toolsGate;
  }

  const payload = (await request.json().catch(() => null)) as {
    confirmation?: string;
    role?: string;
  } | null;

  if (payload?.confirmation !== "clean-local-tickets") {
    return NextResponse.json(
      {
        error: {
          code: "confirmation_required",
          message: "confirmation must be clean-local-tickets."
        }
      },
      { status: 400 }
    );
  }

  try {
    const databasePath = getLocalDatabasePath();

    return NextResponse.json({
      data: {
        tables: await clearLocalTicketsForDevelopment({ allowProduction: true })
      },
      meta: {
        databasePath,
        databaseKind: databasePath.startsWith("aurora://") ? "aurora" : "sqlite"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "ticket_cleanup_failed",
          message: error instanceof Error ? error.message : "Local ticket cleanup failed."
        }
      },
      { status: 500 }
    );
  }
}
