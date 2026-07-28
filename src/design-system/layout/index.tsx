import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

type Density = "compact" | "comfortable" | "relaxed";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type BoxProps = {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  id?: string;
  role?: HTMLAttributes<HTMLElement>["role"];
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

/** Page shell — wraps module content inside workspace-main. */
export function Page({
  children,
  className,
  density,
  ...rest
}: BoxProps & { density?: Density }) {
  return (
    <div
      className={cx("nx-page", density ? `nx-density-${density}` : null, className)}
      data-density={density}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Standard page header — title, description, optional actions. */
export function PageHeader({
  title,
  description,
  eyebrow,
  icon,
  actions,
  children,
  className,
  as: Tag = "header"
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  as?: "header" | "section" | "div";
}) {
  return (
    <Tag className={cx("nx-page-header", "module-header", className)}>
      <div className="nx-page-header__main">
        {eyebrow ? <span className="nx-page-header__eyebrow nx-label">{eyebrow}</span> : null}
        <div className="nx-page-header__title-row module-title-row">
          {icon}
          <h1 className="nx-h1">{title}</h1>
        </div>
        {description ? <p className="nx-body nx-text-secondary">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="nx-page-header__actions module-actions">{actions}</div> : null}
    </Tag>
  );
}

/** Filter / action toolbar under the page header. */
export function Toolbar({ children, className, ...rest }: BoxProps) {
  return (
    <div className={cx("nx-toolbar", className)} role="toolbar" {...rest}>
      {children}
    </div>
  );
}

/** Primary scrollable content region. */
export function Content({ children, className, ...rest }: BoxProps) {
  return (
    <div className={cx("nx-content", className)} {...rest}>
      {children}
    </div>
  );
}

/** Section with optional title — one job per section. */
export function Section({
  children,
  className,
  title,
  description,
  actions,
  ...rest
}: BoxProps & { title?: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cx("nx-section", className)} {...rest}>
      {title || description || actions ? (
        <div className="nx-section__header">
          <div className="nx-section__copy">
            {title ? <h2 className="nx-h2">{title}</h2> : null}
            {description ? <p className="nx-body nx-text-secondary">{description}</p> : null}
          </div>
          {actions ? <div className="nx-section__actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Bordered surface panel — structural elevation only. */
export function Panel({
  children,
  className,
  as: Tag = "section",
  ...rest
}: BoxProps & { as?: "section" | "div" | "article" | "aside" }) {
  return (
    <Tag className={cx("nx-panel", "panel", className)} {...rest}>
      {children}
    </Tag>
  );
}

/** Compact nav / filter block for secondary sidebars. */
export function SidebarSection({
  children,
  className,
  title,
  ...rest
}: BoxProps & { title?: ReactNode }) {
  return (
    <aside className={cx("nx-sidebar-section", className)} {...rest}>
      {title ? <h2 className="nx-title">{title}</h2> : null}
      {children}
    </aside>
  );
}

/** Vertical stack — 8px grid gaps. */
export function Stack({
  children,
  className,
  gap = "md",
  ...rest
}: BoxProps & { gap?: "xs" | "sm" | "md" | "lg" | "xl" }) {
  return (
    <div className={cx("nx-stack", `nx-stack--${gap}`, className)} {...rest}>
      {children}
    </div>
  );
}

/** Horizontal wrapping cluster. */
export function Cluster({
  children,
  className,
  gap = "sm",
  align = "center",
  ...rest
}: BoxProps & { gap?: "xs" | "sm" | "md" | "lg"; align?: "start" | "center" | "end" | "stretch" }) {
  return (
    <div className={cx("nx-cluster", `nx-cluster--${gap}`, `nx-cluster--align-${align}`, className)} {...rest}>
      {children}
    </div>
  );
}
