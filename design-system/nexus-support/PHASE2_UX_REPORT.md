# Phase 2 — UX Report

**Date:** 2026-07-28  
**Scope:** Shell UX only

---

## Audit — problems found

| Area | Problem |
| --- | --- |
| Sidebar | Flat module list only; no pin / favourite / recent; hover-expand rail was easy to misfire |
| TopBar | Inert Application switcher; notification badge used `Math.max` (one stream could hide the other) |
| Search | Ticket search desktop-only; no mobile search entry |
| Workspace | Navigation did not move focus into main content |
| Mobile | Drawer a11y incomplete; light surface override broke Scania navy identity |
| Hierarchy | Utility chrome and primary nav competed; no “workspace personalization” layer |

---

## Redesign outcomes

### Sidebar
- Sections when expanded: **Favourites → Pinned → Recent → Modules**
- Star / pin actions on each module row (expanded only)
- Compact rail stays icon-first with accessible names
- Hover-expand removed; explicit collapse/expand only
- Mobile drawer stays Scania navy; opens as modal dialog with scrim

### Top navigation
- Brand + persona remain primary chrome signals
- Ticket search retained as global utility (not a module filter replacement)
- Command palette trigger replaces inert Application switcher (`Ctrl+K` hint on wide screens)
- Notification badge = **attention + unread** (sum), label states both streams
- User menu focus restored on Escape

### Mobile
- Hamburger exposes `aria-expanded` / `aria-controls`
- Ticket search toggle in mobile header with dropdown panel
- Drawer closes on module select / Escape / scrim

### Workspace
- Selecting a module focuses `#main-content`
- Layout contract unchanged so feature pages inherit structure automatically

---

## Information hierarchy (shell)

1. **Where am I?** Active module (`aria-current`) + ModuleHeader  
2. **What can I open?** Sidebar sections + command palette  
3. **What needs me?** Attention counts + notification popover  
4. **Who am I acting as?** Persona / user menu  

---

## Future command palette

Scaffold ships now for module jump. Product Rulebook allows extending with ticket search and quick actions without changing shell ownership.
