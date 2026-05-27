import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "assistant_scan_history_v1";

export type AssistantScanHistoryItem = {
  id: string; // unique
  dateISO: string; // YYYY-MM-DD (work date)
  createdAt: number; // ms timestamp when we recorded it
  siteId: string;
  siteName: string;
  actingForemanId?: string | null;
  actingForemanName?: string | null;

  code: string; // employee code scanned
  result: "CREATED" | "ALREADY_SCANNED" | "UNKNOWN" | "INACTIVE" | "PENDING";
};

type Store = { items: AssistantScanHistoryItem[] };

async function load(): Promise<Store> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return { items: [] };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.items || !Array.isArray(parsed.items)) return { items: [] };
    return { items: parsed.items as AssistantScanHistoryItem[] };
  } catch {
    return { items: [] };
  }
}

async function save(store: Store) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function uuid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export async function recordPendingScan(input: {
  dateISO: string;
  siteId: string;
  siteName: string;
  code: string;
  actingForemanId?: string | null;
  actingForemanName?: string | null;
}) {
  const store = await load();

  store.items.unshift({
    id: uuid(),
    dateISO: input.dateISO,
    createdAt: Date.now(),
    siteId: input.siteId,
    siteName: input.siteName,
    actingForemanId: input.actingForemanId ?? null,
    actingForemanName: input.actingForemanName ?? null,
    code: input.code,
    result: "PENDING",
  });

  // cap size so it doesn’t grow forever
  store.items = store.items.slice(0, 600);

  await save(store);
}

export async function recordSubmittedBatch(input: {
  dateISO: string;
  siteId: string;
  siteName: string;
  codes: string[];
  results?: Array<{
    status: "CREATED" | "ALREADY_SCANNED" | "UNKNOWN" | "INACTIVE";
  }>;
  actingForemanId?: string | null;
  actingForemanName?: string | null;
}) {
  const store = await load();

  const now = Date.now();
  const results = input.results ?? [];
  for (let i = 0; i < input.codes.length; i++) {
    const code = String(input.codes[i] ?? "").trim();
    if (!code) continue;

    const status =
      (results[i]?.status as AssistantScanHistoryItem["result"]) ?? "CREATED";

    store.items.unshift({
      id: uuid(),
      dateISO: input.dateISO,
      createdAt: now,
      siteId: input.siteId,
      siteName: input.siteName,
      actingForemanId: input.actingForemanId ?? null,
      actingForemanName: input.actingForemanName ?? null,
      code,
      result: status,
    });
  }

  store.items = store.items.slice(0, 600);
  await save(store);
}

export async function listRecentHistory(
  daysBack: number,
): Promise<AssistantScanHistoryItem[]> {
  const store = await load();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (daysBack - 1));
  cutoff.setHours(0, 0, 0, 0);

  const cutoffMs = cutoff.getTime();

  return store.items
    .filter((x) => {
      // compare by dateISO midnight local
      const d = new Date(`${x.dateISO}T00:00:00`);
      return d.getTime() >= cutoffMs;
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function clearAllAssistantHistory() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

/**
 * Get unique sites the assistant has scanned today.
 * Returns an array of { siteId, siteName, actingForemanId, actingForemanName }
 */
export async function getSitesScannedToday(): Promise<
  Array<{
    siteId: string;
    siteName: string;
    actingForemanId?: string | null;
    actingForemanName?: string | null;
  }>
> {
  const store = await load();

  const todayISO = new Date().toISOString().slice(0, 10);

  const todayItems = store.items.filter((x) => x.dateISO === todayISO);

  // Dedupe by siteId, keeping first (most recent) entry
  const seen = new Set<string>();
  const result: Array<{
    siteId: string;
    siteName: string;
    actingForemanId?: string | null;
    actingForemanName?: string | null;
  }> = [];

  for (const item of todayItems) {
    if (!seen.has(item.siteId)) {
      seen.add(item.siteId);
      result.push({
        siteId: item.siteId,
        siteName: item.siteName,
        actingForemanId: item.actingForemanId,
        actingForemanName: item.actingForemanName,
      });
    }
  }

  return result;
}
