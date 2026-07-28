import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TableHTMLAttributes
} from "react";
import { forwardRef } from "react";
import { cx, type TicketStatusTone, type Tone } from "../shared";
import { Toolbar } from "../layout";

type CommonProps = {
  children?: ReactNode;
  className?: string;
};

/** Flat enterprise surface — borders define structure, no decorative shadow. */
export function Card({
  children,
  className,
  interactive = false,
  ...rest
}: CommonProps & {
  interactive?: boolean;
  "aria-label"?: string;
}) {
  return (
    <div
      className={cx("nx-card", interactive && "nx-card--interactive", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  className,
  href,
  onClick
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  className?: string;
  href?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="nx-metric-card__topline">
        <span className="nx-label">{label}</span>
        {icon}
      </div>
      <strong className="nx-metric-card__value">{value}</strong>
      {hint ? <p className="nx-caption nx-text-muted">{hint}</p> : null}
    </>
  );

  const classes = cx("nx-metric-card", "metric-card", `nx-tone-${tone}`, className);

  if (href) {
    return (
      <a className={classes} href={href}>
        {content}
      </a>
    );
  }

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={classes}>{content}</div>;
}

export function Stat({
  label,
  value,
  trend,
  className
}: {
  label: ReactNode;
  value: ReactNode;
  trend?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("nx-stat", className)}>
      <span className="nx-stat__label nx-caption">{label}</span>
      <strong className="nx-stat__value">{value}</strong>
      {trend ? <span className="nx-stat__trend nx-small">{trend}</span> : null}
    </div>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
  ticketStatus,
  className
}: {
  children: ReactNode;
  tone?: Tone;
  ticketStatus?: TicketStatusTone;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "nx-status-badge",
        ticketStatus ? `ticket-status-${ticketStatus}` : `nx-tone-${tone}`,
        className
      )}
    >
      {children}
    </span>
  );
}

export function Alert({
  title,
  children,
  tone = "info",
  className,
  actions,
  role = "status"
}: {
  title?: ReactNode;
  children?: ReactNode;
  tone?: Tone;
  className?: string;
  actions?: ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <div className={cx("nx-alert", `nx-tone-${tone}`, className)} role={role}>
      <div className="nx-alert__body">
        {title ? <strong className="nx-title">{title}</strong> : null}
        {children ? <div className="nx-body">{children}</div> : null}
      </div>
      {actions ? <div className="nx-alert__actions">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  icon,
  actions,
  className
}: {
  title: ReactNode;
  body?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("nx-empty-state", "empty-state", "tegel-empty-state", className)} role="status">
      {icon ? (
        <span className="nx-empty-state__icon tegel-empty-state-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div className="nx-empty-state__copy tegel-empty-state-copy">
        <strong className="nx-title">{title}</strong>
        {body ? <p className="nx-body nx-text-secondary">{body}</p> : null}
        {actions ? <div className="nx-empty-state__actions">{actions}</div> : null}
      </div>
    </div>
  );
}

export function LoadingState({
  label = "Loading…",
  className
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cx("nx-loading-state", className)} role="status" aria-live="polite" aria-busy="true">
      <span className="nx-skeleton nx-skeleton--circle" aria-hidden="true" />
      <span className="nx-body">{label}</span>
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  body,
  actions,
  className
}: {
  title?: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <Alert tone="danger" role="alert" title={title} className={cx("nx-error-state", className)} actions={actions}>
      {body}
    </Alert>
  );
}

export function Skeleton({
  width,
  height,
  variant = "text",
  className,
  "aria-label": ariaLabel = "Loading"
}: {
  width?: string | number;
  height?: string | number;
  variant?: "text" | "title" | "block" | "circle";
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <span
      className={cx("nx-skeleton", `nx-skeleton--${variant}`, className)}
      style={{ width, height }}
      role="status"
      aria-label={ariaLabel}
      aria-busy="true"
    />
  );
}

export const SearchBox = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & {
    leading?: ReactNode;
    inputClassName?: string;
  }
>(function SearchBox({ className, inputClassName, leading, ...inputProps }, ref) {
  return (
    <label className={cx("nx-search-box", "search-box", className)}>
      {leading ? <span className="nx-search-box__leading" aria-hidden="true">{leading}</span> : null}
      <input
        ref={ref}
        className={cx("nx-search-box__input", inputClassName)}
        type="search"
        {...inputProps}
      />
    </label>
  );
});

export function FilterBar({
  children,
  className,
  "aria-label": ariaLabel = "Filters"
}: CommonProps & { "aria-label"?: string }) {
  return (
    <Toolbar className={cx("nx-filter-bar", className)} aria-label={ariaLabel}>
      {children}
    </Toolbar>
  );
}

export function ActionBar({
  children,
  className,
  align = "end",
  "aria-label": ariaLabel = "Actions"
}: CommonProps & {
  align?: "start" | "center" | "end" | "between";
  "aria-label"?: string;
}) {
  return (
    <div
      className={cx("nx-action-bar", `nx-action-bar--${align}`, className)}
      role="group"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}

export type DataTableColumn<T> = {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "start" | "center" | "end";
  width?: string | number;
};

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  empty,
  caption,
  className,
  stickyHeader = true,
  onRowClick,
  ...tableProps
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T, index: number) => string;
  empty?: ReactNode;
  caption?: ReactNode;
  className?: string;
  stickyHeader?: boolean;
  onRowClick?: (row: T) => void;
} & Omit<TableHTMLAttributes<HTMLTableElement>, "children">) {
  if (!rows.length) {
    return <>{empty ?? <EmptyState title="No rows" body="No data matches the current filters." />}</>;
  }

  return (
    <div className={cx("nx-data-table-wrap", className)}>
      <table className={cx("nx-data-table", stickyHeader && "nx-data-table--sticky")} {...tableProps}>
        {caption ? <caption className="nx-caption">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className={cx(column.align && `nx-align-text-${column.align}`)}
                style={column.width ? { width: column.width } : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const id = getRowId(row, index);
            return (
              <tr
                key={id}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                className={onRowClick ? "nx-data-table__row--interactive" : undefined}
              >
                {columns.map((column) => (
                  <td key={column.id} className={cx(column.align && `nx-align-text-${column.align}`)}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function FilterChip({
  children,
  active = false,
  count,
  className,
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  count?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cx("nx-filter-chip", active && "is-active", className)}
      aria-pressed={active}
      {...buttonProps}
    >
      <span>{children}</span>
      {count !== undefined ? <strong>{count}</strong> : null}
    </button>
  );
}
