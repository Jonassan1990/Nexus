/**
 * Workspace platform — shared list helpers (Phase 3.5)
 */

export function toggleListItem(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter((item) => item !== key) : [...list, key];
}

export function pushRecent(list: string[], key: string, limit: number): string[] {
  return [key, ...list.filter((item) => item !== key)].slice(0, limit);
}

export function parseStringList(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map(String) : [];
}

export function parseStringListRecord(value: string | null): Record<string, string[]> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([key, items]) => [
        key,
        Array.isArray(items) ? items.filter((item): item is string => typeof item === "string") : []
      ])
    );
  } catch {
    return {};
  }
}

export function safeReadLocalStorage(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeWriteLocalStorage(key: string, value: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore quota / private mode failures.
  }
}
