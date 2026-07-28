/**
 * SavedViews — named filter snapshots per module.
 * Greenfield platform service; modules persist existing facet shapes here.
 */

import { safeReadLocalStorage, safeWriteLocalStorage } from "./storage";

export const SAVED_VIEWS_STORAGE_KEY = "nexus-workspace-saved-views-v1";

export type SavedViewScope = string;

export type SavedView<TFacets extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  module: SavedViewScope;
  name: string;
  query?: string;
  facets: TFacets;
  updatedAt: string;
};

export type SavedViewsStore = Record<string, SavedView[]>;

export function defaultSavedViewsStore(): SavedViewsStore {
  return {};
}

export function parseSavedViewsStore(raw: string | null): SavedViewsStore {
  if (!raw) {
    return defaultSavedViewsStore();
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return defaultSavedViewsStore();
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([module, views]) => [
        module,
        Array.isArray(views)
          ? views
              .filter((view): view is SavedView => Boolean(view && typeof view === "object"))
              .map((view) => ({
                id: String((view as SavedView).id ?? createSavedViewId()),
                module: String((view as SavedView).module ?? module),
                name: String((view as SavedView).name ?? "Untitled view"),
                query: typeof (view as SavedView).query === "string" ? (view as SavedView).query : "",
                facets:
                  (view as SavedView).facets &&
                  typeof (view as SavedView).facets === "object" &&
                  !Array.isArray((view as SavedView).facets)
                    ? ((view as SavedView).facets as Record<string, unknown>)
                    : {},
                updatedAt: String((view as SavedView).updatedAt ?? new Date().toISOString())
              }))
          : []
      ])
    );
  } catch {
    return defaultSavedViewsStore();
  }
}

export function readSavedViewsStore(): SavedViewsStore {
  return parseSavedViewsStore(safeReadLocalStorage(SAVED_VIEWS_STORAGE_KEY));
}

export function writeSavedViewsStore(store: SavedViewsStore): void {
  safeWriteLocalStorage(SAVED_VIEWS_STORAGE_KEY, JSON.stringify(store));
}

export function listSavedViews(store: SavedViewsStore, module: SavedViewScope): SavedView[] {
  return [...(store[module] ?? [])].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function upsertSavedView(store: SavedViewsStore, view: SavedView): SavedViewsStore {
  const current = store[view.module] ?? [];
  const without = current.filter((item) => item.id !== view.id);

  return {
    ...store,
    [view.module]: [{ ...view, updatedAt: new Date().toISOString() }, ...without]
  };
}

export function deleteSavedView(
  store: SavedViewsStore,
  module: SavedViewScope,
  viewId: string
): SavedViewsStore {
  return {
    ...store,
    [module]: (store[module] ?? []).filter((item) => item.id !== viewId)
  };
}

export function createSavedViewId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `view-${crypto.randomUUID()}`;
  }

  return `view-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
