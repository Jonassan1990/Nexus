"use client";

import { useRef } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { TegelIcon, type TegelIconName } from "./TegelIcon";

export type PortalNavItem<TModule extends string = string> = {
  key: TModule;
  label: string;
  iconName: TegelIconName;
};

export function PortalSidebar<TModule extends string>({
  activeModule,
  attentionCounts,
  items,
  isCompact,
  isMounted,
  onClose,
  onCollapse,
  onExpand,
  onSelectModule
}: {
  activeModule: TModule;
  attentionCounts: Partial<Record<TModule, number>>;
  items: readonly PortalNavItem<TModule>[];
  isCompact: boolean;
  isMounted: boolean;
  onClose: () => void;
  onCollapse: () => void;
  onExpand: () => void;
  onSelectModule: (module: TModule) => void;
}) {
  const hoverExpandLockedRef = useRef(false);
  const railWidthPx = isCompact ? 56 : 272;
  const { t } = useLocale();
  const moduleLabels = t.modules as Record<string, string>;

  if (!isMounted) {
    return <aside className="tegel-side-fallback" aria-hidden="true" />;
  }

  function expandSideNavigation() {
    if (hoverExpandLockedRef.current || !isCompact) {
      return;
    }

    onExpand();
  }

  function collapseSideNavigation() {
    hoverExpandLockedRef.current = true;
    onCollapse();
    onClose();
  }

  function toggleSideNavigation() {
    if (isCompact) {
      hoverExpandLockedRef.current = false;
      onExpand();
      return;
    }

    collapseSideNavigation();
  }

  return (
    <aside
      className={`tegel-side-shell ${isCompact ? "is-compact" : "is-expanded"}`}
      aria-label="Primary navigation"
      onMouseEnter={expandSideNavigation}
      onMouseLeave={() => {
        hoverExpandLockedRef.current = false;
      }}
      style={{
        width: railWidthPx,
        maxWidth: railWidthPx,
        minWidth: 0
      }}
    >
      <nav className="tegel-side-menu" aria-label="Modules">
        {items.map((item) => {
          const attentionCount = attentionCounts[item.key] ?? 0;
          const isSelected = activeModule === item.key;
          const label = moduleLabels[item.key] ?? item.label;
          const navButtonLabel = isCompact
            ? `${label}${attentionCount > 0 ? `, ${attentionCount} item${attentionCount === 1 ? "" : "s"} need attention` : ""}`
            : undefined;

          return (
            <button
              key={item.key}
              className={`tegel-side-menu-button${isSelected ? " is-selected" : ""}`}
              aria-current={isSelected ? "page" : undefined}
              aria-label={navButtonLabel}
              onClick={() => {
                onSelectModule(item.key);
                onClose();
              }}
              title={isCompact ? label : undefined}
              type="button"
            >
              <TegelIcon name={item.iconName} />
              <span className="tegel-side-menu-label">{label}</span>
              {attentionCount > 0 ? (
                <span
                  aria-label={`${attentionCount} ${label} item${attentionCount === 1 ? "" : "s"} need attention`}
                  className="tegel-side-attention-count"
                >
                  {attentionCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
      <button
        className="tegel-side-toggle"
        type="button"
        aria-expanded={!isCompact}
        aria-label={isCompact ? t.shell.expandNav : t.shell.collapseNav}
        title={isCompact ? t.shell.expandNav : t.shell.collapseNav}
        onClick={toggleSideNavigation}
      >
        <TegelIcon name="chevron_right" size="18px" />
        {!isCompact ? <span>{t.shell.collapseNav}</span> : null}
      </button>
    </aside>
  );
}
