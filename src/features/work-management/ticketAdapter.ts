/**
 * Ticket → WorkItem adapter (boundary only).
 * Ticket-specific fields stay here — not in WorkItem patterns.
 */

import type { Ticket } from "@/lib/types";
import type { WorkItem, WorkItemQueueBucket, WorkItemType } from "./types";

export function ticketWorkItemType(): WorkItemType {
  return "ticket";
}

export function mapTicketToWorkItem(
  ticket: Ticket,
  extras: {
    statusLabel: string;
    statusBucket: WorkItemQueueBucket;
    typeLabel?: string;
    submitter?: string;
    ownerName?: string;
  }
): WorkItem {
  return {
    id: ticket.key,
    key: ticket.key,
    type: ticketWorkItemType(),
    title: ticket.title,
    summary: ticket.description,
    status: {
      label: extras.statusLabel,
      bucket: extras.statusBucket,
      tone:
        extras.statusBucket === "blocked"
          ? "danger"
          : extras.statusBucket === "done"
            ? "success"
            : extras.statusBucket === "ongoing"
              ? "info"
              : "neutral"
    },
    priority: ticket.priority,
    product: ticket.product,
    module: ticket.module,
    site: ticket.site,
    owner: extras.ownerName ? { name: extras.ownerName } : undefined,
    submitter: extras.submitter ? { name: extras.submitter } : undefined,
    updatedAt: ticket.updatedAt,
    tags: extras.typeLabel ? [extras.typeLabel] : undefined
  };
}

export function workItemSearchFields(item: WorkItem) {
  return {
    key: item.key,
    title: item.title,
    product: item.product,
    module: item.module,
    site: item.site,
    region: item.region,
    priority: item.priority,
    typeLabel: item.tags?.[0],
    statusLabel: item.status.label,
    locationLabel: [item.region, item.site].filter(Boolean).join(" ")
  };
}
