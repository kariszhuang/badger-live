export const CLIENT_EVENT_DAY_CACHE_TTL_MS = 5 * 60 * 1000;
export const CLIENT_EVENT_DAY_CACHE_MAX_ENTRIES = 7;

export type ClientEventDayCache<T> = Map<string, { value: T; cachedAt: number }>;

export function readClientEventDay<T>(cache: ClientEventDayCache<T>, date: string, now = Date.now()): T | null {
  const entry = cache.get(date);
  if (!entry) return null;
  if (now - entry.cachedAt >= CLIENT_EVENT_DAY_CACHE_TTL_MS) {
    cache.delete(date);
    return null;
  }

  cache.delete(date);
  cache.set(date, entry);
  return entry.value;
}

export function writeClientEventDay<T>(cache: ClientEventDayCache<T>, date: string, value: T, now = Date.now()) {
  cache.delete(date);
  cache.set(date, { value, cachedAt: now });
  while (cache.size > CLIENT_EVENT_DAY_CACHE_MAX_ENTRIES) {
    const oldestDate = cache.keys().next().value;
    if (oldestDate === undefined) break;
    cache.delete(oldestDate);
  }
}
