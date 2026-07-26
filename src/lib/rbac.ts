import type { RoleKey, VisibilityLevel } from "./types";

const visibilityMatrix: Record<VisibilityLevel, RoleKey[]> = {
  public: [
    "requester",
    "local_product_owner",
    "global_product_owner",
    "business_architect",
    "solution_architect",
    "software_architect",
    "release_manager",
    "developer",
    "it_reviewer",
    "security_reviewer",
    "admin"
  ],
  approvers_only: [
    "local_product_owner",
    "global_product_owner",
    "business_architect",
    "solution_architect",
    "software_architect",
    "release_manager",
    "security_reviewer",
    "admin"
  ],
  it_only: ["it_reviewer", "security_reviewer", "release_manager", "admin"],
  architecture_only: [
    "business_architect",
    "solution_architect",
    "software_architect",
    "security_reviewer",
    "release_manager",
    "admin"
  ],
  admin_only: ["admin"]
};

export function canView(role: RoleKey, visibility: VisibilityLevel): boolean {
  if (visibility === "public") {
    return true;
  }

  return visibilityMatrix[visibility].includes(role);
}

export function filterVisible<T extends { visibility: VisibilityLevel }>(items: T[], role: RoleKey): T[] {
  return items.filter((item) => canView(role, item.visibility));
}

export function filterVisibleForRoles<T extends { visibility: VisibilityLevel }>(
  items: T[],
  roles: readonly RoleKey[]
): T[] {
  if (!roles.length) {
    return [];
  }

  return items.filter((item) => roles.some((role) => canView(role, item.visibility)));
}
