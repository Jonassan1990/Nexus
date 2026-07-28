"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { TegelIcon, type TegelIconName } from "./TegelIcon";

export type PortalNavItem<TModule extends string = string> = {
  key: TModule;
  label: string;
  iconName: TegelIconName;
};

type WorkspaceLists = {
  pinned: readonly string[];
  favourites: readonly string[];
  recent: readonly string[];
};

export function PortalSidebar<TModule extends string>({
  activeModule,
  attentionCounts,
  items,
  isCompact,
  isMobileOpen,
  isMounted,
  workspaceLists,
  onClose,
  onCollapse,
  onExpand,
  onSelectModule,
  onTogglePinned,
  onToggleFavourite
}: {
  activeModule: TModule;
  attentionCounts: Partial<Record<TModule, number>>;
  items: readonly PortalNavItem<TModule>[];
  isCompact: boolean;
  isMobileOpen?: boolean;
  isMounted: boolean;
  workspaceLists?: WorkspaceLists;
  onClose: () => void;
  onCollapse: () => void;
  onExpand: () => void;
  onSelectModule: (module: TModule) => void;
  onTogglePinned?: (module: TModule) => void;
  onToggleFavourite?: (module: TModule) => void;
}) {
  const railWidthPx = isCompact ? 56 : 272;
  const { t } = useLocale();
  const moduleLabels = t.modules as Record<string, string>;
  const firstButtonRef = useRef<HTMLButtonElement>(null);
  const drawerOpen = Boolean(isMobileOpen);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const sync = () => setIsMobileViewport(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const hideFromAccessibilityTree = isMobileViewport && !drawerOpen;

  const itemByKey = useMemo(() => {
    const map = new Map<string, PortalNavItem<TModule>>();
    items.forEach((item) => map.set(item.key, item));
    return map;
  }, [items]);

  const favourites = useMemo(
    () =>
      (workspaceLists?.favourites ?? [])
        .map((key) => itemByKey.get(key))
        .filter((item): item is PortalNavItem<TModule> => Boolean(item)),
    [itemByKey, workspaceLists?.favourites]
  );

  const pinned = useMemo(
    () =>
      (workspaceLists?.pinned ?? [])
        .map((key) => itemByKey.get(key))
        .filter((item): item is PortalNavItem<TModule> => Boolean(item)),
    [itemByKey, workspaceLists?.pinned]
  );

  const recent = useMemo(
    () =>
      (workspaceLists?.recent ?? [])
        .map((key) => itemByKey.get(key))
        .filter((item): item is PortalNavItem<TModule> => Boolean(item))
        .filter((item) => item.key !== activeModule)
        .slice(0, 5),
    [activeModule, itemByKey, workspaceLists?.recent]
  );

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => firstButtonRef.current?.focus());

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [drawerOpen, onClose]);

  if (!isMounted) {
    return <aside className="tegel-side-fallback" aria-hidden="true" />;
  }

  function toggleSideNavigation() {
    if (isCompact) {
      onExpand();
      return;
    }

    onCollapse();
  }

  function renderNavButton(item: PortalNavItem<TModule>, refFirst: boolean) {
    const attentionCount = attentionCounts[item.key] ?? 0;
    const isSelected = activeModule === item.key;
    const label = moduleLabels[item.key] ?? item.label;
    const isPinned = workspaceLists?.pinned.includes(item.key) ?? false;
    const isFavourite = workspaceLists?.favourites.includes(item.key) ?? false;
    const navButtonLabel = isCompact
      ? `${label}${attentionCount > 0 ? `, ${attentionCount} need attention` : ""}${isFavourite ? ", favourite" : ""}${isPinned ? ", pinned" : ""}`
      : undefined;

    return (
      <div key={item.key} className={`nx-workspace-nav-row${isSelected ? " is-selected" : ""}`}>
        <button
          ref={refFirst ? firstButtonRef : undefined}
          className={`tegel-side-menu-button${isSelected ? " is-selected" : ""}`}
          aria-current={isSelected ? "page" : undefined}
          aria-label={navButtonLabel}
          tabIndex={hideFromAccessibilityTree ? -1 : undefined}
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
        {!isCompact && (onToggleFavourite || onTogglePinned) ? (
          <div className="nx-workspace-nav-actions">
            {onToggleFavourite ? (
              <button
                type="button"
                className={`nx-workspace-nav-action${isFavourite ? " is-active" : ""}`}
                aria-pressed={isFavourite}
                aria-label={isFavourite ? `Remove ${label} from favourites` : `Add ${label} to favourites`}
                tabIndex={hideFromAccessibilityTree ? -1 : undefined}
                onClick={() => onToggleFavourite(item.key)}
              >
                <TegelIcon name="star" size="16px" />
              </button>
            ) : null}
            {onTogglePinned ? (
              <button
                type="button"
                className={`nx-workspace-nav-action${isPinned ? " is-active" : ""}`}
                aria-pressed={isPinned}
                aria-label={isPinned ? `Unpin ${label}` : `Pin ${label}`}
                tabIndex={hideFromAccessibilityTree ? -1 : undefined}
                onClick={() => onTogglePinned(item.key)}
              >
                <TegelIcon name="pin" size="16px" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  function renderSection(title: string, sectionItems: PortalNavItem<TModule>[]) {
    if (!sectionItems.length || isCompact) {
      return null;
    }

    return (
      <div className="nx-workspace-nav-section">
        <p className="nx-workspace-nav-section__title">{title}</p>
        {sectionItems.map((item) => renderNavButton(item, false))}
      </div>
    );
  }

  let assignedFirstRef = false;

  return (
    <>
      {drawerOpen ? (
        <button type="button" className="mobile-nav-scrim" aria-label="Close navigation" onClick={onClose} />
      ) : null}
      <aside
        id="workspace-primary-nav"
        className={`tegel-side-shell nx-workspace-side${isCompact ? " is-compact" : " is-expanded"}${drawerOpen ? " is-mobile-open" : ""}`}
        aria-label="Primary navigation"
        aria-hidden={hideFromAccessibilityTree ? true : undefined}
        {...(drawerOpen
          ? {
              role: "dialog" as const,
              "aria-modal": true as const
            }
          : {})}
        style={{
          width: railWidthPx,
          maxWidth: railWidthPx,
          minWidth: 0
        }}
      >
        <nav className="tegel-side-menu" aria-label="Modules">
          {renderSection("Favourites", favourites)}
          {renderSection("Pinned", pinned)}
          {renderSection("Recent", recent)}
          <div className="nx-workspace-nav-section nx-workspace-nav-section--all">
            {!isCompact ? <p className="nx-workspace-nav-section__title">Modules</p> : null}
            {items.map((item) => {
              const useRef = !assignedFirstRef;
              if (useRef) {
                assignedFirstRef = true;
              }
              return renderNavButton(item, useRef);
            })}
          </div>
        </nav>
        <button
          className="tegel-side-toggle"
          type="button"
          aria-expanded={!isCompact}
          aria-label={isCompact ? t.shell.expandNav : t.shell.collapseNav}
          title={isCompact ? t.shell.expandNav : t.shell.collapseNav}
          tabIndex={hideFromAccessibilityTree ? -1 : undefined}
          onClick={toggleSideNavigation}
        >
          <TegelIcon name="chevron_right" size="18px" />
          {!isCompact ? <span>{t.shell.collapseNav}</span> : null}
        </button>
      </aside>
    </>
  );
}
