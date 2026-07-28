"use client";

import { useCallback, useEffect, useState } from "react";
import {
  SAVED_VIEWS_STORAGE_KEY,
  createSavedViewId,
  defaultSavedViewsStore,
  deleteSavedView,
  listSavedViews,
  parseSavedViewsStore,
  upsertSavedView,
  writeSavedViewsStore,
  type SavedView,
  type SavedViewScope,
  type SavedViewsStore
} from "./SavedViews";

export function useSavedViews(module?: SavedViewScope) {
  const [store, setStore] = useState<SavedViewsStore>(defaultSavedViewsStore);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setStore(parseSavedViewsStore(window.localStorage.getItem(SAVED_VIEWS_STORAGE_KEY)));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }

    writeSavedViewsStore(store);
  }, [ready, store]);

  const views = module ? listSavedViews(store, module) : [];

  const saveView = useCallback((view: Omit<SavedView, "id" | "updatedAt"> & { id?: string }) => {
    const next: SavedView = {
      id: view.id ?? createSavedViewId(),
      module: view.module,
      name: view.name,
      query: view.query ?? "",
      facets: view.facets,
      updatedAt: new Date().toISOString()
    };

    setStore((current) => upsertSavedView(current, next));
    return next;
  }, []);

  const removeView = useCallback((scope: SavedViewScope, viewId: string) => {
    setStore((current) => deleteSavedView(current, scope, viewId));
  }, []);

  return {
    ready,
    store,
    views,
    saveView,
    removeView,
    listForModule: (scope: SavedViewScope) => listSavedViews(store, scope)
  };
}
