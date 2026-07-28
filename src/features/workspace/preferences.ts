/**
 * Workspace shell preferences — pinned / favourite / recent modules + tickets.
 * Persisted locally; no server round-trip.
 */

import { parseStringList, pushRecent, toggleListItem } from "./storage";

export type WorkspaceModuleKey = string;

export type WorkspacePreferences = {
  pinned: WorkspaceModuleKey[];
  favourites: WorkspaceModuleKey[];
  recent: WorkspaceModuleKey[];
  /** Recently opened ticket keys (newest first). */
  recentTickets: string[];
  /** Optional ticket pins — reserved for future module consumers. */
  pinnedTickets: string[];
};

export const WORKSPACE_PREFERENCES_STORAGE_KEY = "nexus-workspace-preferences-v1";
export const MAX_RECENT_MODULES = 6;

export const defaultWorkspacePreferences = (): WorkspacePreferences => ({
  pinned: [],
  favourites: [],
  recent: [],
  recentTickets: [],
  pinnedTickets: []
});

export function parseWorkspacePreferences(raw: string | null): WorkspacePreferences {
  if (!raw) {
    return defaultWorkspacePreferences();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<WorkspacePreferences>;
    return {
      pinned: parseStringList(parsed.pinned),
      favourites: parseStringList(parsed.favourites),
      recent: parseStringList(parsed.recent),
      recentTickets: parseStringList(parsed.recentTickets),
      pinnedTickets: parseStringList(parsed.pinnedTickets)
    };
  } catch {
    return defaultWorkspacePreferences();
  }
}

export { toggleListItem, pushRecent };
