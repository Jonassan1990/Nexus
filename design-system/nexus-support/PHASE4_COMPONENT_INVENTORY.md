# Phase 4 — Component Inventory

**Date:** 2026-07-28

---

## Work Management platform

| Component | Package | File |
| --- | --- | --- |
| `WorkItem` types | `@/features/work-management` | `types.ts` |
| `mapTicketToWorkItem` | `@/features/work-management` | `ticketAdapter.ts` |
| `WorkItemList` | `@/design-system` | `patterns/work-item.tsx` |
| `WorkItemDetails` | `@/design-system` | `patterns/work-item.tsx` |
| `WorkItemToolbar` | `@/design-system` | `patterns/work-item.tsx` |
| `WorkItemFilters` | `@/design-system` | `patterns/work-item.tsx` |
| `WorkItemInspector` | `@/design-system` | `patterns/work-item.tsx` |
| `WorkItemTimeline` | `@/design-system` | `patterns/work-item.tsx` |
| `StatusTimeline` | `@/design-system` | `patterns/work-item.tsx` |
| `WorkItemActivity` | `@/design-system` | `patterns/work-item.tsx` |
| `WorkItemComments` | `@/design-system` | `patterns/work-item.tsx` |
| `AssignmentPanel` | `@/design-system` | `patterns/work-item.tsx` |
| `WorkItemSplitWorkspace` | `@/design-system` | `patterns/work-item.tsx` |
| `WorkItemPriorityBadge` | `@/design-system` | `patterns/work-item.tsx` |
| `WorkItemStatusBadge` | `@/design-system` | `patterns/work-item.tsx` |

Styles: `src/styles/work-item.css`

---

## Ticket consumers (wired)

| Ticket surface | Uses |
| --- | --- |
| `TicketListWorkspace` list | `WorkItemList`, `WorkItemFilters`, WorkspaceSearch haystack |
| `TicketListWorkspace` detail mode | `WorkItemToolbar` |
| `TicketDetail` | `WorkItemDetails` |
| `OverviewPanel` | `AssignmentPanel` |
| `TicketLifecycleStrip` | `StatusTimeline` |

---

## Still Ticket-local (intentionally)

- Table columns / mobile cards  
- `WorkflowPanel`, `ClarificationPanel`, `JiraSyncPanel`, `EscalationPanel`  
- `CommentPanel`, `AuditTimeline`, `AttachmentPanel`  
- `GovernanceQueue` (unused)

---

## Related platform (Phase 3.5)

`BulkActionBar`, `SavedViews`, `RecentItems`, `PinnedItems`, `KeyboardShortcutManager` — ready for later WorkItem waves.
