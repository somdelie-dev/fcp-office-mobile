// lib/apiFetchCached.ts
import { apiFetch } from "./api";
import { logCacheDebug } from "./cacheDebug";
import { cacheGet, cacheSet } from "./mobileCache";
import { isCurrentlyOnline } from "./offline/networkStatus";

export type CachedFetchOptions = {
  cacheKey: string;
  ttlMs: number;
  forceRefresh?: boolean;

  /**
   * Default true:
   * - if cache exists and is stale, return cache immediately
   * - refresh in background once (deduped)
   */
  staleWhileRevalidate?: boolean;

  /**
   * Default true:
   * - if offline and cache exists (even stale), return it
   * - if offline and no cache, throw OfflineError
   */
  allowStaleWhenOffline?: boolean;
};

export class OfflineError extends Error {
  constructor(message = "You are offline and no cached data is available") {
    super(message);
    this.name = "OfflineError";
  }
}

/**
 * ✅ DEDUPE MAP
 * Prevents multiple identical requests from being fired at the same time.
 * This is the #1 fix for mobile data spikes.
 */
const inflight = new Map<string, Promise<any>>();

/**
 * Cache-first API fetch wrapper
 *
 * Behavior:
 * 1) If cache exists and forceRefresh=false:
 *    - return cached data immediately
 *    - if stale + online, refresh once in background (deduped)
 *
 * 2) If no cache:
 *    - if offline -> throw OfflineError
 *    - else fetch, cache, return
 *
 * 3) If forceRefresh=true:
 *    - if offline and cache exists and allowStaleWhenOffline=true -> return cache
 *    - if offline and no cache -> throw OfflineError
 *    - else fetch fresh, cache, return
 */
export async function apiFetchCached<T>(
  path: string,
  options: CachedFetchOptions,
  fetchInit?: RequestInit & { auth?: boolean },
): Promise<T> {
  const {
    cacheKey,
    ttlMs,
    forceRefresh = false,
    staleWhileRevalidate = true,
    allowStaleWhenOffline = true,
  } = options;

  const online = isCurrentlyOnline();

  // ---- 1) Use cache first (unless force refresh) ----
  const cached = await cacheGet<T>(cacheKey);

  if (!forceRefresh && cached.hit && cached.data !== null) {
    // If stale and online, refresh in background once (deduped)
    if (cached.stale && online && staleWhileRevalidate) {
      void refreshInBackgroundDeduped<T>(path, cacheKey, ttlMs, fetchInit);
    }

    // If stale but offline and allowed -> still return cached data
    if (cached.stale && !online && allowStaleWhenOffline) {
      return cached.data;
    }

    // Fresh -> return cached
    return cached.data;
  }

  // ---- 2) forceRefresh OR cache miss ----
  // If offline:
  if (!online) {
    // Return cached if allowed
    if (cached.hit && cached.data !== null && allowStaleWhenOffline) {
      return cached.data;
    }
    throw new OfflineError();
  }

  // ---- 3) Fetch fresh (deduped) ----
  return await fetchFreshDeduped<T>(path, cacheKey, ttlMs, fetchInit);
}

/**
 * ✅ Fetch fresh with in-flight dedupe
 * If multiple components call the same request simultaneously,
 * only one network request happens.
 */
async function fetchFreshDeduped<T>(
  path: string,
  cacheKey: string,
  ttlMs: number,
  fetchInit?: RequestInit & { auth?: boolean },
): Promise<T> {
  const key = buildInflightKey("fresh", path, fetchInit, cacheKey);

  if (inflight.has(key)) {
    logCacheDebug({
      kind: "network-dedup-join",
      cacheKey,
      path,
      note: key,
    });
    return inflight.get(key)! as Promise<T>;
  }

  logCacheDebug({
    kind: "network-dedup-new",
    cacheKey,
    path,
    note: key,
  });

  const p = (async () => {
    const data = await apiFetch(path, fetchInit);
    logCacheDebug({ kind: "network-fresh", cacheKey, path });
    await cacheSet<T>(cacheKey, data as T, ttlMs);
    return data as T;
  })();

  inflight.set(key, p);

  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}

/**
 * ✅ Background refresh with dedupe (no spam)
 */
async function refreshInBackgroundDeduped<T>(
  path: string,
  cacheKey: string,
  ttlMs: number,
  fetchInit?: RequestInit & { auth?: boolean },
): Promise<void> {
  const key = buildInflightKey("bg", path, fetchInit, cacheKey);

  if (inflight.has(key)) return;

  const p = (async () => {
    try {
      const data = await apiFetch(path, fetchInit);
      logCacheDebug({ kind: "network-bg", cacheKey, path });
      await cacheSet<T>(cacheKey, data as T, ttlMs);
    } catch {
      // silent fail
    }
  })();

  inflight.set(key, p);

  try {
    await p;
  } finally {
    inflight.delete(key);
  }
}

/**
 * Force refresh helper (pull-to-refresh)
 * Uses same deduped fetch path.
 */
export async function refreshCache<T>(
  path: string,
  cacheKey: string,
  ttlMs: number,
  fetchInit?: RequestInit & { auth?: boolean },
): Promise<T> {
  if (!isCurrentlyOnline()) {
    const cached = await cacheGet<T>(cacheKey);
    if (cached.hit && cached.data !== null) return cached.data;
    throw new OfflineError();
  }

  return fetchFreshDeduped<T>(path, cacheKey, ttlMs, fetchInit);
}

/**
 * Helper to build consistent cache keys
 */
export function buildCacheKey(
  prefix: string,
  ...parts: (string | number | undefined | null)[]
): string {
  const validParts = parts.filter((p) => p !== undefined && p !== null);
  return [prefix, ...validParts].join("_");
}

/**
 * Build inflight key (must include auth + method + body)
 * so POSTs etc don't collide.
 */
function buildInflightKey(
  type: "fresh" | "bg",
  path: string,
  fetchInit?: RequestInit & { auth?: boolean },
  cacheKey?: string,
) {
  const method = (fetchInit?.method || "GET").toUpperCase();
  const auth = fetchInit?.auth === false ? "noauth" : "auth";
  const body =
    typeof fetchInit?.body === "string"
      ? fetchInit.body
      : fetchInit?.body
        ? "[body]"
        : "";
  return `${type}:${cacheKey ?? ""}:${method}:${auth}:${path}:${body}`;
}
