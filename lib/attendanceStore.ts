import AsyncStorage from "@react-native-async-storage/async-storage";

export type DayStatus = "PENDING" | "APPROVED" | "REJECTED";

export type ScanItem = {
  code: string;
  name?: string;
  scannedAt: number; // ms timestamp
};

export type DayRecord = {
  siteId: string;
  siteName: string;
  dateISO: string;
  status: DayStatus;
  flags: number;
  scans: ScanItem[];

  foremanFlagReason?: string;
  foremanNote?: string;

  readyToSubmit?: boolean; // ✅ NEW
  updatedAt?: number;
};

type Key = string; // `${siteId}:${dateISO}`
type DaysMap = Record<Key, DayRecord>;

const STORAGE_KEY = "attendance_days_v1";

// In-memory cache (fast UI)
let cache: DaysMap = {};
let loaded = false;

function keyFor(siteId: string, dateISO: string) {
  return `${siteId}:${dateISO}`;
}

// Set day readyToSubmit flag
export async function setDayReadyToSubmit(
  siteId: string,
  dateISO: string,
  ready: boolean,
) {
  await ensureLoaded();
  const k = keyFor(siteId, dateISO);
  if (!cache[k]) return;

  cache[k].readyToSubmit = ready;
  cache[k].updatedAt = Date.now();
  await persist();
}

// Load from storage if not already loaded
async function ensureLoaded() {
  if (loaded) return;
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  cache = raw ? (JSON.parse(raw) as DaysMap) : {};
  loaded = true;
}

// Persist current cache to storage
async function persist() {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

/**
 * Use this once at app start OR from screens before using the store.
 */
export async function initAttendanceStore() {
  await ensureLoaded();
}

/**
 * Returns a DayRecord, creating it if missing.
 */
export async function ensureDay(
  siteId: string,
  siteName: string,
  dateISO: string,
) {
  await ensureLoaded();
  const k = keyFor(siteId, dateISO);
  if (!cache[k]) {
    cache[k] = {
      siteId,
      siteName,
      dateISO,
      status: "PENDING",
      flags: 0,
      scans: [],
      readyToSubmit: false,
      updatedAt: Date.now(),
    };
    await persist();
  } else {
    // keep latest siteName if it changes
    if (cache[k].siteName !== siteName) {
      cache[k].siteName = siteName;
      cache[k].updatedAt = Date.now();
      await persist();
    }
  }
  return cache[k];
}

// List scans for a specific day
export async function listScans(
  siteId: string,
  dateISO: string,
): Promise<ScanItem[]> {
  await ensureLoaded();
  const k = keyFor(siteId, dateISO);
  return cache[k]?.scans ?? [];
}

// Add a scan to a day
export async function addScan(
  siteId: string,
  siteName: string,
  dateISO: string,
  item: ScanItem,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  await ensureLoaded();
  const day = await ensureDay(siteId, siteName, dateISO);

  if (day.scans.some((s) => s.code === item.code)) {
    return { ok: false, reason: "Already scanned" };
  }

  day.scans = [item, ...day.scans];
  day.updatedAt = Date.now();
  cache[keyFor(siteId, dateISO)] = day;
  await persist();
  return { ok: true };
}

// Clear all scans for a day
export async function clearScans(siteId: string, dateISO: string) {
  await ensureLoaded();
  const k = keyFor(siteId, dateISO);
  if (!cache[k]) return;

  cache[k].scans = [];
  cache[k].updatedAt = Date.now();

  await persist();
}

// List all stored days
export async function listDays(): Promise<DayRecord[]> {
  await ensureLoaded();
  return Object.values(cache).sort((a, b) => {
    return new Date(b.dateISO).getTime() - new Date(a.dateISO).getTime();
  });
}

// Set day status
export async function setDayStatus(
  siteId: string,
  dateISO: string,
  status: DayStatus,
) {
  await ensureLoaded();
  const k = keyFor(siteId, dateISO);
  if (!cache[k]) return;

  cache[k].status = status;
  cache[k].updatedAt = Date.now();

  await persist();
}

// Set day flags (bitmask)
export async function setDayFlags(
  siteId: string,
  dateISO: string,
  flags: number,
) {
  await ensureLoaded();
  const k = keyFor(siteId, dateISO);
  if (!cache[k]) return;

  cache[k].flags = flags;
  cache[k].updatedAt = Date.now();

  await persist();
}

/**
 * Optional: wipe all stored attendance (useful for debugging).
 */
export async function resetAttendanceStore() {
  cache = {};
  loaded = true;
  await AsyncStorage.removeItem(STORAGE_KEY);
}

// Remove a specific scan by code
export async function removeScan(
  siteId: string,
  dateISO: string,
  code: string,
) {
  await ensureLoaded();
  const k = keyFor(siteId, dateISO);
  const day = cache[k];
  if (!day) return;

  const before = day.scans.length;
  day.scans = day.scans.filter((s) => s.code !== code);

  if (day.scans.length !== before) {
    day.updatedAt = Date.now();
    await persist();
  }
}

// Set foreman note and/or flag reason
export async function setForemanDayNote(
  siteId: string,
  dateISO: string,
  payload: { reason?: string; note?: string },
) {
  await ensureLoaded();
  const k = keyFor(siteId, dateISO);
  const day = cache[k];
  if (!day) return;

  if (typeof payload.reason === "string") {
    day.foremanFlagReason = payload.reason;
  }
  if (typeof payload.note === "string") {
    day.foremanNote = payload.note;
  }
  day.updatedAt = Date.now();
  await persist();
}
