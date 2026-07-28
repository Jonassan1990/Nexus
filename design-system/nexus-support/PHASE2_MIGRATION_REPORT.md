# Phase 2 — Migration Report

**Date:** 2026-07-28  
**Scope:** Shell migration only

---

## Summary

Feature modules required **no content migration**. The shell wrap from Phase 1 (`Page` → `PageHeader` → `Content`) continues; Phase 2 adds workspace preferences, sidebar personalization, TopBar utility fixes, mobile search, and the command palette host.

---

## Files added

| Path | Role |
| --- | --- |
| `src/features/workspace/preferences.ts` | Preference model + localStorage helpers |
| `src/features/workspace/useWorkspacePreferences.ts` | React hook |
| `src/features/workspace/focusMainContent.ts` | Post-nav focus helper |
| `src/features/workspace/CommandPaletteHost.tsx` | Ctrl/Cmd+K host |
| `src/styles/workspace.css` | Shell personalization + palette styles |
| `design-system/nexus-support/PHASE2_*.md` | Reports |

---

## Files changed

| Path | Change |
| --- | --- |
| `src/app/globals.css` | Import `workspace.css`; mobile drawer navy; mobile header `position: relative` |
| `src/components/nexus/PortalSidebar.tsx` | Favourites / Pinned / Recent / Modules; pin/star; dialog drawer a11y |
| `src/components/nexus/NexusPortal.tsx` | Wire preferences, palette, TopBar a11y/search, remove launcher |
| `src/design-system/primitives/index.tsx` | `SearchBox` `forwardRef` (Phase 2 prerequisite) |

---

## Inheritance

Any module rendered through `renderModule(...)` inside `NexusPortal` automatically receives:

- New sidebar behaviour  
- New TopBar behaviour  
- Command palette  
- Focus-to-main on module change  

No per-module opt-in required.

---

## Rollback

1. Revert the files above.  
2. Clear `localStorage` key `nexus-workspace-preferences-v1` if stale preferences confuse QA.  
3. Feature panels need no rollback.

---

## Test checklist

- [ ] Expand sidebar → pin and favourite modules; sections update  
- [ ] Compact rail shows icons only; labels via `aria-label` / title  
- [ ] Mobile ≤760px: drawer navy, scrim, Escape closes, focus first item on open  
- [ ] Mobile search opens and finds tickets  
- [ ] Notification badge equals attention + unread  
- [ ] Ctrl/Cmd+K opens palette; selecting a module navigates and focuses main  
- [ ] Dashboard / Tickets / Admin **visual content** unchanged  
- [ ] No gradients / glass on shell chrome
