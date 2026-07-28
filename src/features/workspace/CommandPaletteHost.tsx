"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { TegelIcon, type TegelIconName } from "@/components/nexus/TegelIcon";
import { SearchBox } from "@/design-system";
import {
  handleListNavigationKeyDown,
  registerKeyboardShortcut
} from "@/features/workspace/KeyboardShortcutManager";

export type CommandPaletteItem = {
  id: string;
  label: string;
  group: string;
  iconName?: TegelIconName;
  onSelect: () => void;
};

/**
 * Workspace command palette host (Ctrl/Cmd+K).
 * Registers through KeyboardShortcutManager — do not add a second global Ctrl+K listener.
 */
export function CommandPaletteHost({
  items,
  enabled = true,
  open: openProp,
  onOpenChange
}: {
  items: CommandPaletteItem[];
  enabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? Boolean(openProp) : uncontrolledOpen;
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const listId = useId();

  function setOpen(next: boolean) {
    if (!isControlled) {
      setUncontrolledOpen(next);
    }
    onOpenChange?.(next);
  }

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return items;
    }

    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(normalized) || item.group.toLowerCase().includes(normalized)
    );
  }, [items, query]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    return registerKeyboardShortcut({
      id: "workspace.command-palette.toggle",
      key: "k",
      ctrlOrMeta: true,
      ignoreWhenTyping: false,
      handler: (event) => {
        event.preventDefault();
        setOpen(!open);
      }
    });
  }, [enabled, open, isControlled]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      return;
    }

    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) {
    return null;
  }

  function runItem(item: CommandPaletteItem) {
    setOpen(false);
    item.onSelect();
  }

  return (
    <div className="nx-command-palette" role="presentation">
      <button
        type="button"
        className="nx-command-palette__scrim"
        aria-label="Close command palette"
        onClick={() => setOpen(false)}
      />
      <div
        ref={dialogRef}
        className="nx-command-palette__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="nx-title">
          Jump to
        </h2>
        <p className="nx-caption nx-text-muted">Press Esc to close. Ctrl/Cmd+K toggles this palette.</p>
        <SearchBox
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Modules…"
          aria-controls={listId}
          aria-autocomplete="list"
          onKeyDown={(event) => {
            handleListNavigationKeyDown(event, {
              length: filtered.length,
              activeIndex,
              onChange: setActiveIndex,
              onEnter: (index) => {
                if (filtered[index]) {
                  runItem(filtered[index]);
                }
              },
              onEscape: () => setOpen(false)
            });
          }}
        />
        <ul id={listId} className="nx-command-palette__list" role="listbox" aria-label="Commands">
          {filtered.length === 0 ? (
            <li className="nx-command-palette__empty nx-body nx-text-secondary">No matches</li>
          ) : (
            filtered.map((item, index) => (
              <li key={item.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`nx-command-palette__option${index === activeIndex ? " is-active" : ""}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => runItem(item)}
                >
                  {item.iconName ? <TegelIcon name={item.iconName} size="18px" /> : null}
                  <span className="nx-command-palette__option-copy">
                    <strong className="nx-body">{item.label}</strong>
                    <span className="nx-caption nx-text-muted">{item.group}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
