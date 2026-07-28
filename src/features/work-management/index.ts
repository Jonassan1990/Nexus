/**
 * Work Management platform — public API (Phase 4)
 */

export type {
  WorkItemType,
  WorkItemPriority,
  WorkItemQueueBucket,
  WorkItemRef,
  WorkItemAssignee,
  WorkItemStatus,
  WorkItem,
  WorkItemFacetOption,
  WorkItemFacet,
  WorkItemSortOption,
  WorkItemTab,
  WorkItemTimelineStep,
  WorkItemActivityEvent,
  WorkItemComment,
  WorkItemFilterState
} from "./types";

export { mapTicketToWorkItem, ticketWorkItemType, workItemSearchFields } from "./ticketAdapter";

export {
  WorkItemList,
  WorkItemDetails,
  WorkItemToolbar,
  WorkItemFilters,
  WorkItemInspector,
  WorkItemTimeline,
  WorkItemActivity,
  WorkItemComments,
  AssignmentPanel,
  StatusTimeline,
  WorkItemSplitWorkspace,
  WorkItemPriorityBadge,
  WorkItemStatusBadge
} from "@/design-system/patterns/work-item";
