import { NextRequest, NextResponse } from "next/server";
import {
  clearLocalTicketsForDevelopment,
  getLocalDatabasePath,
  listDatabaseTables,
  runReadOnlyDatabaseQuery
} from "@/lib/local-database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAdminRole(value: string | null | undefined): boolean {
  return value === "admin";
}

function forbiddenResponse() {
  return NextResponse.json(
    {
      error: {
        code: "forbidden",
        message: "Database inspection is available only to the Admin role."
      }
    },
    { status: 403 }
  );
}

function isLocalTestingHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function isLocalTicketCleanupEnabled(request: NextRequest): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.NEXUS_ENABLE_LOCAL_TEST_TOOLS === "true" ||
    isLocalTestingHost(request.nextUrl.hostname)
  );
}

export function GET(request: NextRequest) {
  if (!isAdminRole(request.nextUrl.searchParams.get("role"))) {
    return forbiddenResponse();
  }

  return NextResponse.json({
    data: {
      tables: listDatabaseTables()
    },
    meta: {
      databasePath: getLocalDatabasePath()
    }
  });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as {
    role?: string;
    sql?: unknown;
  } | null;

  if (!isAdminRole(payload?.role)) {
    return forbiddenResponse();
  }

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
    return NextResponse.json({
      data: runReadOnlyDatabaseQuery(payload.sql),
      meta: {
        databasePath: getLocalDatabasePath()
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
  const payload = (await request.json().catch(() => null)) as {
    confirmation?: string;
    role?: string;
  } | null;

  if (!isAdminRole(payload?.role)) {
    return forbiddenResponse();
  }

  const canCleanLocalTickets = isLocalTicketCleanupEnabled(request);

  if (!canCleanLocalTickets) {
    return NextResponse.json(
      {
        error: {
          code: "production_blocked",
          message: "Local ticket cleanup is available only on localhost or when local test tools are explicitly enabled."
        }
      },
      { status: 403 }
    );
  }

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
    return NextResponse.json({
      data: {
        tables: clearLocalTicketsForDevelopment({ allowProduction: canCleanLocalTickets })
      },
      meta: {
        databasePath: getLocalDatabasePath()
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
