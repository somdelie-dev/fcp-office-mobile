import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import { Platform } from "react-native";

import { apiFetch } from "./api";
import { isCurrentlyOnline } from "./offline/networkStatus";

export type UpdateReleaseInfo = {
  version: string;
  versionCode: number;
  minVersionCode: number;
  releaseNotes: string[];
  publishedAt: string;
};

export type UpdateCheckResult =
  | { status: "none" }
  | { status: "optional"; release: UpdateReleaseInfo }
  | { status: "required"; release: UpdateReleaseInfo };

const CACHE_KEY = "update_check_v1";
const CHECK_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — avoid hitting the server on every app open

type CachedCheck = {
  checkedAt: number;
  result: UpdateCheckResult;
};

/** Android's versionCode, as a number. Null on iOS/web or if unreadable. */
function getInstalledVersionCode(): number | null {
  if (Platform.OS !== "android") return null;
  const raw = Application.nativeBuildVersion;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : null;
}

async function readCache(): Promise<CachedCheck | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedCheck) : null;
  } catch {
    return null;
  }
}

async function writeCache(result: UpdateCheckResult) {
  try {
    const entry: CachedCheck = { checkedAt: Date.now(), result };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Non-fatal — worst case we just re-check next launch.
  }
}

function compare(
  installedVersionCode: number,
  release: UpdateReleaseInfo,
): UpdateCheckResult {
  if (installedVersionCode < release.minVersionCode) {
    return { status: "required", release };
  }
  if (installedVersionCode < release.versionCode) {
    return { status: "optional", release };
  }
  return { status: "none" };
}

/**
 * Checks the backend for the active Android release and compares it to the
 * installed versionCode. Android-only — always resolves "none" on iOS/web
 * so this never affects the iOS build.
 *
 * Failure handling (never break the app over this):
 * - Offline or the request throws: fall back to the last cached result IF
 *   it was "required" (we already confirmed this device is unsupported —
 *   that stays enforced even offline), otherwise resolve "none".
 * - No active release configured server-side: resolve "none".
 *
 * Repeated calls within CHECK_TTL_MS reuse the cached result unless
 * `force` is passed (e.g. a manual "Check for updates" tap in Settings).
 */
export async function checkForUpdate(
  options: { force?: boolean } = {},
): Promise<UpdateCheckResult> {
  if (Platform.OS !== "android") return { status: "none" };

  const installedVersionCode = getInstalledVersionCode();
  if (installedVersionCode == null) return { status: "none" };

  const cached = await readCache();
  const isFresh = !!cached && Date.now() - cached.checkedAt < CHECK_TTL_MS;

  if (!options.force && isFresh) {
    return cached!.result;
  }

  if (!isCurrentlyOnline()) {
    if (cached?.result.status === "required") return cached.result;
    return { status: "none" };
  }

  try {
    const data = await apiFetch("/api/app/updates/check?platform=android", {
      auth: true,
    });

    if (!data?.release) {
      const result: UpdateCheckResult = { status: "none" };
      await writeCache(result);
      return result;
    }

    const result = compare(installedVersionCode, data.release as UpdateReleaseInfo);
    await writeCache(result);
    return result;
  } catch {
    if (cached?.result.status === "required") return cached.result;
    return { status: "none" };
  }
}
