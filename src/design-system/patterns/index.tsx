import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../shared";
import { Content, PageHeader, Panel, Section, SidebarSection, Stack, Cluster, Toolbar } from "../layout";
import { ActionBar, EmptyState, FilterBar } from "../primitives";

export function DashboardSection({
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
    <Section title={title} description={description} actions={actions} className={cx("nx-dashboard-section", className)}>
      {children}
    </Section>
  );
}

export function TableSection({
  title,
  description,
  filters,
  actions,
  children,
  className
}: {
  title?: ReactNode;
  description?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Section title={title} description={description} actions={actions} className={cx("nx-table-section", className)}>
      {filters ? <FilterBar>{filters}</FilterBar> : null}
      <Panel className="nx-table-section__panel">{children}</Panel>
    </Section>
  );
}

export function FormSection({
  title,
  description,
  children,
  actions,
  className
}: {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <Section title={title} description={description} className={cx("nx-form-section", className)}>
      <div className="nx-form-section__fields">{children}</div>
      {actions ? <ActionBar>{actions}</ActionBar> : null}
    </Section>
  );
}

export function SplitView({
  primary,
  secondary,
  className,
  secondaryWidth = "360px"
}: {
  primary: ReactNode;
  secondary: ReactNode;
  className?: string;
  secondaryWidth?: string;
}) {
  return (
    <div className={cx("nx-split-view", className)} style={{ ["--nx-split-secondary" as string]: secondaryWidth }}>
      <div className="nx-split-view__primary">{primary}</div>
      <aside className="nx-split-view__secondary">{secondary}</aside>
    </div>
  );
}

export function InspectorPanel({
  title,
  description,
  children,
  actions,
  className,
  onClose
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  onClose?: () => void;
}) {
  return (
    <Panel className={cx("nx-inspector-panel", className)} aria-label={typeof title === "string" ? title : "Inspector"}>
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

export function CommandBar({
  children,
  className,
  "aria-label": ariaLabel = "Command bar"
}: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <Toolbar className={cx("nx-command-bar", className)} aria-label={ariaLabel}>
      {children}
    </Toolbar>
  );
}

export function SidebarGroup({
  title,
  children,
  className
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <SidebarSection title={title} className={cx("nx-sidebar-group", className)}>
      <nav className="nx-sidebar-group__nav">{children}</nav>
    </SidebarSection>
  );
}

export function SidebarHeader({
  title,
  description,
  actions,
  className
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("nx-sidebar-header", className)}>
      <div>
        <h2 className="nx-title">{title}</h2>
        {description ? <p className="nx-caption nx-text-muted">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function SidebarItem({
  children,
  active = false,
  leading,
  trailing,
  className,
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cx("nx-sidebar-item", active && "is-active", className)}
      aria-current={active ? "page" : undefined}
      {...buttonProps}
    >
      {leading ? <span className="nx-sidebar-item__leading">{leading}</span> : null}
      <span className="nx-sidebar-item__label">{children}</span>
      {trailing ? <span className="nx-sidebar-item__trailing">{trailing}</span> : null}
    </button>
  );
}

export function QuickActions({
  title = "Quick actions",
  children,
  className
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Panel className={cx("nx-quick-actions", className)} aria-label={typeof title === "string" ? title : "Quick actions"}>
      <h2 className="nx-title">{title}</h2>
      <Cluster gap="sm">{children}</Cluster>
    </Panel>
  );
}

export function RecentItems({
  title = "Recent",
  items,
  empty,
  className,
  onSelect
}: {
  title?: ReactNode;
  items: Array<{ id: string; label: ReactNode; meta?: ReactNode }>;
  empty?: ReactNode;
  className?: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <Panel className={cx("nx-recent-items", className)} aria-label={typeof title === "string" ? title : "Recent items"}>
      <h2 className="nx-title">{title}</h2>
      {!items.length ? (
        empty ?? <EmptyState title="No recent items" />
      ) : (
        <ul className="nx-recent-items__list">
          {items.map((item) => (
            <li key={item.id}>
              <button type="button" className="nx-recent-items__item" onClick={() => onSelect?.(item.id)}>
                <span className="nx-body">{item.label}</span>
                {item.meta ? <span className="nx-caption nx-text-muted">{item.meta}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export { Content, PageHeader, Stack };
