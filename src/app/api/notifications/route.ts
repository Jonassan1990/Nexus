import { NextRequest, NextResponse } from "next/server";
import { requireApiPrincipal } from "@/lib/auth/api-auth";
import { notifications } from "@/lib/nexus-data";
import { filterVisibleForRoles } from "@/lib/rbac";

export async function GET(request: NextRequest) {
  const principal = await requireApiPrincipal(request);

  if (principal instanceof NextResponse) {
    return principal;
  }

  const visibleNotifications = filterVisibleForRoles(notifications, principal.roles);

  return NextResponse.json({
    data: visibleNotifications,
    meta: {
      unread: visibleNotifications.filter((item) => item.unread).length,
      role: principal.primaryRole
    }
  });
}
