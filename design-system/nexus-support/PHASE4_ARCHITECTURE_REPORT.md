# Phase 4 — Architecture Report

**Date:** 2026-07-28  
**Scope:** Work Management platform (Tickets as first consumer)  
**Status:** Complete — awaiting review

---

## Verdict

Phase 4 introduces a **Work Management platform**. Tickets remain one `WorkItemType`. Reusable WorkItem patterns live in the Design System; ticket adapters live at the feature boundary. This is **not** a Ticket visual redesign.

---

## Model

```
WorkItem (generic)
  ← ticketAdapter.mapTicketToWorkItem(Ticket)
  ← future: approval / release_task / quality_action / escalation adapters
```

Future work item types declared in `WorkItemType`:
`support_request` · `change_request` · `approval` · `release_task` · `quality_action` · `escalation` · `ticket`

---

## Layers

| Layer | Path | Responsibility |
| --- | --- | --- |
| Types | `src/features/work-management/types.ts` | WorkItem contracts |
| Adapters | `ticketAdapter.ts` | Ticket → WorkItem |
| Patterns | `src/design-system/patterns/work-item.tsx` | Presentational shells |
| Styles | `src/styles/work-item.css` | Token-based layout |
| Barrel | `@/features/work-management` + `@/design-system` | Public API |
| Consumer | `TicketListWorkspace` / `TicketDetail` | Thin wiring |

---

## Reusable experiences delivered

| Component | Role |
| --- | --- |
| `WorkItemList` | List workspace shell |
| `WorkItemDetails` | Detail hero + tabs + panel |
| `WorkItemToolbar` | Back / context toolbar |
| `WorkItemFilters` | Search + facets + sort + mine |
| `WorkItemInspector` | Metadata inspector |
| `WorkItemTimeline` | Process steps |
| `StatusTimeline` | Compact status strip |
| `WorkItemActivity` | Activity / audit list |
| `WorkItemComments` | Comment thread shell |
| `AssignmentPanel` | Ownership panel |
| `WorkItemSplitWorkspace` | Optional master–detail |

---

## Platform dependencies

- Design System primitives / layout  
- Product Rulebook list/details blueprints  
- Workspace Services (`WorkspaceSearch` haystack in Ticket filters)  
- Semantic tokens only  

---

## Explicit non-goals

- Redesigning Ticket table columns / Jira / Escalation business logic  
- Multi-select bulk for tickets (BulkActionBar ready from 3.5)  
- Migrating Approvals / Escalations modules onto WorkItem yet
