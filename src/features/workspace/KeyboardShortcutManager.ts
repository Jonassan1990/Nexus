/**
 * KeyboardShortcutManager — global chord registry + shared listbox navigation.
 * Shell and modules register shortcuts; do not attach duplicate document listeners.
 */

export type KeyboardShortcutChord = {
  id: string;
  /** Lowercase key without modifiers, e.g. "k". */
  key: string;
  ctrlOrMeta?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** When false, ignore if focus is in editable fields. Default true for ctrl chords. */
  ignoreWhenTyping?: boolean;
  handler: (event: KeyboardEvent) => void;
};

export type ListNavigationOptions = {
  length: number;
  activeIndex: number;
  onChange: (index: number) => void;
  onEnter?: (index: number) => void;
  onEscape?: () => void;
};

const registry = new Map<string, KeyboardShortcutChord>();
let listening = false;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName;
  return (
    target.isContentEditable ||
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    Boolean(target.closest("[role='textbox']"))
  );
}

function matchesChord(event: KeyboardEvent, chord: KeyboardShortcutChord): boolean {
  if (event.key.toLowerCase() !== chord.key.toLowerCase()) {
    return false;
  }

  const ctrlOrMeta = event.ctrlKey || event.metaKey;

  if (Boolean(chord.ctrlOrMeta) !== ctrlOrMeta) {
    return false;
  }

  if (Boolean(chord.shift) !== event.shiftKey) {
    return false;
  }

  if (Boolean(chord.alt) !== event.altKey) {
    return false;
  }

  return true;
}

function onDocumentKeyDown(event: KeyboardEvent) {
  for (const chord of registry.values()) {
    if (!matchesChord(event, chord)) {
      continue;
    }

    const ignoreWhenTyping = chord.ignoreWhenTyping ?? Boolean(chord.ctrlOrMeta);

    if (ignoreWhenTyping && isTypingTarget(event.target) && !chord.ctrlOrMeta) {
      continue;
    }

    chord.handler(event);
  }
}

function ensureListener() {
  if (listening || typeof document === "undefined") {
    return;
  }

  document.addEventListener("keydown", onDocumentKeyDown);
  listening = true;
}

export function registerKeyboardShortcut(chord: KeyboardShortcutChord): () => void {
  registry.set(chord.id, chord);
  ensureListener();

  return () => {
    registry.delete(chord.id);
  };
}

export function clearKeyboardShortcuts(): void {
  registry.clear();
}

/** Shared combobox / listbox arrow handling for TopBar + command palette. */
export function handleListNavigationKeyDown(
  event: { key: string; preventDefault: () => void },
  options: ListNavigationOptions
): boolean {
  const { length, activeIndex, onChange, onEnter, onEscape } = options;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    onChange(Math.min(activeIndex + 1, Math.max(length - 1, 0)));
    return true;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    onChange(Math.max(activeIndex - 1, 0));
    return true;
  }

  if (event.key === "Escape") {
    onEscape?.();
    return Boolean(onEscape);
  }

  if (event.key === "Enter" && length > 0) {
    onEnter?.(activeIndex);
    return Boolean(onEnter);
  }

  return false;
}
