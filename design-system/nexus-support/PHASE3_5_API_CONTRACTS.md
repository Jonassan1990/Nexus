# Phase 3.5 — API Contracts

**Date:** 2026-07-28  
**Import:** `@/features/workspace`

---

## WorkspaceSearch

```ts
getTicketSearchHaystack(ticket: WorkspaceSearchableTicket): string
ticketMatchesWorkspaceQuery(ticket, query): boolean
searchWorkspaceTickets<T>(tickets, query, limit?): WorkspaceSearchMatch<T>[]
resolveWorkspaceTicketQuery<T>(tickets, query): { exact?: T; matches: T[] }
normalizeWorkspaceQuery(query): string
```

**Contract:** One haystack definition for ticket-like entities. Modules may add fields via `WorkspaceSearchableTicket` extras, not by forking the algorithm.

---

## SavedViews

```ts
type SavedView<TFacets> = {
  id: string;
  module: string;
  name: string;
  query?: string;
  facets: TFacets;
  updatedAt: string; // ISO
}

useSavedViews(module?: string) => {
  ready, store, views, saveView, removeView, listForModule
}
```

**Contract:** `facets` is opaque JSON owned by the module. Platform does not interpret facet keys.

---

## RecentItems

```ts
rememberRecentModule(prefs, moduleKey): WorkspacePreferences
rememberRecentTicket(prefs, ticketKey): WorkspacePreferences
listRecentModules(prefs): string[]
listRecentTickets(prefs): string[]
resolveRecentTicketItems(prefs, tickets, limit?): T[]
```

**Contract:** Newest-first, de-duplicated, capped (`MAX_RECENT_MODULES` / `MAX_RECENT_TICKETS`).

---

## PinnedItems

```ts
togglePinnedModule / toggleFavouriteModule / togglePinnedTicket
isModulePinned / isModuleFavourite
listPinnedModules / listFavouriteModules / listPinnedTickets
```

**Contract:** Pins are boolean membership lists, not ordered ranks (unless product later adds ranking).

---

## NotificationCenter

```ts
getNotificationReadKeys(notification): string[]
addNotificationReadKeysForPersona(state, personaId, notification): state
isNotificationUnread(notification, readKeys): boolean
applyUnreadFlags(notifications, readKeys): NotificationItem[]
countUnreadNotifications(notifications, readKeys): number
readNotificationReadState / writeNotificationReadState
```

**Contract:** A notification is unread only if **all** of its read keys are absent for the persona.

---

## UserPreferences

```ts
type UserPreferences = {
  locale?: "en" | "sv";
  actingRoleAccessEnabled: boolean;
  density: "compact" | "comfortable" | "relaxed";
}

useUserPreferences() => { preferences, ready, setActingRoleAccessEnabled, setDensity }
WORKSPACE_STORAGE_KEYS // catalog
```

**Contract:** Locale write path remains `LocaleProvider` for i18n runtime; `UserPreferences.locale` is optional mirror. Density writes `document.documentElement.dataset.density`.

---

## BulkActionBar

```ts
type BulkAction = {
  id: string;
  label: ReactNode;
  onSelect: () => void;
  tone?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  icon?: ReactNode;
}

<BulkActionBar selectedCount summary helperText? actions aria-label? />
```

**Contract:** Presentation-only. Selection state stays in the module.

---

## KeyboardShortcutManager

```ts
registerKeyboardShortcut({ id, key, ctrlOrMeta?, shift?, alt?, ignoreWhenTyping?, handler }): () => void
handleListNavigationKeyDown(event, { length, activeIndex, onChange, onEnter?, onEscape? }): boolean
```

**Contract:** One global keydown listener. Shortcut `id`s must be unique. Ctrl/Cmd+K is reserved as `workspace.command-palette.toggle`.
