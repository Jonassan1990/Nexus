import { NextRequest, NextResponse } from "next/server";
import { notifications } from "@/lib/nexus-data";
import { filterVisible } from "@/lib/rbac";
import type { RoleKey } from "@/lib/types";

const defaultRole: RoleKey = "requester";

function toRole(value: string | null): RoleKey {
  return value && /^[a-z0-9_-]{2,64}$/i.test(value) ? (value as RoleKey) : defaultRole;
}

export function GET(request: NextRequest) {
  const role = toRole(request.nextUrl.searchParams.get("role"));
  const visibleNotifications = filterVisible(notifications, role);

  return NextResponse.json({
    data: visibleNotifications,
    meta: {
      unread: visibleNotifications.filter((item) => item.unread).length,
      role
    }
  });
}
