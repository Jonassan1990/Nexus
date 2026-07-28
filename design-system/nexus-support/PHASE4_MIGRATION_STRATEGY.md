# Phase 4 — Migration Strategy

**Date:** 2026-07-28

---

## Principle

Tickets are the **first WorkItem consumer**. Other modules migrate by adapting to WorkItem patterns — never by forking Ticket UI.

---

## Waves

| Wave | Action | Status |
| --- | --- | --- |
| 0 | WorkItem types + DS patterns + CSS | **Done** |
| 1 | TicketList → `WorkItemList` + `WorkItemFilters` + WorkspaceSearch haystack | **Done** |
| 2 | TicketDetail → `WorkItemDetails` + `WorkItemToolbar` | **Done** |
| 3 | Overview ownership → `AssignmentPanel`; lifecycle → `StatusTimeline` | **Done** |
| 4 | CommentPanel → `WorkItemComments` shell | Pending |
| 5 | AuditTimeline → `WorkItemActivity` | Pending |
| 6 | Approvals / Escalations / Release tasks as WorkItem types | Pending |
| 7 | Optional `WorkItemInspector` + split view | Pending |
| 8 | Ticket bulk select → `BulkActionBar` | Pending |

---

## Adapter rule

```
Feature module
  → mapDomainToWorkItem()
  → WorkItem* patterns
  → domain-specific tab bodies stay local
```

Do **not** put Jira/escalation/domain forms inside `work-item.tsx`.

---

## Naming

Prefer WorkItem in new code. Keep `Ticket*` names at the NexusPortal boundary until a file split is justified.
