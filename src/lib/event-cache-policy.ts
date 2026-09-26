export const EVENT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export function isFreshEventCache(expiresAt: string, now = Date.now()) {
  const expiryTime = Date.parse(expiresAt);
  return Number.isFinite(expiryTime) && expiryTime > now;
}
