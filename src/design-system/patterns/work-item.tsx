import type { ReactNode } from "react";
import { cx, type Tone } from "../shared";
import { Panel, Stack, Cluster, Section } from "../layout";
import {
  EmptyState,
  SearchBox,
  StatusBadge
} from "../primitives";
import type {
  WorkItemActivityEvent,
  WorkItemAssignee,
  WorkItemComment,
  WorkItemFacet,
  WorkItemSortOption,
  WorkItemTab,
  WorkItemTimelineStep
} from "@/features/work-management/types";

/** List workspace shell — filters + optional toolbar + table/board slot. */
export function WorkItemList({
  title,
  description,
  filters,
  toolbar,
  children,
  empty,
  className,
  "aria-label": ariaLabel = "Work items"
}: {
  title?: ReactNode;
  description?: ReactNode;
  filters?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  empty?: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div className={cx("nx-work-item-list", "ticket-list-workspace", className)} aria-label={ariaLabel}>
      {toolbar}
      {filters}
      {title || description ? (
        <Section title={title} description={description} className="nx-work-item-list__table">
          <Panel className="nx-work-item-list__panel">{children ?? empty}</Panel>
        </Section>
      ) : (
        (children ?? empty)
      )}
    </div>
  );
}

/** Detail chrome — hero, badges, tabs, body. */
export function WorkItemDetails({
  itemKey,
  title,
  summary,
  badges,
  actions,
  tabs,
  activeTabId,
  onTabChange,
  children,
  className,
  "aria-label": ariaLabel
}: {
  itemKey: ReactNode;
  title: ReactNode;
  summary?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  tabs: WorkItemTab[];
  activeTabId: string;
  onTabChange: (tabId: string) => void;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <section
      className={cx("nx-work-item-details", "panel", "ticket-detail", className)}
      aria-label={ariaLabel ?? (typeof title === "string" ? title : "Work item details")}
    >
      <div className="nx-work-item-details__hero ticket-hero">
        <div>
          <span className="nx-work-item-details__key ticket-key">{itemKey}</span>
          <h2 className="nx-h2">{title}</h2>
          {summary ? <div className="nx-work-item-details__summary">{summary}</div> : null}
        </div>
        <div className="nx-work-item-details__actions ticket-hero-actions">
          {badges ? (
            <div className="ticket-badges" aria-label="Status">
              {badges}
            </div>
          ) : null}
          {actions}
        </div>
      </div>

      <div className="nx-work-item-details__tabs tabs tab-row" role="tablist" aria-label="Work item sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`work-item-tab-${tab.id}`}
            aria-selected={activeTabId === tab.id}
            aria-controls={`work-item-tabpanel-${tab.id}`}
            className={cx("tab-button", activeTabId === tab.id && "is-active")}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className="nx-work-item-details__panel"
        role="tabpanel"
        id={`work-item-tabpanel-${activeTabId}`}
        aria-labelledby={`work-item-tab-${activeTabId}`}
      >
        {children}
      </div>
    </section>
  );
}

/** Back / context toolbar for detail mode. */
export function WorkItemToolbar({
  onBack,
  backLabel = "Back to list",
  context,
  actions,
  className
}: {
  onBack?: () => void;
  backLabel?: string;
  context?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("nx-work-item-toolbar", "ticket-detail-toolbar", className)} role="toolbar" aria-label="Work item toolbar">
      <Cluster gap="sm" align="center">
        {onBack ? (
          <button className="secondary-button" type="button" onClick={onBack}>
            {backLabel}
          </button>
        ) : null}
        {context ? <span className="nx-body nx-text-secondary">{context}</span> : null}
      </Cluster>
      {actions ? <Cluster gap="sm">{actions}</Cluster> : null}
    </div>
  );
}

