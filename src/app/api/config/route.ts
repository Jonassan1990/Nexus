import { NextRequest, NextResponse } from "next/server";
import { getLocalDatabasePath, readAdminConfig, saveAdminConfig } from "@/lib/local-database";
import type { AdminConfig } from "@/lib/admin-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateAdminConfig(value: unknown): string[] {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return ["config must be an object."];
  }

  const arrayFields = [
    "users",
    "customRoles",
    "roleDomains",
    "regionSites",
    "departments",
    "productDomains",
    "products",
    "responsibilityMappings",
    "requestTypes",
    "priorities",
    "riskOptions",
    "statusColors",
    "requestCategories",
    "slaRules",
    "escalationPolicies",
    "notificationTemplates",
    "formTemplates",
    "ticketTypeWorkflows"
  ];

  for (const field of arrayFields) {
    if (!Array.isArray(value[field])) {
      errors.push(`${field} must be an array.`);
    }
  }

  if (!isRecord(value.integrations)) {
    errors.push("integrations must be an object.");
  } else {
    if (!isRecord(value.integrations.jira)) {
      errors.push("integrations.jira must be an object.");
    }

    if (!isRecord(value.integrations.smtp)) {
      errors.push("integrations.smtp must be an object.");
    }

    if (!isRecord(value.integrations.ai)) {
      errors.push("integrations.ai must be an object.");
    }

    if (!isRecord(value.integrations.gitlab)) {
      errors.push("integrations.gitlab must be an object.");
    }
  }

  return errors;
}

export function GET() {
  const config = readAdminConfig();

  return NextResponse.json({
    data: config,
    meta: {
      databasePath: getLocalDatabasePath()
    }
  });
}

export async function PUT(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as { config?: unknown } | null;
  const config = payload?.config;
  const errors = validateAdminConfig(config);

  if (errors.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: "validation_failed",
          message: "Configuration payload failed validation.",
          details: errors
        }
      },
      { status: 400 }
    );
  }

  saveAdminConfig(config as AdminConfig);

  return NextResponse.json({
    data: config,
    meta: {
      databasePath: getLocalDatabasePath()
    }
  });
}
