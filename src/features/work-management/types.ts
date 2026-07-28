/**
 * Work Management platform — domain-agnostic work item model (Phase 4)
 * Tickets are one WorkItemType. Do not bake Ticket UI into this layer.
 */

import type { Tone } from "@/design-system/shared";

export type WorkItemType =
  | "support_request"
  | "change_request"
  | "approval"
  | "release_task"
  | "quality_action"
  | "escalation"
  | "ticket"
  | (string & {});

export type WorkItemPriority = "Critical" | "High" | "Medium" | "Low" | (string & {});

export type WorkItemQueueBucket = "open" | "ongoing" | "blocked" | "done";

export type WorkItemRef = {
  id: string;
  key: string;
  type: WorkItemType;
};

export type WorkItemAssignee = {
  id?: string;
  name: string;
  role?: string;
  email?: string;
};

export type WorkItemStatus = {
  label: string;
  tone?: Tone;
  bucket?: WorkItemQueueBucket;
};

export type WorkItem = WorkItemRef & {
  title: string;
  summary?: string;
  status: WorkItemStatus;
  priority?: WorkItemPriority;
  product?: string;
  module?: string;
  site?: string;
  region?: string;
  owner?: WorkItemAssignee;
  submitter?: WorkItemAssignee;
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
};

export type WorkItemFacetOption = {
  value: string;
  label: string;
};

export type WorkItemFacet = {
  id: string;
  label: string;
  value: string;
  options: WorkItemFacetOption[];
  onChange: (value: string) => void;
};

export type WorkItemSortOption = {
  value: string;
  label: string;
};

export type WorkItemTab = {
  id: string;
  label: string;
  description?: string;
};

export type WorkItemTimelineStep = {
  id: string;
  label: string;
  detail?: string;
  state: "complete" | "active" | "waiting" | "blocked" | "rejected" | "optional";
};

export type WorkItemActivityEvent = {
  id: string;
  title: string;
  detail?: string;
  actor?: string;
  at?: string;
  tone?: Tone;
};

export type WorkItemComment = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  visibility?: string;
};

export type WorkItemFilterState = {
  query: string;
  facets: Record<string, string>;
  sortBy: string;
  mineOnly: boolean;
};
