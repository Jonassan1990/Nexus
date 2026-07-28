import type { ReactNode } from "react";
import { cx, type Density } from "../shared";
import { Content, Page, PageHeader, Section, Toolbar } from "../layout";
import { ActionBar, Alert } from "../primitives";
import { CommandBar, DashboardSection, FormSection, SplitView, TableSection } from "../patterns";

type TemplateChrome = {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  density?: Density;
  className?: string;
  children?: ReactNode;
};

function TemplateShell({
  title,
  description,
  eyebrow,
  icon,
  actions,
  toolbar,
  density,
  className,
  children
}: TemplateChrome) {
  return (
    <Page density={density} className={cx("nx-template", className)}>
      <PageHeader title={title} description={description} eyebrow={eyebrow} icon={icon} actions={actions} />
      {toolbar ? <Toolbar>{toolbar}</Toolbar> : null}
      <Content>{children}</Content>
    </Page>
  );
}

/** KPI / overview page scaffold. */
export function DashboardTemplate({
  metrics,
  primary,
  secondary,
  ...chrome
}: TemplateChrome & {
  metrics?: ReactNode;
  primary?: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <TemplateShell {...chrome} className={cx("nx-template-dashboard", chrome.className)}>
      {metrics ? <DashboardSection className="nx-template-dashboard__metrics">{metrics}</DashboardSection> : null}
      {primary || secondary ? (
        <div className="nx-template-dashboard__grid">
          {primary ? <div className="nx-template-dashboard__primary">{primary}</div> : null}
          {secondary ? <aside className="nx-template-dashboard__secondary">{secondary}</aside> : null}
        </div>
      ) : null}
      {chrome.children}
    </TemplateShell>
  );
}

/** Searchable / filterable list page. */
export function ListTemplate({
  filters,
  table,
  ...chrome
}: TemplateChrome & {
  filters?: ReactNode;
  table: ReactNode;
}) {
  return (
    <TemplateShell {...chrome} className={cx("nx-template-list", chrome.className)}>
      <TableSection filters={filters}>{table}</TableSection>
      {chrome.children}
    </TemplateShell>
  );
}

/** Master–detail / inspector page. */
export function DetailsTemplate({
  summary,
  detail,
  inspector,
  ...chrome
}: TemplateChrome & {
  summary?: ReactNode;
  detail: ReactNode;
  inspector?: ReactNode;
}) {
  return (
    <TemplateShell {...chrome} className={cx("nx-template-details", chrome.className)}>
      {summary}
      {inspector ? <SplitView primary={detail} secondary={inspector} /> : detail}
      {chrome.children}
    </TemplateShell>
  );
}

/** Create / edit CRUD form page. */
export function CrudTemplate({
  form,
  footer,
  notice,
  ...chrome
}: TemplateChrome & {
  form: ReactNode;
  footer?: ReactNode;
  notice?: ReactNode;
}) {
  return (
    <TemplateShell {...chrome} className={cx("nx-template-crud", chrome.className)}>
      {notice}
      <FormSection>{form}</FormSection>
      {footer ? <ActionBar>{footer}</ActionBar> : null}
      {chrome.children}
    </TemplateShell>
  );
}

/** Settings / configuration page with optional side nav. */
export function SettingsTemplate({
  nav,
  sections,
  ...chrome
}: TemplateChrome & {
  nav?: ReactNode;
  sections: ReactNode;
}) {
  return (
    <TemplateShell {...chrome} className={cx("nx-template-settings", chrome.className)}>
      {nav ? <SplitView primary={sections} secondary={nav} secondaryWidth="240px" /> : sections}
      {chrome.children}
    </TemplateShell>
  );
}

/** Multi-step wizard scaffold. */
export function WizardTemplate({
  steps,
  stepLabel,
  body,
  footer,
  ...chrome
}: TemplateChrome & {
  steps?: ReactNode;
  stepLabel?: ReactNode;
  body: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <TemplateShell {...chrome} className={cx("nx-template-wizard", chrome.className)}>
      {steps ? <nav className="nx-template-wizard__steps" aria-label="Wizard steps">{steps}</nav> : null}
      {stepLabel ? <p className="nx-label">{stepLabel}</p> : null}
      <Section>{body}</Section>
      {footer ? <ActionBar>{footer}</ActionBar> : null}
      {chrome.children}
    </TemplateShell>
  );
}

/** Analytics / report page with command bar. */
export function ReportTemplate({
  filters,
  summary,
  charts,
  table,
  ...chrome
}: TemplateChrome & {
  filters?: ReactNode;
  summary?: ReactNode;
  charts?: ReactNode;
  table?: ReactNode;
}) {
  return (
    <TemplateShell
      {...chrome}
      toolbar={filters ? <CommandBar aria-label="Report filters">{filters}</CommandBar> : chrome.toolbar}
      className={cx("nx-template-report", chrome.className)}
    >
      {summary}
      {charts ? <DashboardSection title="Charts">{charts}</DashboardSection> : null}
      {table ? <TableSection title="Data">{table}</TableSection> : null}
      {chrome.children}
    </TemplateShell>
  );
}

export function TemplateNotice({
  children,
  tone = "info"
}: {
  children: ReactNode;
  tone?: "info" | "success" | "warning" | "danger";
}) {
  return <Alert tone={tone}>{children}</Alert>;
}
