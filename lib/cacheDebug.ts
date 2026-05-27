// lib/cacheDebug.ts
// Lightweight in-memory debug log for cache + network behavior.
// Only used in development/internal debug screens.

export type CacheDebugEventKind =
  | "cache-hit"
  | "cache-miss"
  | "cache-stale"
  | "cache-set"
  | "network-fresh"
  | "network-bg"
  | "network-dedup-new"
  | "network-dedup-join";

export type CacheDebugEvent = {
  id: number;
  at: number; // Date.now()
  kind: CacheDebugEventKind;
  cacheKey?: string;
  path?: string;
  note?: string;
};

const MAX_EVENTS = 200;
const events: CacheDebugEvent[] = [];
let nextId = 1;

export function logCacheDebug(event: Omit<CacheDebugEvent, "id" | "at">) {
  const full: CacheDebugEvent = {
    id: nextId++,
    at: Date.now(),
    ...event,
  };
  events.push(full);
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
}

export function getCacheDebugEvents(): CacheDebugEvent[] {
  // Return newest first for convenience
  return [...events].sort((a, b) => b.at - a.at);
}

export function clearCacheDebugEvents() {
  events.splice(0, events.length);
}
