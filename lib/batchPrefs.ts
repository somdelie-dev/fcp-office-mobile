import AsyncStorage from "@react-native-async-storage/async-storage";

function key(siteId: string, dateISO: string) {
  return `scan_batch_v1:${siteId}:${dateISO}`;
}

export async function getBatch(
  siteId: string,
  dateISO: string,
): Promise<string[]> {
  const raw = await AsyncStorage.getItem(key(siteId, dateISO));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

export async function setBatch(
  siteId: string,
  dateISO: string,
  codes: string[],
) {
  await AsyncStorage.setItem(key(siteId, dateISO), JSON.stringify(codes));
}

export async function clearBatch(siteId: string, dateISO: string) {
  await AsyncStorage.removeItem(key(siteId, dateISO));
}
