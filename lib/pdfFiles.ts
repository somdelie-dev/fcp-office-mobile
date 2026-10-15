import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import * as IntentLauncher from "expo-intent-launcher";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { getApiBase, getToken } from "@/lib/api";

/** POSTs JSON to an endpoint that returns a PDF and saves it in the app's documents. */
export async function postForPdf(
  path: string,
  body: unknown,
  filename: string,
): Promise<string> {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated. Please sign in again.");

  const res = await fetch(`${getApiBase()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `Could not build the PDF (${res.status})`);
  }

  const output = new File(Paths.document, filename);
  if (output.exists) output.delete();
  output.create();
  output.write(new Uint8Array(await res.arrayBuffer()));
  return output.uri;
}

const DOWNLOAD_DIR_KEY = "pdf_download_dir_v1";
const FLAG_GRANT_READ_URI_PERMISSION = 1;

async function pickDownloadDir(): Promise<Directory> {
  const dir = await Directory.pickDirectoryAsync();
  await AsyncStorage.setItem(DOWNLOAD_DIR_KEY, dir.uri).catch(() => {});
  return dir;
}

/**
 * Copies a PDF out of the app into a folder the user can find (e.g.
 * Downloads). Android asks for the folder once and remembers it; if access
 * was lost it asks again. On iOS there is no shared folder, so this opens
 * the share sheet where "Save to Files" lives.
 * Returns the saved file name, or null when the user cancelled.
 */
export async function savePdfToDevice(
  uri: string,
  filename: string,
): Promise<string | null> {
  if (Platform.OS !== "android") {
    await sharePdf(uri, "Save PDF");
    return null;
  }

  const bytes = await new File(uri).bytes();
  const write = (dir: Directory) =>
    dir.createFile(filename, "application/pdf").write(bytes);

  const savedUri = await AsyncStorage.getItem(DOWNLOAD_DIR_KEY).catch(
    () => null,
  );
  if (savedUri) {
    try {
      write(new Directory(savedUri));
      return filename;
    } catch {
      // Folder permission was revoked or the folder was removed; ask again.
    }
  }

  try {
    write(await pickDownloadDir());
    return filename;
  } catch (e: any) {
    if (/cancel/i.test(String(e?.message ?? ""))) return null;
    throw e;
  }
}

/** Opens a PDF in the phone's PDF viewer, which has its own Print option. */
export async function openPdf(uri: string) {
  if (Platform.OS !== "android") {
    await sharePdf(uri, "Open PDF");
    return;
  }
  try {
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: new File(uri).contentUri,
      type: "application/pdf",
      flags: FLAG_GRANT_READ_URI_PERMISSION,
    });
  } catch {
    // No PDF viewer installed; the share sheet still lets them pick an app.
    await sharePdf(uri, "Open PDF");
  }
}

/** Opens the system share sheet so the PDF can be saved, printed, or sent. */
export async function sharePdf(uri: string, dialogTitle: string) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device.");
  }
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle,
  });
}
