/**
 * RecentItems — platform recent entity keys (modules + tickets).
 * Presentation stays in shell / DS; this owns persistence semantics.
 */

import { MAX_RECENT_MODULES, type WorkspacePreferences } from "./preferences";
import { pushRecent } from "./storage";

export const MAX_RECENT_TICKETS = 8;

export type RecentEntityKind = "module" | "ticket";

export type RecentEntityRef = {
  kind: RecentEntityKind;
  id: string;
};

export function rememberRecentModule(
  preferences: WorkspacePreferences,
  moduleKey: string
): WorkspacePreferences {
  return {
    ...preferences,
    recent: pushRecent(preferences.recent, moduleKey, MAX_RECENT_MODULES)
  };
}

export function rememberRecentTicket(
  preferences: WorkspacePreferences,
  ticketKey: string
): WorkspacePreferences {
  return {
    ...preferences,
    recentTickets: pushRecent(preferences.recentTickets ?? [], ticketKey, MAX_RECENT_TICKETS)
  };
}

export function listRecentModules(preferences: WorkspacePreferences): string[] {
  return preferences.recent;
}

export function listRecentTickets(preferences: WorkspacePreferences): string[] {
  return preferences.recentTickets ?? [];
}

export function resolveRecentTicketItems<T extends { key: string }>(
  preferences: WorkspacePreferences,
  tickets: readonly T[],
  limit = 5
): T[] {
  const byKey = new Map(tickets.map((ticket) => [ticket.key, ticket]));

  return listRecentTickets(preferences)
    .map((key) => byKey.get(key))
    .filter((ticket): ticket is T => Boolean(ticket))
    .slice(0, limit);
}
