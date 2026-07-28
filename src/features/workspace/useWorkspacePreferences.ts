"use client";

import { useCallback, useEffect, useState } from "react";
import {
  isModuleFavourite,
  isModulePinned,
  toggleFavouriteModule,
  togglePinnedModule,
  togglePinnedTicket
} from "./PinnedItems";
import {
  WORKSPACE_PREFERENCES_STORAGE_KEY,
  defaultWorkspacePreferences,
  parseWorkspacePreferences,
  type WorkspacePreferences
} from "./preferences";
import { rememberRecentModule, rememberRecentTicket } from "./RecentItems";
import { safeWriteLocalStorage } from "./storage";

export function useWorkspacePreferences() {
  const [preferences, setPreferences] = useState<WorkspacePreferences>(defaultWorkspacePreferences);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setPreferences(parseWorkspacePreferences(window.localStorage.getItem(WORKSPACE_PREFERENCES_STORAGE_KEY)));
    } catch {
      setPreferences(defaultWorkspacePreferences());
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }

    safeWriteLocalStorage(WORKSPACE_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences, ready]);

  const togglePinned = useCallback((moduleKey: string) => {
    setPreferences((current) => togglePinnedModule(current, moduleKey));
  }, []);

  const toggleFavourite = useCallback((moduleKey: string) => {
    setPreferences((current) => toggleFavouriteModule(current, moduleKey));
  }, []);

  const rememberRecent = useCallback((moduleKey: string) => {
    setPreferences((current) => rememberRecentModule(current, moduleKey));
  }, []);

  const rememberTicket = useCallback((ticketKey: string) => {
    setPreferences((current) => rememberRecentTicket(current, ticketKey));
  }, []);

  const toggleTicketPinned = useCallback((ticketKey: string) => {
    setPreferences((current) => togglePinnedTicket(current, ticketKey));
  }, []);

  return {
    preferences,
    ready,
    togglePinned,
    toggleFavourite,
    rememberRecent,
    rememberTicket,
    toggleTicketPinned,
    isPinned: (moduleKey: string) => isModulePinned(preferences, moduleKey),
    isFavourite: (moduleKey: string) => isModuleFavourite(preferences, moduleKey)
  };
}
