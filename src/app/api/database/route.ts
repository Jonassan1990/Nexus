import { NextRequest, NextResponse } from "next/server";
import {
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
