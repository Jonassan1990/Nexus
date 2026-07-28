# Phase 3.5 — Migration Strategy

**Date:** 2026-07-28

---

## Principle

Strangler fig: extract behaviour first, keep module markup. New module work **must** import from `@/features/workspace`.

---

## Wave plan

| Wave | Action | Status |
| --- | --- | --- |
| 0 | Create platform services + barrel | **Done** |
| 1 | Wire shell search / shortcuts / notifications / prefs / recent tickets | **Done** |
| 2 | Admin bulk toolbar → `BulkActionBar` | **Done** |
| 3 | TicketList facets → `useSavedViews` + DS `FilterBar` (no layout redesign required beyond adapter) | Pending |
| 4 | Escalation / Reports search → `WorkspaceSearch` helpers | Pending |
| 5 | Notification module list → unread helpers only (optional shared row later) | Pending |
| 6 | Remove remaining local Escape/arrow duplicates in favour of registry | Pending |

---

## Do / Don’t

**Do**
- Import search / pin / recent / notifications / shortcuts from `@/features/workspace`
- Persist filter snapshots with `SavedViews`
- Register global chords with `KeyboardShortcutManager`

**Don’t**
- Invent a second ticket haystack
- Store pin/recent lists ad hoc in module state
- Add another document-level Ctrl+K listener
- Redesign Tickets/Dashboard/Admin while migrating

---

## Storage keys

See `WORKSPACE_STORAGE_KEYS` in `UserPreferences.ts`:

- `nexus-workspace-preferences-v1`
- `nexus-user-preferences-v1`
- `nexus-portal-locale`
- `nexus-notification-read-state-v1`
- `nexus-workspace-saved-views-v1`
