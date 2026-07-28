/**
 * WorkspaceSearch — canonical ticket/text search for shell + modules.
 * Modules must not invent alternate haystack algorithms for the same entities.
 */

export type WorkspaceSearchableTicket = {
  key: string;
  title: string;
  product?: string;
  module?: string;
  site?: string;
  region?: string;
  priority?: string;
  typeLabel?: string;
  statusLabel?: string;
  locationLabel?: string;
};

export type WorkspaceSearchMatch<T> = {
  item: T;
  score: number;
  exactKey: boolean;
};

export function normalizeWorkspaceQuery(query: string): string {
  return query.trim().toLowerCase();
}

/** Canonical searchable text for a ticket-like entity. */
export function getTicketSearchHaystack(ticket: WorkspaceSearchableTicket): string {
  return [
    ticket.key,
    ticket.title,
    ticket.product,
    ticket.module,
    ticket.site,
    ticket.region,
    ticket.priority,
    ticket.typeLabel,
    ticket.statusLabel,
    ticket.locationLabel
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function ticketMatchesWorkspaceQuery(
  ticket: WorkspaceSearchableTicket,
  query: string
): boolean {
  const normalized = normalizeWorkspaceQuery(query);

  if (!normalized) {
    return true;
  }

  return getTicketSearchHaystack(ticket).includes(normalized);
}

/**
 * Rank matches: exact key first, then prefix key, then haystack includes.
 * Returns at most `limit` items.
 */
export function searchWorkspaceTickets<T extends WorkspaceSearchableTicket>(
  tickets: readonly T[],
  query: string,
  limit = 8
): WorkspaceSearchMatch<T>[] {
  const normalized = normalizeWorkspaceQuery(query);

  if (!normalized) {
    return tickets.slice(0, limit).map((item) => ({ item, score: 0, exactKey: false }));
  }

  const matches: WorkspaceSearchMatch<T>[] = [];

  for (const ticket of tickets) {
    const key = ticket.key.toLowerCase();

    if (key === normalized) {
      matches.push({ item: ticket, score: 300, exactKey: true });
      continue;
    }

    if (key.startsWith(normalized)) {
      matches.push({ item: ticket, score: 200, exactKey: false });
      continue;
    }

    if (getTicketSearchHaystack(ticket).includes(normalized)) {
      matches.push({ item: ticket, score: 100, exactKey: false });
    }
  }

  return matches
    .sort((left, right) => right.score - left.score || left.item.key.localeCompare(right.item.key))
    .slice(0, limit);
}

export function resolveWorkspaceTicketQuery<T extends WorkspaceSearchableTicket>(
  tickets: readonly T[],
  query: string
): { exact?: T; matches: T[] } {
  const normalized = normalizeWorkspaceQuery(query);

  if (!normalized) {
    return { matches: [] };
  }

  const exact = tickets.find((ticket) => ticket.key.toLowerCase() === normalized);
  const matches = searchWorkspaceTickets(tickets, query, 25).map((entry) => entry.item);

  return { exact, matches };
}
