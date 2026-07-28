"use client";

import { useCallback, useEffect, useState } from "react";
import type { Density } from "@/design-system";
import {
  USER_PREFERENCES_STORAGE_KEY,
  defaultUserPreferences,
  parseUserPreferences,
  writeUserPreferences,
  type UserPreferences
} from "./UserPreferences";

export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(defaultUserPreferences);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPreferences(parseUserPreferences(window.localStorage.getItem(USER_PREFERENCES_STORAGE_KEY)));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }

    writeUserPreferences(preferences);

    if (typeof document !== "undefined") {
      document.documentElement.dataset.density = preferences.density;
    }
  }, [preferences, ready]);

  const setActingRoleAccessEnabled = useCallback((enabled: boolean) => {
    setPreferences((current) => ({ ...current, actingRoleAccessEnabled: enabled }));
  }, []);

  const setDensity = useCallback((density: Density) => {
    setPreferences((current) => ({ ...current, density }));
  }, []);

  return {
    preferences,
    ready,
    setActingRoleAccessEnabled,
    setDensity
  };
}
