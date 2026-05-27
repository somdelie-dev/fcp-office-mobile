// lib/mobileCache.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { logCacheDebug } from "./cacheDebug";

const CACHE_PREFIX = "cache_v2_"; // bump version to invalidate old caches safely
const MAX_ENTRY_BYTES = 120 * 1024; // ~120KB per entry guard (adjust if needed)

export type CacheEntry<T> = {
  data: T;
  savedAt: number;
  ttlMs: number;
};

export type CacheResult<T> = {
  hit: boolean;
  stale: boolean;
  data: T | null;
};

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function approxBytes(s: string) {
  // Rough UTF-8 size estimate
  return s.length * 2;
}

/**
 * Scope cache keys so cached responses never leak across:
 * - different users
 * - acting-foreman changes (assistant mode)
 *
 * Use:
 *   const scoped = await cacheKeyScope("sites_list");
 *   apiFetchCached("/api/app/sites", { cacheKey: scoped, ttlMs: TTL.SITES_LIST })
 */
export async function cacheKeyScope(baseKey: string): Promise<string> {
  // user id is safest scope, but auth user might not be available in this file.
  // We use token/user storage keys you already have:
  const authRaw = await AsyncStorage.getItem("auth_user_v1");
  const auth = authRaw ? safeJsonParse<{ id?: string }>(authRaw) : null;

  const userId = auth?.id ?? "anon";

  // Acting foreman matters for assistant UX (header x-acting-foreman-id)
  const actingForemanId =
    (await AsyncStorage.getItem("acting_foreman_id")) ?? "none";

  return `${baseKey}__u_${userId}__af_${actingForemanId}`;
}

/**
 * Get cached data by key
 * Returns hit=true if data exists, stale=true if TTL expired
 */
export async function cacheGet<T>(key: string): Promise<CacheResult<T>> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) {
      logCacheDebug({ kind: "cache-miss", cacheKey: key });
      return { hit: false, stale: false, data: null };
    }

    const entry = safeJsonParse<CacheEntry<T>>(raw);
    if (
      !entry ||
      typeof entry.savedAt !== "number" ||
      typeof entry.ttlMs !== "number"
    ) {
      // Corrupt entry -> remove it
      await AsyncStorage.removeItem(CACHE_PREFIX + key);
      logCacheDebug({ kind: "cache-miss", cacheKey: key, note: "corrupt" });
      return { hit: false, stale: false, data: null };
    }

    const now = Date.now();
    const isStale = now - entry.savedAt > entry.ttlMs;

    logCacheDebug({
      kind: isStale ? "cache-stale" : "cache-hit",
      cacheKey: key,
    });

    return { hit: true, stale: isStale, data: entry.data };
  } catch (error) {
    console.warn("Cache read error:", error);
    return { hit: false, stale: false, data: null };
  }
}

/**
 * Store data in cache with TTL
 */
export async function cacheSet<T>(
  key: string,
  data: T,
  ttlMs: number,
): Promise<void> {
  try {
    const entry: CacheEntry<T> = { data, savedAt: Date.now(), ttlMs };
    const raw = JSON.stringify(entry);

    // Guard against huge entries (AsyncStorage can become slow / fail)
    if (approxBytes(raw) > MAX_ENTRY_BYTES) {
      // If it's too big, don't cache it. App still works.
      console.warn(`[Cache] Skip large entry: ${key}`);
      return;
    }

    await AsyncStorage.setItem(CACHE_PREFIX + key, raw);
    logCacheDebug({ kind: "cache-set", cacheKey: key });
  } catch (error) {
    console.warn("Cache write error:", error);
  }
}

/**
 * Remove cached data by key
 */
export async function cacheRemove(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_PREFIX + key);
  } catch (error) {
    console.warn("Cache remove error:", error);
  }
}

/**
 * Clear all cached data (useful for logout / role switch)
 */
export async function cacheClearAll(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));
    if (cacheKeys.length) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
  } catch (error) {
    console.warn("Cache clear error:", error);
  }
}

/**
 * Optional: cleanup stale entries.
 * Call this at app start or after sign-in (mobile only).
 */
export async function cacheCleanupExpired(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));
    if (!cacheKeys.length) return;

    const pairs = await AsyncStorage.multiGet(cacheKeys);
    const now = Date.now();

    const toRemove: string[] = [];
    for (const [k, raw] of pairs) {
      if (!raw) continue;

      const entry = safeJsonParse<CacheEntry<any>>(raw);
      if (
        !entry ||
        typeof entry.savedAt !== "number" ||
        typeof entry.ttlMs !== "number"
      ) {
        toRemove.push(k);
        continue;
      }

      const expired = now - entry.savedAt > entry.ttlMs * 4; // keep some history, purge old
      if (expired) toRemove.push(k);
    }

    if (toRemove.length) {
      await AsyncStorage.multiRemove(toRemove);
    }
  } catch (e) {
    console.warn("Cache cleanup error:", e);
  }
}

/**
 * Common TTL values in milliseconds
 */
export const TTL = {
  PROFILE: 60 * 60 * 1000, // 1 hour
  SITES_LIST: 30 * 60 * 1000, // 30 min
  EMPLOYEES_LIST: 30 * 60 * 1000, // 30 min
  TIMESHEET_LIST: 10 * 60 * 1000, // 10 min
  TIMESHEET_DETAIL: 5 * 60 * 1000, // 5 min
  PHOTO_REQUESTS: 5 * 60 * 1000, // 5 min
  SITE_DAY_PHOTOS: 15 * 60 * 1000, // 15 min
  ATTENDANCE_TODAY: 2 * 60 * 1000, // 2 min
  FOREMAN_DAYS: 5 * 60 * 1000, // 5 min
} as const;