/** Search + facets + sort + mine toggle — consumes WorkspaceSearch at the call site. */
export function WorkItemFilters({
  title = "Find work items",
  description,
  query,
  onQueryChange,
  queryPlaceholder = "Search key, title, product…",
  facets,
  sortBy,
  sortOptions,
  onSortChange,
  mineOnly,
  mineOnlyLabel = "Only my items",
  onMineOnlyChange,
  onReset,
  className
}: {
  title?: ReactNode;
  description?: ReactNode;
  query: string;
  onQueryChange: (query: string) => void;
  queryPlaceholder?: string;
  facets: WorkItemFacet[];
  sortBy?: string;
  sortOptions?: WorkItemSortOption[];
  onSortChange?: (value: string) => void;
  mineOnly?: boolean;
  mineOnlyLabel?: string;
  onMineOnlyChange?: (value: boolean) => void;
  onReset?: () => void;
  className?: string;
}) {
  return (
    <section
      className={cx("nx-work-item-filters", "ticket-list-filter-card", className)}
      aria-labelledby="work-item-filters-title"
    >
      <div className="ticket-list-filter-heading">
        <h2 id="work-item-filters-title" className="nx-h2">
          {title}
        </h2>
        {description ? <p className="nx-body nx-text-secondary">{description}</p> : null}
      </div>

      <div className="nx-work-item-filters__bar ticket-list-filters-grid" role="search" aria-label="Work item filters">
        <div className="ticket-list-field">
          <span>Search</span>
          <SearchBox
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={queryPlaceholder}
            aria-label="Search work items"
          />
        </div>

        {facets.map((facet) => (
          <label className="ticket-list-field" key={facet.id}>
            <span>{facet.label}</span>
            <select
              value={facet.value}
              onChange={(event) => facet.onChange(event.target.value)}
              aria-label={facet.label}
            >
              {facet.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}

        {sortOptions && onSortChange ? (
          <label className="ticket-list-field">
            <span>Sort</span>
            <select value={sortBy} onChange={(event) => onSortChange(event.target.value)} aria-label="Sort work items">
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {onMineOnlyChange ? (
          <div className="ticket-list-field ticket-list-field--toggle">
            <span>{mineOnlyLabel}</span>
            <button
              type="button"
              className={cx("secondary-button", mineOnly && "is-active")}
              aria-pressed={mineOnly}
              onClick={() => onMineOnlyChange(!mineOnly)}
            >
              {mineOnly ? "On" : "Off"}
            </button>
          </div>
        ) : null}

        {onReset ? (
          <div className="ticket-list-field ticket-list-field--actions">
            <span className="sr-only">Reset</span>
            <button type="button" className="secondary-button" onClick={onReset}>
              Reset filters
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Optional inspector column for metadata / ownership. */
export function WorkItemInspector({
  title = "Inspector",
  description,
  children,
  actions,
  onClose,
  className
}: {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  return (
    <Panel
      className={cx("nx-work-item-inspector", "nx-inspector-panel", className)}
      aria-label={typeof title === "string" ? title : "Inspector"}
    >
      <div className="nx-inspector-panel__header">
        <div>
          <h2 className="nx-h2">{title}</h2>
          {description ? <p className="nx-body nx-text-secondary">{description}</p> : null}
        </div>
        <Cluster gap="sm">
          {actions}
          {onClose ? (
            <button type="button" className="secondary-button nx-touch" onClick={onClose}>
              Close
            </button>
          ) : null}
        </Cluster>
      </div>
      <div className="nx-inspector-panel__body">{children}</div>
    </Panel>
  );
}

/** Ordered process / lifecycle steps. */
export function WorkItemTimeline({
  title = "Timeline",
  steps,
  emptyTitle = "No timeline",
  emptyBody = "Lifecycle steps will appear here.",
  className
}: {
  title?: ReactNode;
  steps: WorkItemTimelineStep[];
  emptyTitle?: string;
  emptyBody?: string;
  className?: string;
}) {
  return (
    <Section title={title} className={cx("nx-work-item-timeline", className)}>
      {steps.length === 0 ? (
        <EmptyState title={emptyTitle} body={emptyBody} />
      ) : (
        <ol className="nx-work-item-timeline__list">
          {steps.map((step) => (
            <li key={step.id} className={cx("nx-work-item-timeline__step", `is-${step.state}`)}>
              <StatusBadge tone={timelineTone(step.state)}>{step.state}</StatusBadge>
              <div>
                <strong className="nx-body">{step.label}</strong>
                {step.detail ? <p className="nx-caption nx-text-muted">{step.detail}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

/** Compact status progression (alias surface for StatusTimeline). */
export function StatusTimeline({
  steps,
  className
}: {
  steps: WorkItemTimelineStep[];
  className?: string;
}) {
  return (
    <div className={cx("nx-status-timeline", "ticket-lifecycle-strip", className)} aria-label="Status timeline">
      <ol className="nx-status-timeline__list">
        {steps.map((step) => (
          <li key={step.id} className={cx("nx-status-timeline__item", `is-${step.state}`)}>
            <span className="nx-caption">{step.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Audit / system activity feed for a work item. */
export function WorkItemActivity({
  title = "Activity",
  events,
  emptyTitle = "No activity",
  emptyBody = "Updates will appear here.",
  className
}: {
  title?: ReactNode;
  events: WorkItemActivityEvent[];
  emptyTitle?: string;
  emptyBody?: string;
  className?: string;
}) {
  return (
    <Section title={title} className={cx("nx-work-item-activity", className)}>
      {events.length === 0 ? (
        <EmptyState title={emptyTitle} body={emptyBody} />
      ) : (
        <ul className="nx-work-item-activity__list">
          {events.map((event) => (
            <li key={event.id} className="nx-work-item-activity__item">
              <div>
                <strong className="nx-body">{event.title}</strong>
                {event.detail ? <p className="nx-caption nx-text-secondary">{event.detail}</p> : null}
              </div>
              <div className="nx-work-item-activity__meta">
                {event.actor ? <span className="nx-caption">{event.actor}</span> : null}
                {event.at ? <time className="nx-caption nx-text-muted">{event.at}</time> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Comment thread + composer slot. */
export function WorkItemComments({
  title = "Comments",
  comments,
  emptyTitle = "No comments",
  emptyBody = "Start the discussion.",
  composer,
  className
}: {
  title?: ReactNode;
  comments: WorkItemComment[];
  emptyTitle?: string;
  emptyBody?: string;
  composer?: ReactNode;
  className?: string;
}) {
  return (
    <Section title={title} className={cx("nx-work-item-comments", className)}>
      {comments.length === 0 ? (
        <EmptyState title={emptyTitle} body={emptyBody} />
      ) : (
        <ul className="nx-work-item-comments__list">
          {comments.map((comment) => (
            <li key={comment.id} className="nx-work-item-comments__item">
              <div className="nx-work-item-comments__header">
                <strong className="nx-body">{comment.author}</strong>
                <time className="nx-caption nx-text-muted">{comment.createdAt}</time>
                {comment.visibility ? (
                  <StatusBadge tone="neutral">{comment.visibility}</StatusBadge>
                ) : null}
              </div>
              <p className="nx-body">{comment.body}</p>
            </li>
          ))}
        </ul>
      )}
      {composer ? <div className="nx-work-item-comments__composer">{composer}</div> : null}
    </Section>
  );
}

/** Ownership / assignee panel — reusable across work item types. */
export function AssignmentPanel({
  title = "Assignment",
  owner,
  submitter,
  participants,
  emptyTitle = "Unassigned",
  emptyBody = "No owner is set for this work item.",
  actions,
  className
}: {
  title?: ReactNode;
  owner?: WorkItemAssignee;
  submitter?: WorkItemAssignee;
  participants?: WorkItemAssignee[];
  emptyTitle?: string;
  emptyBody?: string;
  actions?: ReactNode;
  className?: string;
}) {
  const hasPeople = Boolean(owner || submitter || (participants && participants.length > 0));

  return (
    <Panel className={cx("nx-assignment-panel", className)} aria-label={typeof title === "string" ? title : "Assignment"}>
      <div className="nx-assignment-panel__header">
        <h3 className="nx-title">{title}</h3>
        {actions}
      </div>
      {!hasPeople ? (
        <EmptyState title={emptyTitle} body={emptyBody} />
      ) : (
        <dl className="nx-assignment-panel__list">
          {owner ? (
            <div>
              <dt>Owner</dt>
              <dd>
                {owner.name}
                {owner.role ? <span className="nx-caption nx-text-muted"> · {owner.role}</span> : null}
              </dd>
            </div>
          ) : null}
          {submitter ? (
            <div>
              <dt>Submitter</dt>
              <dd>{submitter.name}</dd>
            </div>
          ) : null}
          {participants?.map((person) => (
            <div key={`${person.name}-${person.role ?? ""}`}>
              <dt>{person.role ?? "Participant"}</dt>
              <dd>{person.name}</dd>
            </div>
          ))}
        </dl>
      )}
    </Panel>
  );
}

/** Master–detail helper when inspector is present. */
export function WorkItemSplitWorkspace({
  list,
  detail,
  inspector,
  className
}: {
  list: ReactNode;
  detail?: ReactNode;
  inspector?: ReactNode;
  className?: string;
}) {
  if (!detail) {
    return <div className={className}>{list}</div>;
  }

  if (inspector) {
    return (
      <div className={cx("nx-work-item-split", "nx-split-view", className)}>
        <div className="nx-split-view__primary">
          <Stack gap="md">{detail}</Stack>
        </div>
        <aside className="nx-split-view__secondary">{inspector}</aside>
      </div>
    );
  }

  return <div className={cx("nx-work-item-split", className)}>{detail}</div>;
}

export function WorkItemPriorityBadge({
  priority
}: {
  priority?: string;
}) {
  if (!priority) {
    return null;
  }

  const tone: Tone =
    priority === "Critical" || priority === "High"
      ? "danger"
      : priority === "Medium"
        ? "warning"
        : "neutral";

  return <StatusBadge tone={tone}>{priority}</StatusBadge>;
}

export function WorkItemStatusBadge({
  label,
  tone = "neutral"
}: {
  label: ReactNode;
  tone?: Tone;
}) {
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}

function timelineTone(state: WorkItemTimelineStep["state"]): Tone {
  switch (state) {
    case "complete":
      return "success";
    case "active":
      return "info";
    case "blocked":
    case "rejected":
      return "danger";
    case "optional":
      return "neutral";
    default:
      return "warning";
  }
}
