# Phase 1.5 — Design System Completion Inventory

**Date:** 2026-07-28  
**Scope:** Complete enterprise Design System — no Dashboard / Tickets / Admin / feature redesign  
**Package entry:** `@/design-system`

---

## Objective

Make the Design System the only approved path for UI composition: semantic tokens, shared primitives, patterns, and page templates — so feature work cannot bypass the foundation.

---

## Component inventory (Primitives)

| Primitive | Path | Purpose | Tokens / a11y / density / responsive / dark |
| --- | --- | --- | --- |
| `Card` | `primitives` | Flat surface container | Semantic surface/border; focusable interactive variant; density via spacing tokens; dark via theme |
| `MetricCard` | `primitives` | KPI tile (also maps `.metric-card`) | Tone tokens; button/link semantics; hover without translateY |
| `Stat` | `primitives` | Compact label/value/trend | Type + colour tokens |
| `StatusBadge` | `primitives` | Status / domain chip | Tone or `--ticket-*` domain classes |
| `Alert` | `primitives` | Inline notice | `role=status\|alert`; tone borders |
| `EmptyState` | `primitives` | Empty content | `role=status`; legacy class bridge |
| `LoadingState` | `primitives` | Busy indicator | `aria-busy`, `aria-live` |
| `ErrorState` | `primitives` | Error notice | `role=alert` via Alert |
| `Skeleton` | `primitives` | Placeholder shimmer | Reduced-motion safe |
| `SearchBox` | `primitives` | Search field | Label wrapper; focus ring; `.search-box` bridge |
| `FilterBar` | `primitives` | Filter toolbar | `role=toolbar` |
| `FilterChip` | `primitives` | Toggle filter chip | `aria-pressed` |
| `ActionBar` | `primitives` | Action cluster | Alignment variants; touch targets |
| `DataTable` | `primitives` | Accessible data table | Sticky header; keyboard row activation; overflow scroll |

**Layout primitives (Phase 1, retained):** `Page`, `PageHeader`, `Toolbar`, `Content`, `Section`, `Panel`, `SidebarSection`, `Stack`, `Cluster`

---

## Pattern inventory

| Pattern | Path | Composes |
| --- | --- | --- |
| `DashboardSection` | `patterns` | `Section` |
| `TableSection` | `patterns` | `Section` + `FilterBar` + `Panel` |
| `FormSection` | `patterns` | `Section` + `ActionBar` |
| `SplitView` | `patterns` | Responsive 2-pane grid → stack on tablet |
| `InspectorPanel` | `patterns` | `Panel` + header/actions |
| `CommandBar` | `patterns` | `Toolbar` |
| `SidebarGroup` | `patterns` | `SidebarSection` + nav |
| `SidebarHeader` | `patterns` | Title/description/actions |
| `SidebarItem` | `patterns` | Nav button with `aria-current` |
| `QuickActions` | `patterns` | `Panel` + `Cluster` |
| `RecentItems` | `patterns` | `Panel` + list buttons / `EmptyState` |

---

## Template inventory

| Template | Path | Structure |
| --- | --- | --- |
| `DashboardTemplate` | `templates` | PageHeader → metrics grid → primary/secondary |
| `ListTemplate` | `templates` | PageHeader → TableSection |
| `DetailsTemplate` | `templates` | PageHeader → detail (+ optional SplitView inspector) |
| `CrudTemplate` | `templates` | PageHeader → FormSection → ActionBar |
| `SettingsTemplate` | `templates` | PageHeader → sections (+ optional nav SplitView) |
| `WizardTemplate` | `templates` | PageHeader → steps → body → ActionBar |
| `ReportTemplate` | `templates` | PageHeader → CommandBar filters → charts → table |

All templates accept `density` and consume layout/primitives only.

---

## Dark mode

Opt-in theme tokens in `src/styles/tokens.css`:

- `[data-theme="dark"]`
- `.tds-mode-dark`

Semantic surfaces/text/borders/status soft colours remap. Light remains default (`layout.tsx` keeps `tds-mode-light`).

---

## Stylesheets

| File | Role |
| --- | --- |
| `src/styles/tokens.css` | Primitives → semantic → domain → dark |
| `src/styles/utilities.css` | Typography / spacing utilities |
| `src/styles/layout.css` | Page structure |
| `src/styles/primitives.css` | Primitive component styles |
| `src/styles/patterns.css` | Pattern styles |
| `src/styles/templates.css` | Template grids |

Imported from `src/app/globals.css`.

---

## Remaining duplicated UI (legacy — do not redesign yet)

These still exist as local markup/CSS inside `NexusPortal.tsx` / `globals.css`. They are **candidates** for migration onto the DS; features were intentionally not rewritten in 1.5.

| Legacy pattern | Approx. locations | Migrate to |
| --- | --- | --- |
| `.metric-card` blocks in dashboard | Dashboard health/KPIs | `MetricCard` / `DashboardTemplate` |
| Inline empty panels | Many modules | `EmptyState` / `WorkspacePanel` |
| `.queue-filter-bar` | Ticket queue | `FilterBar` + `FilterChip` |
| `.search-box` usages | Top bar / lists | `SearchBox` |
| `.approval-action-bar` | Approvals | `ActionBar` |
| Manual `<table>` markup | Reports / admin / queue | `DataTable` / `TableSection` |
| Admin section nav + panel | Admin | `SettingsTemplate` + `SidebarGroup` |
| Ticket detail side columns | Tickets | `DetailsTemplate` + `InspectorPanel` / `SplitView` |
| Loading screens (auth) | AuthGate / login | `LoadingState` / `Skeleton` |
| Status chips with ad-hoc classes | Tickets / threads | `StatusBadge` + ticket domain classes |
| Integration / report toolbars | Integrations / reports | `CommandBar` / `ReportTemplate` |

---

## Migration recommendations (Phase 2+)

1. **New UI only via `@/design-system`** — lint/review rule: no new `.metric-card` / empty-state markup outside DS.
2. **Strangler migration** — replace one module shell at a time with the matching template (`ListTemplate` for queues, `SettingsTemplate` for admin, `ReportTemplate` for analytics) without changing business logic.
3. **Bridge classes retained** — `EmptyState`, `MetricCard`, `SearchBox` emit legacy class names (`.empty-state`, `.metric-card`, `.search-box`) so gradual CSS retirement is safe.
4. **Dark mode rollout** — toggle `data-theme="dark"` on `<html>` or switch body to `tds-mode-dark` after chrome QA; do not invent per-feature dark palettes.
5. **Density** — keep `data-density` on `<html>`; pass `density` into templates for local overrides when needed.
6. **Deprecate `PanelPrimitives.EmptyState`** — already wraps DS; update imports to `@/design-system` then remove wrapper.

---

## Quality gate

| Criterion | Result |
| --- | --- |
| Primitives created | Yes (14 + layout) |
| Patterns created | Yes (11) |
| Templates created | Yes (7) |
| Semantic tokens only in components | Yes |
| Accessibility affordances | Yes (roles, pressed, live, focus rings, keyboard rows) |
| Density support | Yes (`data-density` + template `density`) |
| Responsive layouts | Yes (split/metrics/action breakpoints) |
| Dark mode tokens | Yes (opt-in) |
| No Dashboard/Tickets/Admin redesign | Yes |
| No business logic changes | Yes |

---

## Import cheat-sheet

```ts
import {
  DashboardTemplate,
  MetricCard,
  DataTable,
  StatusBadge,
  EmptyState,
  FilterBar,
  FilterChip
} from "@/design-system";
```
