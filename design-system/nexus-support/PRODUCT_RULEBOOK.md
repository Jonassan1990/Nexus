# Product Rulebook — Nexus Support Portal

**Phase:** 1.75 — Product Rules & Information Architecture  
**Status:** Canonical product behaviour rules  
**Audience:** Product, design, frontend engineering  

> This rulebook defines **how the product behaves**.  
> It does **not** redesign visuals, features, or business logic.  
> UI must be composed from `@/design-system`. Tokens: `TOKENS.md`. Shell: `pages/shell.md`.  
> Cross-module behaviour must use `@/features/workspace` — see [`PHASE3_5_API_CONTRACTS.md`](./PHASE3_5_API_CONTRACTS.md).

---

## Document set

| Deliverable | File |
| --- | --- |
| Information Architecture | [`product/INFORMATION_ARCHITECTURE.md`](./product/INFORMATION_ARCHITECTURE.md) |
| Navigation Guidelines | [`product/NAVIGATION_GUIDELINES.md`](./product/NAVIGATION_GUIDELINES.md) |
| Page Blueprint Catalogue | [`product/PAGE_BLUEPRINTS.md`](./product/PAGE_BLUEPRINTS.md) |
| State Catalogue | [`product/STATE_CATALOGUE.md`](./product/STATE_CATALOGUE.md) |
| Migration Strategy | [`product/MIGRATION_STRATEGY.md`](./product/MIGRATION_STRATEGY.md) |

---

## Product principles

Every screen must answer, in order:

1. **What is happening?** — status, counts, alerts, selected entity  
2. **What should the user do next?** — primary action, clear path  
3. **What deserves attention?** — breaches, blockers, approvals, escalations  

The portal must feel: calm, professional, predictable, fast, minimal, enterprise, premium, information-first.

---

## Mandatory page hierarchy

All module pages follow this hierarchy. No exceptions for new work.

```
App shell (TopBar + Sidebar)
  └─ main#main-content
       └─ Page
            ├─ PageHeader          (title, description, primary actions)
            ├─ Toolbar / CommandBar (optional — search, filters, secondary actions)
            └─ Content
                 └─ Section(s)
                      └─ Panel / pattern / template body
```

**Template mapping (required for new pages):**

| Intent | Template |
| --- | --- |
| Overview / KPIs | Command Center (`MetricGrid` + section patterns) |
| Browse / filter / select | `ListTemplate` + `WorkItemList` |
| Inspect one entity | `DetailsTemplate` + `WorkItemDetails` |
| Operational knowledge | `DetailsTemplate` + Knowledge patterns |
| Create / edit form | `CrudTemplate` |
| Configuration | `SettingsTemplate` |
| Multi-step flow | `WizardTemplate` |
| Analytics | `ReportTemplate` |

---

## Cross-module workspace platform (Phase 3.5)

Import from `@/features/workspace`. Do **not** duplicate:

| Concern | Service |
| --- | --- |
| Ticket / entity search | `WorkspaceSearch` |
| Named filters | `SavedViews` |
| Recent modules / tickets | `RecentItems` |
| Pins / favourites | `PinnedItems` |
| Notification read-state | `NotificationCenter` |
| Acting role / density prefs | `UserPreferences` |
| Multi-select actions | `BulkActionBar` |
| Global shortcuts / list arrows | `KeyboardShortcutManager` |

Contracts → [`PHASE3_5_API_CONTRACTS.md`](./PHASE3_5_API_CONTRACTS.md).

---

## Cross-cutting product rules (summary)

### Navigation
- Sidebar is the system of record for module access.  
- Role visibility gates modules; never hide critical errors—show `AccessRestricted` empty/error pattern.  
- Deep links open module + entity + optional detail tab.  
Full rules → [Navigation Guidelines](./product/NAVIGATION_GUIDELINES.md).

### Toolbar
- One toolbar row under `PageHeader`.  
- Order left→right: **Search → Filters → View options → Secondary actions**.  
- Primary page CTA stays in `PageHeader` actions (not buried in filters).

### Action placement
| Action type | Placement |
| --- | --- |
| Primary (create, save, submit) | `PageHeader` actions or sticky `ActionBar` footer on forms |
| Secondary (export, sync, refresh) | Toolbar / CommandBar |
| Destructive | Explicit secondary control; never as sole primary CTA |
| Row-level | End of row or overflow menu; keyboard reachable |
| Bulk | Appear only when selection exists; above table |

### Filter placement
- List / queue / report filters live in `FilterBar` or `CommandBar` directly under the header.  
- Status chips (`FilterChip`) are mutually clear: show active state with `aria-pressed`.  
- Do not duplicate the same filter in header and sidebar unless SplitView list+inspector requires scoped facets.

### Search behaviour
- Global ticket search may live in TopBar; module search lives in module toolbar.  
- Search is immediate or explicit submit—pick one per surface and keep it consistent within that module.  
- Empty query restores unfiltered list (subject to other active filters).  
- Announce result changes to assistive tech when results update asynchronously.

### Table behaviour
- Use `DataTable` / `TableSection` for new tabular UI.  
- Sticky header; horizontal scroll on small viewports—never clip critical columns without a detail path.  
- Sort indicators must be keyboard operable.  
- Row click opens details only when the whole row is the affordance; otherwise use an explicit control.  
- Empty tables use `EmptyState` inside the table panel—not a blank white void.

### Responsive behaviour
| Breakpoint | Behaviour |
| --- | --- |
| Desktop ≥1200 | Full hierarchy; split views side-by-side |
| Tablet 768–1199 | Split views stack; KPI grids 2 columns |
| Mobile ≤767 | Single column; header/toolbar actions full width; tables scroll; touch ≥44px |

### Loading / empty / error / KPI / chart / a11y
Defined in [State Catalogue](./product/STATE_CATALOGUE.md) and summarised below:

- **Loading:** `LoadingState` / `Skeleton` with `aria-busy` / `aria-live`. Prefer skeleton for known layout.  
- **Empty:** Explain why + next action. Use `EmptyState`.  
- **Error:** `ErrorState` / `Alert` with `role="alert"`; recoverable actions when possible.  
- **KPI:** Max information density without decoration; one metric = one question answered.  
- **Charts:** Colours only from `--chart-*` / domain tokens; always provide a table or textual alternative.  
- **A11y:** WCAG AA, focus rings, skip link, reduced motion, semantic headings.

---

## Role of Design System vs Product Rulebook

| Layer | Owns |
| --- | --- |
| Tokens / primitives / patterns / templates | How UI is built |
| This rulebook | How product surfaces behave and are structured |
| Feature modules | Domain workflows (tickets, Jira, approvals…) — without inventing new page shapes |

---

## Governance

1. New screens must declare their blueprint before implementation.  
2. Deviations require product + design agreement and an entry in the migration strategy.  
3. Visual chrome changes belong to Design System phases—not ad-hoc feature CSS.  

**Phase 1.75 defines rules only. Implementation adoption follows the migration strategy.**
