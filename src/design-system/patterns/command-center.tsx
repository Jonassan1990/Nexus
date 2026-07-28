import type { ReactNode } from "react";
import { cx, type Tone } from "../shared";
import { Panel, Stack, Section } from "../layout";
import { MetricCard, EmptyState, StatusBadge, Alert, DataTable, type DataTableColumn } from "../primitives";

function CommandSection({
  title,
  description,
  actions,
  children,
  className
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Section title={title} description={description} actions={actions} className={className}>
      {children}
    </Section>
  );
}

export type CommandCenterListItem = {
  id: string;
  title: ReactNode;
  summary?: ReactNode;
  meta?: ReactNode;
  tone?: Tone;
  onSelect?: () => void;
};

export type CommandCenterQueueItem = {
  id: string;
  label: ReactNode;
  count: number;
  description?: ReactNode;
  tone?: Tone;
  onSelect?: () => void;
};

export type CommandCenterMetric = {
  id: string;
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  onSelect?: () => void;
};

export type CommandCenterReportRow = {
  id: string;
  primary: ReactNode;
  secondary?: ReactNode;
  meta?: ReactNode;
};

/** Responsive metric strip — max four cards recommended by product rules. */
export function MetricGrid({
  metrics,
  className,
  "aria-label": ariaLabel = "Key metrics"
}: {
  metrics: CommandCenterMetric[];
  className?: string;
  "aria-label"?: string;
}) {
  const visible = metrics.slice(0, 4);

  return (
    <div className={cx("nx-metric-grid", className)} role="list" aria-label={ariaLabel}>
      {visible.map((metric) => (
        <div key={metric.id} role="listitem" className="nx-metric-grid__item">
          <MetricCard
            label={metric.label}
            value={metric.value}
            hint={metric.hint}
            tone={metric.tone ?? "neutral"}
            onClick={metric.onSelect}
          />
        </div>
      ))}
    </div>
  );
}

