import { NextResponse } from "next/server";
import { roles, workflowTemplates } from "@/lib/nexus-data";

export function GET() {
  return NextResponse.json({
    data: workflowTemplates,
    meta: {
      roleCount: roles.length,
      configurable: true
    }
  });
}
