/**
 * UserPreferences — façade over workspace chrome preferences.
 * Locale remains owned by LocaleProvider; this documents and bridges shared keys.
 */

import type { Density } from "@/design-system";
import { WORKSPACE_PREFERENCES_STORAGE_KEY } from "./preferences";
import { NOTIFICATION_READ_STORAGE_KEY } from "./NotificationCenter";
import { SAVED_VIEWS_STORAGE_KEY } from "./SavedViews";
import { safeReadLocalStorage, safeWriteLocalStorage } from "./storage";

export const LOCALE_STORAGE_KEY = "nexus-portal-locale";
export const USER_PREFERENCES_STORAGE_KEY = "nexus-user-preferences-v1";

export type UserPreferences = {
  /** Mirrors LocaleProvider when synced. */
  locale?: "en" | "sv";
  /** Acting-role access toggle — persisted for return visits. */
  actingRoleAccessEnabled: boolean;
  /** Density preference — applied by shell when wired. */
  density: Density;
};

export const defaultUserPreferences = (): UserPreferences => ({
  actingRoleAccessEnabled: false,
  density: "comfortable"
});

export function parseUserPreferences(raw: string | null): UserPreferences {
  if (!raw) {
    return defaultUserPreferences();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    const density =
      parsed.density === "compact" || parsed.density === "comfortable" || parsed.density === "relaxed"
        ? parsed.density
        : "comfortable";

    return {
      locale: parsed.locale === "en" || parsed.locale === "sv" ? parsed.locale : undefined,
      actingRoleAccessEnabled: Boolean(parsed.actingRoleAccessEnabled),
      density
    };
  } catch {
    return defaultUserPreferences();
  }
}

export function readUserPreferences(): UserPreferences {
  return parseUserPreferences(safeReadLocalStorage(USER_PREFERENCES_STORAGE_KEY));
}

export function writeUserPreferences(preferences: UserPreferences): void {
  safeWriteLocalStorage(USER_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
}

/** Catalog of platform storage keys — single source for migration docs. */
export const WORKSPACE_STORAGE_KEYS = {
  workspacePreferences: WORKSPACE_PREFERENCES_STORAGE_KEY,
  userPreferences: USER_PREFERENCES_STORAGE_KEY,
  locale: LOCALE_STORAGE_KEY,
  notificationRead: NOTIFICATION_READ_STORAGE_KEY,
  savedViews: SAVED_VIEWS_STORAGE_KEY
} as const;
