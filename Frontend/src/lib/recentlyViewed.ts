const STORAGE_KEY = 'turf_recently_viewed';
const MAX_ENTRIES = 8;

/** Records a turf id as viewed, most-recent-first, de-duplicated. */
export function recordTurfView(turfId: string) {
  try {
    const ids = getRecentlyViewedIds().filter((id) => id !== turfId);
    ids.unshift(turfId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(0, MAX_ENTRIES)));
  } catch {
    // localStorage can be unavailable (private browsing, quota) — recently
    // viewed is a nicety, never worth failing the page load over.
  }
}

export function getRecentlyViewedIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
