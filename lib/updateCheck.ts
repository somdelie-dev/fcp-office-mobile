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

// v1 cached the computed status, which survives an app update: the freshly
// installed build re-read "optional"/"required" worked out for the old
// versionCode and kept showing the modal. v2 caches the release itself and
// re-compares it against the installed versionCode on every read.
const CACHE_KEY = "update_check_v2";
const LEGACY_CACHE_KEY = "update_check_v1";
const CHECK_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — avoid hitting the server on every app open

type CachedCheck = {
  checkedAt: number;
  release: UpdateReleaseInfo | null;
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

async function writeCache(release: UpdateReleaseInfo | null) {
  try {
    const entry: CachedCheck = { checkedAt: Date.now(), release };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entry));
    await AsyncStorage.removeItem(LEGACY_CACHE_KEY);
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
  const cachedResult: UpdateCheckResult = cached?.release
    ? compare(installedVersionCode, cached.release)
    : { status: "none" };

  if (!options.force && isFresh) {
    return cachedResult;
  }

  if (!isCurrentlyOnline()) {
    return cachedResult.status === "required" ? cachedResult : { status: "none" };
  }

  try {
    const data = await apiFetch("/api/app/updates/check?platform=android", {
      auth: true,
    });

    const release = (data?.release as UpdateReleaseInfo | undefined) ?? null;
    await writeCache(release);
    return release ? compare(installedVersionCode, release) : { status: "none" };
  } catch {
    return cachedResult.status === "required" ? cachedResult : { status: "none" };
  }
}
