/**
 * PinnedItems — platform pin semantics for modules (and future entity pins).
 */

import type { WorkspacePreferences } from "./preferences";
import { toggleListItem } from "./storage";

export function listPinnedModules(preferences: WorkspacePreferences): string[] {
  return preferences.pinned;
}

export function listFavouriteModules(preferences: WorkspacePreferences): string[] {
  return preferences.favourites;
}

export function isModulePinned(preferences: WorkspacePreferences, moduleKey: string): boolean {
  return preferences.pinned.includes(moduleKey);
}

export function isModuleFavourite(preferences: WorkspacePreferences, moduleKey: string): boolean {
  return preferences.favourites.includes(moduleKey);
}

export function togglePinnedModule(
  preferences: WorkspacePreferences,
  moduleKey: string
): WorkspacePreferences {
  return {
    ...preferences,
    pinned: toggleListItem(preferences.pinned, moduleKey)
  };
}

export function toggleFavouriteModule(
  preferences: WorkspacePreferences,
  moduleKey: string
): WorkspacePreferences {
  return {
    ...preferences,
    favourites: toggleListItem(preferences.favourites, moduleKey)
  };
}

export function listPinnedTickets(preferences: WorkspacePreferences): string[] {
  return preferences.pinnedTickets ?? [];
}

export function togglePinnedTicket(
  preferences: WorkspacePreferences,
  ticketKey: string
): WorkspacePreferences {
  return {
    ...preferences,
    pinnedTickets: toggleListItem(preferences.pinnedTickets ?? [], ticketKey)
  };
}
