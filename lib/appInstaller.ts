import { File, Paths } from "expo-file-system";
import * as IntentLauncher from "expo-intent-launcher";
import { Platform } from "react-native";

import { getApiBase, getToken } from "./api";

const FLAG_GRANT_READ_URI_PERMISSION = 1;
const APK_MIME_TYPE = "application/vnd.android.package-archive";

/**
 * Downloads the active release's APK from our own backend (authenticated,
 * streamed from private server-side storage — no Cloudinary, no public
 * URL) to the app's cache directory, then hands it to the Android package
 * installer via ACTION_VIEW. This cannot install silently — Android always
 * requires the user to confirm the install screen themselves. The promise
 * resolves once the user returns to our app (whether or not they actually
 * completed the install).
 */
export async function downloadAndLaunchInstaller(): Promise<void> {
  if (Platform.OS !== "android") {
    throw new Error("Installing updates is only supported on Android.");
  }

  const token = await getToken();
  if (!token) {
    throw new Error("Please sign in again before updating.");
  }

  const url = `${getApiBase()}/api/app/updates/download?platform=android`;
  const destination = new File(Paths.cache, "firstclass-update.apk");

  const downloaded = await File.downloadFileAsync(url, destination, {
    headers: { Authorization: `Bearer ${token}` },
    idempotent: true,
  });

  const contentUri = downloaded.contentUri;

  await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
    data: contentUri,
    type: APK_MIME_TYPE,
    flags: FLAG_GRANT_READ_URI_PERMISSION,
  });
}
