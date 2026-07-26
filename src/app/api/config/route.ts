import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPrincipal, requireAdminPrincipal } from "@/lib/auth/api-auth";
import { getLocalDatabasePath, readAdminConfig, saveAdminConfig } from "@/lib/database";
import type { AdminConfig } from "@/lib/admin-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const configRequestSchema = z.object({
  config: z.unknown()
});

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

export async function GET(request: NextRequest) {
  const principal = await requireApiPrincipal(request);

  if (principal instanceof NextResponse) {
    return principal;
  }

  const config = await readAdminConfig();

  return NextResponse.json({
    data: config,
    meta: {
      databasePath: getLocalDatabasePath()
    }
  });
}

export async function PUT(request: NextRequest) {
  const principal = await requireAdminPrincipal(request);

  if (principal instanceof NextResponse) {
    return principal;
  }

  const parsedPayload = configRequestSchema.safeParse(await request.json().catch(() => null));

  if (!parsedPayload.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_json",
          message: "Request body must include a config object."
        }
      },
      { status: 400 }
    );
  }

  const config = parsedPayload.data.config;
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

  await saveAdminConfig(config as AdminConfig);

  return NextResponse.json({
    data: config,
    meta: {
      databasePath: getLocalDatabasePath()
    }
  });
}
