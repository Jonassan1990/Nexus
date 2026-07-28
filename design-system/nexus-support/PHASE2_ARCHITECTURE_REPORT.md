# Phase 2 — Architecture Report

**Date:** 2026-07-28  
**Scope:** Application shell / workspace chrome only  
**Repo:** `Nexus-Portal-support`  
**Status:** Complete — awaiting review

---

## Verdict

Phase 2 establishes a **Workspace shell** that owns navigation, personalization, global search entry points, notifications, user menu, responsive drawer behaviour, and a Ctrl/Cmd+K command palette scaffold. Feature modules (Dashboard, Tickets, Admin, etc.) inherit the shell automatically via `NexusPortal` and were not redesigned.

---

## Shell ownership map

| Concern | Owner | Implementation |
| --- | --- | --- |
| Top navigation | `TopBar` in `NexusPortal.tsx` | Brand, hamburger, ticket search, locale, persona, notifications, command palette trigger, user menu |
| Primary navigation | `PortalSidebar.tsx` | Favourites / Pinned / Recent / Modules; compact + expanded; mobile dialog drawer |
| Workspace layout | `.app-shell` → `.workspace` → `#main-content` | Unchanged layout contract; `Page` → `PageHeader` → `Content` from Phase 1 |
| Module preferences | `src/features/workspace/*` | localStorage pinned / favourites / recent |
| Command palette | `CommandPaletteHost.tsx` | Controlled open + Ctrl/Cmd+K; module jump |
| Focus after nav | `focusMainContent.ts` | Moves focus to `#main-content` |
| Shell styles | `src/styles/workspace.css` | Nav sections, palette, mobile search |

---

## Architecture decisions

1. **Shell remains the composition root.** `NexusPortal` still mounts TopBar + Sidebar + workspace. Preferences and palette live under `src/features/workspace/` so shell behaviour can evolve without touching feature panels.
2. **Preferences are client-local.** No API yet — `nexus-workspace-preferences-v1` in `localStorage`. Easy to swap for user-profile sync later.
3. **Command palette is a host, not a feature.** Today: jump to modules. Tomorrow: tickets / actions can register items without redesigning chrome.
4. **Every page inherits the shell** because all modules render inside `NexusPortal`’s `<main id="main-content">`. No per-route shell forks.
5. **No gradients / glass / decorative effects.** Navy chrome + token surfaces only (`pages/shell.md`, Product Rulebook).

---

## Data flow

```
Persona-visible navItems
        │
        ├─► PortalSidebar (sections filtered by preferences ∩ visible items)
        ├─► CommandPaletteHost (module jump items)
        └─► openModule()
                ├─ setActiveModule / role
                ├─ rememberRecent(module)
                └─ focusMainContent()
```

---

## Explicit non-goals (Phase 2)

- Dashboard / Tickets / Admin / feature body redesign  
- Server-backed personalization  
- Full command palette (tickets, actions, admin deep links)  
- Rework of in-module tabs or page templates beyond inheritance
