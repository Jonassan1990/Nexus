# Design Tokens — Nexus Support

**Phase 0 source of truth.**  
Implementation: `src/styles/tokens.css` · Utilities: `src/styles/utilities.css` · Runtime charts: `src/lib/theme/cssVar.ts`

## Principles

1. Semantic over raw — components never bind to hex.
2. Domain over generic status — ticket lifecycle has its own tokens.
3. Scania identity preserved — navy primary, radius 0, Scania Sans.
4. Legacy aliases bridge migration — prefer new names in new code.
5. Charts consume CSS variables via `chartColorVars` / `priorityChartColorVars`.

## Color

| Token | Purpose |
| --- | --- |
| `--background` | App canvas |
| `--surface` / `--surface-elevated` / `--surface-muted` / `--surface-hover` | Panels |
| `--text-primary` / `--text-secondary` / `--text-muted` / `--text-inverse` | Copy hierarchy |
| `--border-default` / `--border-muted` / `--border-strong` | Structure |
| `--primary` / `--primary-hover` / `--primary-soft` / `--on-primary` | Actions / chrome |
| `--success` / `--warning` / `--danger` / `--info` (+ soft) | System status |
| `--ticket-*` | Ticket lifecycle domain |
| `--chart-1`…`--chart-5` / `--chart-muted` | Charts (no hex in TSX) |

## Spacing

8px grid via `--space-unit`. Scale: `--space-1`…`--space-16`.  
Density: `data-density="compact|comfortable|relaxed"` on `<html>`.  
Touch target: `--touch-target` (44px).

## Typography

Display XL → Mono via CSS variables and `.nx-*` utilities.  
Weights: 400 / 500 / 700.

## Motion

`--motion-fast` 150ms · `--motion-base` 200ms · `--motion-slow` 250ms.  
Helpers: `.nx-transition-colors`, `.nx-transition-shadow`.  
Reduced motion handled in `utilities.css`.

## Elevation

`--elevation-none` for panels.  
`--elevation-border` · `--elevation-popover` · `--elevation-modal` · `--elevation-sticky` for overlays/sticky bars.  
`--overlay-scrim` for modal backdrops.

## Icons

`--icon-sm` 16 · `--icon-md` 20 · `--icon-lg` 24 · `--icon-xl` 32.  
Helpers: `.nx-icon-sm` … `.nx-icon-xl`.

## Radius

`--radius` / `--radius-sm` / `--radius-md` / `--radius-lg` / `--radius-pill` = `0`.  
`--radius-circle` = `50%` (geometric circles only: avatars, rings).

## Layout primitives

`src/design-system/layout` — `Page`, `PageHeader`, `Toolbar`, `Content`, `Section`, `Panel`, `SidebarSection`, `Stack`, `Cluster`.  
Styles: `src/styles/layout.css`.

## Enterprise DS (Phase 1.5)

Public entry: `@/design-system`  
Inventories: `PHASE1_5_INVENTORY.md`

- Primitives: Card, MetricCard, Stat, StatusBadge, Alert, EmptyState, LoadingState, ErrorState, Skeleton, SearchBox, FilterBar, ActionBar, DataTable
- Patterns: DashboardSection, TableSection, FormSection, SplitView, InspectorPanel, CommandBar, Sidebar*
- Templates: Dashboard, List, Details, CRUD, Settings, Wizard, Report
- Dark mode: `[data-theme="dark"]` / `.tds-mode-dark` in `tokens.css`
