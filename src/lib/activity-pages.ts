// Paging the audit log by cursor. The API returns the newest page and, in X-Next-Cursor, an
// opaque cursor for the rows after it; older pages are appended to what is already shown.

/** A path for one page of `base` (for example "/activity"), after `cursor` when there is one. */
export function pagePath(base: string, limit: number, cursor?: string | null) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return `${base}?${params.toString()}`;
}

type Dated = { id: string; at: string };

/** Newest first, the API's order: by time, then by id. */
export function compareNewestFirst(a: Dated, b: Dated) {
  const delta = new Date(b.at).getTime() - new Date(a.at).getTime();
  if (delta !== 0) return delta;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * Every event from all lists once, newest first. A later list wins for the same id, so a fresher
 * copy of an event replaces the one loaded earlier.
 */
export function mergeEvents<T extends Dated>(...lists: T[][]): T[] {
  const byId = new Map<string, T>();
  for (const list of lists) {
    for (const item of list) byId.set(item.id, item);
  }
  return [...byId.values()].sort(compareNewestFirst);
}

export type OlderPages<T> = {
  /** Events loaded past the live first page, including what that page showed when they were. */
  events: T[];
  /** Cursor for the next older page; null once the oldest has loaded. */
  next: string | null;
};

/**
 * The state after one more older page arrived. `live` is the first page as it is now: its rows
 * are kept too, because new activity pushes them off the live page while the older pages stay
 * where they began, and without them a gap would open between the two.
 */
export function addOlderPage<T extends Dated>(
  state: OlderPages<T> | null,
  live: T[],
  page: { items: T[]; next: string | null }
): OlderPages<T> {
  return { events: mergeEvents(state?.events ?? [], live, page.items), next: page.next };
}

/** The cursor to load the next older page from, or null when there is nothing older. */
export function olderCursor<T>(state: OlderPages<T> | null, liveNext: string | null) {
  return state ? state.next : liveNext;
}
