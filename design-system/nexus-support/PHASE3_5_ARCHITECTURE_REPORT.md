# Phase 3.5 — Architecture Report

**Date:** 2026-07-28  
**Scope:** Cross-module workspace platform services only  
**Status:** Complete — awaiting review

---

## Verdict

Phase 3.5 establishes a **single workspace platform** under `src/features/workspace/`. Search, saved views, recent/pinned, notifications read-state, user preferences, bulk actions, and keyboard shortcuts are now shared services. Dashboard / Tickets / Admin / Knowledge UIs were **not redesigned**.

---

## Platform ownership

| Service | Module path | Owns |
| --- | --- | --- |
| WorkspaceSearch | `WorkspaceSearch.ts` | Canonical ticket haystack, ranking, resolve |
| SavedViews | `SavedViews.ts` + `useSavedViews.ts` | Named filter snapshots per module |
| RecentItems | `RecentItems.ts` | Recent modules + tickets |
| PinnedItems | `PinnedItems.ts` | Pin / favourite modules (+ ticket pin API) |
| NotificationCenter | `NotificationCenter.ts` | Read-state storage + unread helpers |
| UserPreferences | `UserPreferences.ts` + hook | Acting-role + density (+ key catalog) |
| BulkActionBar | `BulkActionBar.tsx` | Multi-select action chrome |
| KeyboardShortcutManager | `KeyboardShortcutManager.ts` | Chord registry + list navigation |

Public barrel: `@/features/workspace` (`index.ts`).

---

## Design rule

> Every future module **must consume** these services.  
> Never re-implement search haystacks, pin lists, notification read keys, Escape/arrow list handling, or bulk toolbars locally.

---

## Shell wiring (strangler)

| Consumer | Service |
| --- | --- |
| TopBar ticket search | `WorkspaceSearch` + `handleListNavigationKeyDown` |
| `searchAndOpenTicket` | `resolveWorkspaceTicketQuery` |
| `getTicketSearchText` | wraps `getTicketSearchHaystack` |
| Command palette Ctrl+K | `registerKeyboardShortcut` |
| Notification read helpers | `NotificationCenter` |
| Module pin/fav/recent | existing prefs via `PinnedItems` / `RecentItems` |
| Ticket open paths | `rememberTicket` → RecentItems |
| Command Center Continue Working | prefers recent tickets from RecentItems |
| Acting role toggle | `UserPreferences` persistence |
| Admin master selection toolbar | `BulkActionBar` |

---

## Explicit non-goals

- Tickets / Dashboard / Admin / Knowledge visual redesign  
- Ticket multi-select (BulkActionBar ready; Tickets not converted)  
- Saved Views UI chrome (API ready for TicketList/Reports)  
- Density toggle UI (preference stored + applied to `data-density`)