/** Critical / priority attention list with optional alert banner. */
export function AttentionPanel({
  title = "Critical alerts",
  description,
  items,
  emptyTitle = "No critical alerts",
  emptyBody = "Nothing requires immediate attention in your scope.",
  banner,
  className,
  actions
}: {
  title?: ReactNode;
  description?: ReactNode;
  items: CommandCenterListItem[];
  emptyTitle?: string;
  emptyBody?: string;
  banner?: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <CommandSection title={title} description={description} actions={actions} className={cx("nx-attention-panel", className)}>
      {banner}
      <Panel className="nx-attention-panel__panel">
        {items.length === 0 ? (
          <EmptyState title={emptyTitle} body={emptyBody} />
        ) : (
          <ul className="nx-attention-panel__list">
            {items.map((item) => (
              <li key={item.id}>
                <CommandCenterRow item={item} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </CommandSection>
  );
}

/** Resume in-progress work. */
export function ContinueWorking({
  title = "Continue working",
  description = "Pick up where you left off.",
  items,
  emptyTitle = "Nothing in progress",
  emptyBody = "When you start work on a ticket, it will appear here.",
  className,
  actions
}: {
  title?: ReactNode;
  description?: ReactNode;
  items: CommandCenterListItem[];
  emptyTitle?: string;
  emptyBody?: string;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <CommandSection title={title} description={description} actions={actions} className={cx("nx-continue-working", className)}>
      <Panel className="nx-continue-working__panel">
        {items.length === 0 ? (
          <EmptyState title={emptyTitle} body={emptyBody} />
        ) : (
          <ul className="nx-continue-working__list">
            {items.map((item) => (
              <li key={item.id}>
                <CommandCenterRow item={item} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </CommandSection>
  );
}

/** Chronological / recent activity stream. */
export function ActivityFeed({
  title = "Activity",
  description,
  items,
  emptyTitle = "No recent activity",
  emptyBody = "Updates in your scope will appear here.",
  className,
  actions
}: {
  title?: ReactNode;
  description?: ReactNode;
  items: CommandCenterListItem[];
  emptyTitle?: string;
  emptyBody?: string;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <CommandSection title={title} description={description} actions={actions} className={cx("nx-activity-feed", className)}>
      <Panel className="nx-activity-feed__panel">
        {items.length === 0 ? (
          <EmptyState title={emptyTitle} body={emptyBody} />
        ) : (
          <ul className="nx-activity-feed__list">
            {items.map((item) => (
              <li key={item.id}>
                <CommandCenterRow item={item} emphasizeUnread={item.tone === "info"} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </CommandSection>
  );
}

/** Destination queues with counts — not decorative charts. */
export function QueueOverview({
  title = "Team queues",
  description = "Jump to work waiting in each queue.",
  items,
  emptyTitle = "No queues",
  emptyBody = "Queues appear when modules are available for your role.",
  className,
  actions
}: {
  title?: ReactNode;
  description?: ReactNode;
  items: CommandCenterQueueItem[];
  emptyTitle?: string;
  emptyBody?: string;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <CommandSection title={title} description={description} actions={actions} className={cx("nx-queue-overview", className)}>
      {items.length === 0 ? (
        <Panel>
          <EmptyState title={emptyTitle} body={emptyBody} />
        </Panel>
      ) : (
        <div className="nx-queue-overview__grid" role="list">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="listitem"
              className={cx("nx-queue-overview__item", item.tone && `nx-tone-${item.tone}`)}
              onClick={item.onSelect}
              disabled={!item.onSelect}
            >
              <span className="nx-queue-overview__label nx-label">{item.label}</span>
              <strong className="nx-queue-overview__count">{item.count}</strong>
              {item.description ? (
                <span className="nx-queue-overview__description nx-caption nx-text-muted">{item.description}</span>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </CommandSection>
  );
}

/** Compact textual report block (no decorative charts). */
export function ReportSection({
  title = "Reports",
  description,
  columns,
  rows,
  emptyTitle = "No report data",
  emptyBody = "Report rows will appear when data is available.",
  className,
  actions,
  children
}: {
  title?: ReactNode;
  description?: ReactNode;
  columns?: DataTableColumn<CommandCenterReportRow>[];
  rows?: CommandCenterReportRow[];
  emptyTitle?: string;
  emptyBody?: string;
  className?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const defaultColumns: DataTableColumn<CommandCenterReportRow>[] = [
    { id: "primary", header: "Item", cell: (row) => row.primary },
    { id: "secondary", header: "Detail", cell: (row) => row.secondary ?? "—" },
    { id: "meta", header: "Meta", cell: (row) => row.meta ?? "—" }
  ];

  return (
    <CommandSection title={title} description={description} actions={actions} className={cx("nx-report-section", className)}>
      {children}
      {rows ? (
        <Panel className="nx-report-section__panel">
          {rows.length === 0 ? (
            <EmptyState title={emptyTitle} body={emptyBody} />
          ) : (
            <DataTable columns={columns ?? defaultColumns} rows={rows} getRowId={(row) => row.id} />
          )}
        </Panel>
      ) : null}
    </CommandSection>
  );
}

/** Assigned / owned ticket list section. */
export function AssignedTicketsPanel({
  title = "Assigned tickets",
  description = "Work currently owned by you.",
  items,
  emptyTitle = "No assigned tickets",
  emptyBody = "Tickets owned by you will appear here.",
  className,
  actions
}: {
  title?: ReactNode;
  description?: ReactNode;
  items: CommandCenterListItem[];
  emptyTitle?: string;
  emptyBody?: string;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <CommandSection title={title} description={description} actions={actions} className={cx("nx-assigned-tickets", className)}>
      <Panel className="nx-assigned-tickets__panel">
        {items.length === 0 ? (
          <EmptyState title={emptyTitle} body={emptyBody} />
        ) : (
          <ul className="nx-assigned-tickets__list">
            {items.map((item) => (
              <li key={item.id}>
                <CommandCenterRow item={item} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </CommandSection>
  );
}

export function CommandCenterAlertBanner({
  count,
  onOpen
}: {
  count: number;
  onOpen?: () => void;
}) {
  if (count <= 0) {
    return null;
  }

  return (
    <Alert
      tone="danger"
      role="alert"
      title={`${count} critical alert${count === 1 ? "" : "s"}`}
      actions={
        onOpen ? (
          <button type="button" className="secondary-button" onClick={onOpen}>
            Review first alert
          </button>
        ) : undefined
      }
    >
      SLA breaches and critical follow-ups need action before other work.
    </Alert>
  );
}

function CommandCenterRow({
  item,
  emphasizeUnread = false
}: {
  item: CommandCenterListItem;
  emphasizeUnread?: boolean;
}) {
  const interactive = Boolean(item.onSelect);
  const className = cx(
    "nx-command-center-row",
    emphasizeUnread && "is-unread",
    item.tone && `nx-tone-${item.tone}`
  );

  const body = (
    <>
      <span className="nx-command-center-row__main">
        <span className="nx-command-center-row__title nx-body">{item.title}</span>
        {item.summary ? <span className="nx-command-center-row__summary nx-caption nx-text-secondary">{item.summary}</span> : null}
      </span>
      <span className="nx-command-center-row__aside">
        {item.tone === "danger" || item.tone === "warning" ? (
          <StatusBadge tone={item.tone}>{toneLabel(item.tone)}</StatusBadge>
        ) : null}
        {item.meta ? <span className="nx-caption nx-text-muted">{item.meta}</span> : null}
      </span>
    </>
  );

  if (!interactive) {
    return <div className={className}>{body}</div>;
  }

  return (
    <button type="button" className={className} onClick={item.onSelect}>
      {body}
    </button>
  );
}

function toneLabel(tone: Tone): string {
  switch (tone) {
    case "danger":
      return "Critical";
    case "warning":
      return "Watch";
    case "success":
      return "Healthy";
    case "info":
    case "primary":
      return "Update";
    default:
      return "Info";
  }
}

/** Page scaffold for the operational Command Center (no nested PageHeader — shell owns that). */
export function CommandCenterLayout({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Stack gap="lg" className={cx("nx-command-center", className)}>
      {children}
    </Stack>
  );
}

