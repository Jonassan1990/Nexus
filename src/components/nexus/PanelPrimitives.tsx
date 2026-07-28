import type { ReactNode } from "react";
import { EmptyState as DsEmptyState, type DataTableColumn } from "@/design-system";
import { Panel } from "@/design-system/layout";
import { TegelIcon } from "./TegelIcon";
import type { TegelIconName } from "./TegelIcon";

export function PanelHeader({
  title,
  description,
  iconName,
  headingLevel = "h2"
}: {
  title: string;
  description: string;
  iconName: TegelIconName;
  headingLevel?: "h1" | "h2";
}) {
  return (
    <header className="panel-header">
      <div className="panel-icon">
        <TegelIcon name={iconName} size="20px" />
      </div>
      <div>
        {headingLevel === "h1" ? <h1 className="nx-h1">{title}</h1> : <h2 className="nx-h2">{title}</h2>}
        <p className="nx-body nx-text-secondary">{description}</p>
      </div>
    </header>
  );
}

/** Compatibility wrapper — prefer importing EmptyState from `@/design-system`. */
export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <DsEmptyState
      title={title}
      body={body}
      icon={<TegelIcon name="info" size="20px" />}
    />
  );
}

/** Shared empty / restricted workspace panel shell. */
export function WorkspacePanel({
  children,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby
}: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  return (
    <Panel className={className} aria-label={ariaLabel} aria-labelledby={ariaLabelledby}>
      {children}
    </Panel>
  );
}

export type { DataTableColumn };
