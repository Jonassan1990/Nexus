# Phase 3.5 — UX Report

**Date:** 2026-07-28

---

## Audit — duplicated behaviour (before)

| Experience | Duplication |
| --- | --- |
| Search | TopBar fields ≠ `getTicketSearchText` ≠ TicketList local match |
| Filters | Custom toolbars everywhere; DS `FilterBar` unused |
| Pinned / Recent | Modules centralized; tickets used “recently updated” instead of visited |
| Notifications | Read-state helpers + unread logic embedded in portal |
| Preferences | Locale / workspace / acting-role split with no catalog |
| Bulk actions | Admin-only bespoke toolbar copied per entity tab |
| Keyboard | Ctrl+K + Arrow/Escape copy-pasted across TopBar and palette |

---

## Platform UX principles

- **Enterprise / minimal / calm** — services are invisible infrastructure; no new decorative chrome  
- **Fast** — shared ranking + capped result windows  
- **Keyboard-first** — one shortcut registry; shared listbox navigation  
- **Accessibility first** — BulkActionBar keeps labelled action groups; search keeps combobox semantics  
- **Responsive first** — no fixed heights; existing mobile search continues to use the same search service  

---

## User-visible deltas (intentional, not redesigns)

1. Global ticket search ranking is consistent (exact key → prefix → contains).  
2. Opening tickets records true recents for Continue Working when available.  
3. Acting-role access preference persists across visits.  
4. Admin bulk toolbar uses the shared BulkActionBar (same actions/labels).

No Tickets / Dashboard / Admin layout redesign.
