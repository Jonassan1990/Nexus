import { NextRequest, NextResponse } from "next/server";
import { requireApiPrincipal } from "@/lib/auth/api-auth";
import { roles, workflowTemplates } from "@/lib/nexus-data";

export async function GET(request: NextRequest) {
  const principal = await requireApiPrincipal(request);

  if (principal instanceof NextResponse) {
    return principal;
  }

  return NextResponse.json({
    data: workflowTemplates,
    meta: {
      roleCount: roles.length,
      configurable: true
    }
  });
}
