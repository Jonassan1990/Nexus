"use client";

import type { ReactNode } from "react";
import { ActionBar, Cluster } from "@/design-system";
import { cx } from "@/design-system/shared";

export type BulkAction = {
  id: string;
  label: ReactNode;
  onSelect: () => void;
  tone?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  icon?: ReactNode;
};

/**
 * BulkActionBar — reusable multi-select action chrome.
 * Admin (and future Tickets) must consume this instead of bespoke toolbars.
 */
export function BulkActionBar({
  selectedCount,
  summary,
  helperText,
  actions,
  className,
  "aria-label": ariaLabel = "Bulk actions"
}: {
  selectedCount: number;
  summary: ReactNode;
  helperText?: ReactNode;
  actions: BulkAction[];
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <ActionBar
      className={cx("nx-bulk-action-bar", "admin-user-selection-toolbar", className)}
      aria-label={ariaLabel}
      align="between"
    >
      <div className="admin-user-selection-summary">
        <strong>{summary}</strong>
        {helperText ? <span>{helperText}</span> : null}
        <span className="sr-only">{selectedCount} selected</span>
      </div>
      <Cluster gap="sm" className="admin-user-selection-actions">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={cx(
              action.tone === "primary" ? "primary-button" : "secondary-button",
              action.tone === "danger" && "danger-button",
              action.tone === "danger" && action.id === "delete" && "hard-delete-button"
            )}
            disabled={action.disabled}
            onClick={action.onSelect}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </Cluster>
    </ActionBar>
  );
}
