# Navigation Guidelines — Nexus Support Portal

**Phase:** 1.75  
**Related:** [Product Rulebook](../PRODUCT_RULEBOOK.md) · [Information Architecture](./INFORMATION_ARCHITECTURE.md)

---

## 1. Navigation systems

| System | Location | Responsibility |
| --- | --- | --- |
| Primary | Sidebar | Module switching |
| Utility | TopBar | Persona, notifications, global search, mobile menu |
| Local | Tabs inside a module | Sub-views of one entity or board |
| Contextual | In-page links / KPI clicks | Jump with preserved intent |

Only **one primary module** is active at a time.

---

## 2. Sidebar rules

1. Items come from the canonical `navItems` catalogue (label, icon, role visibility).  
2. Hide modules the current persona cannot access—do not show disabled teasers that imply available work.  
3. Show attention counts only when they reflect actionable work for that persona.  
4. Compact mode: icons + accessible names (`aria-label`); expand restores labels.  
5. Mobile: sidebar is a drawer; opening a module closes the drawer.  
6. Active module uses `aria-current="page"` (or equivalent) on the nav control.
7. When expanded, optional personalization sections appear above the catalogue: **Favourites**, **Pinned**, **Recent** (subset of visible modules only). Do not invent modules outside `navItems`.
8. Pin / favourite toggles are shell preferences (local); they must not reorder the canonical Modules list.

### Order (current canonical)

Command Center → Ticket List → Release Plan → Approvals → Globalization → Clarifications → Jira Sync → Escalations → Notifications → Audit → Attachments → Integrations → Admin → Reports  

Do not reorder for aesthetics without an IA update.

---

## 3. TopBar rules

1. Brand / product mark remains visible.  
2. Global ticket search (if present) does not replace module-level filters.  
3. Notifications open the notifications module or a defined popover; choosing an item navigates with context.  
4. Persona / role switch recalculates visible modules and lands on first accessible module if the current one is no longer allowed.  
5. Hamburger only controls navigation chrome—not page content actions.
6. Command palette (`Ctrl/Cmd+K`) is a shell utility for jumping to modules (and later actions); it must not replace primary sidebar navigation.
7. Do not ship inert Application switcher chrome; wire a real utility or omit the control.

---

## 4. In-module navigation

### Tabs
- Use for peer views of the **same entity** (e.g. Overview / Workflow / Jira).  
- Do not use tabs as a second global IA.  
- Selected tab: `aria-selected` + visible state; tab list has an accessible name.

### Section anchors
- Long settings pages may use a sticky section nav (`SidebarGroup`)—that nav is local, not global.

### Breadcrumbs
- Not required for single-module workspace.  
- If added later: Shell → Module → Entity; never invent fake parents.

---

## 5. Deep linking rules

A navigable location should resolve:

| Parameter | Meaning |
| --- | --- |
| Module | Sidebar key |
| Entity id / ticket key | Selected record |
| Tab | Detail sub-view |
| Filters | Optional; restore only when explicitly part of URL strategy |

When opening from dashboard/notifications:

1. Switch module  
2. Select entity if provided  
3. Set tab if provided  
4. Do not clear unrelated user filters unless the destination defines a clean slate  

---

## 6. Access denied

If a user lands on a module they cannot access:

- Render the **Access restricted** state (not a blank main).  
- Offer navigation to an allowed module via sidebar (already visible).  
- Do not leak data from the restricted module.

---

## 7. Toolbar vs navigation

- Toolbar changes **data in the current module** (search, filter, sort, sync).  
- Navigation changes **where the user is** (module, entity, tab).  
- Never put module switches inside a filter bar.

---

## 8. Keyboard & focus

1. Skip link → `#main-content`.  
2. After module change, move focus to `main` or the new `h1` (PageHeader).  
3. Sidebar and TopBar remain reachable without pointer.  
4. Esc closes mobile nav / overlays without trapping focus.

---

## 9. Anti-patterns

- Duplicate module entries under different labels  
- Nesting a second full sidebar inside content for global modules  
- Using modal flows as primary navigation between modules  
- Soft-navigating while leaving stale headers that name the previous module  
