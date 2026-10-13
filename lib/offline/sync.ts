/**
 * Offline Sync Engine
 *
 * Handles:
 * - Network status detection
 * - Background sync loop with exponential backoff
 * - Conflict resolution (409/400/401 errors)
 * - State persistence and recovery
 */

import { AppState } from "react-native";
import { File, Paths } from "expo-file-system";
import { apiFetch, clearToken, getApiBase, getToken } from "../api";
import { apiEnsureSiteDay, apiScanOutAll } from "../apiClient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { uploadWithProgress } from "../upload";
import {
  isCurrentlyOnline,
  onNetworkStatusChange,
  type NetworkStatus,
} from "./networkStatus";
import {
  getNextItemToSync,
  markQueueItemDone,
  markQueueItemFailed,
  markQueueItemResolved,
} from "./queue";
import type { QueueItem } from "./storage";

// ============================================================================
// Types & Constants
// ============================================================================

type SyncListener = (status: NetworkStatus) => void;

const BACKOFF_CONFIG = {
  initial: 1000, // 1 second
  max: 30000, // 30 seconds
  multiplier: 2,
};

const SYNC_PROCESS_INTERVAL = 2000; // Run sync loop every 2 seconds when online

// ============================================================================
// State
// ============================================================================

let syncInProgress: boolean = false;
let syncProcessTimer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: any = null;
let networkStatusUnsubscribe: (() => void) | null = null;

const listeners: Set<SyncListener> = new Set();
const backoffMap: Map<string, number> = new Map(); // itemId -> backoff delay in ms

// ============================================================================
// Network Status Handling (Event-driven via NetInfo)
// ============================================================================

/**
 * Handle network status change events from NetInfo
 */
function handleNetworkStatusChange(status: NetworkStatus): void {
  if (status === "online") {
    // Network came back online; start sync immediately
    startSyncLoop();
  } else {
    // Network went offline; stop sync loop
    stopSyncLoop();
  }
}

/**
 * Register a local sync listener for network status changes
 * (Internal - separate from networkStatus listeners)
 */
function addSyncListener(listener: SyncListener): void {
  listeners.add(listener);
}

function removeSyncListener(listener: SyncListener): void {
  listeners.delete(listener);
}

/**
 * Notify all local sync listeners of network status change
 */
function notifyListeners(status: NetworkStatus): void {
  listeners.forEach((listener) => {
    try {
      listener(status);
    } catch (e) {
      console.error("Error in sync listener:", e);
    }
  });
}

// ============================================================================
// Sync Engine
// ============================================================================

/**
 * Process the next queue item
 */
async function processNextItem(): Promise<void> {
  if (syncInProgress) return;
  if (!isCurrentlyOnline()) return;

  syncInProgress = true;

  try {
    const item = await getNextItemToSync();
    if (!item) return; // No pending items

    // Check if we should wait before retrying (backoff)
    if (item.status === "failed") {
      const lastBackoff = backoffMap.get(item.id) || 0;
      const nextBackoff = calculateBackoff(item.attemptCount);
      if (Date.now() < lastBackoff + nextBackoff) {
        return; // Not ready to retry yet
      }
    }

    // Mark as inflight
    await updateQueueItem(item.id, { status: "inflight" });

    const result = await executeQueueItem(item);

    if (result.success) {
      await markQueueItemDone(item.id, result);
      backoffMap.delete(item.id);
    } else if (result.retryable) {
      const backoffDelay = calculateBackoff(item.attemptCount + 1);
      backoffMap.set(item.id, Date.now());

      await updateQueueItem(item.id, {
        status: "failed",
        attemptCount: item.attemptCount + 1,
        lastError: result.error,
      });
    } else {
      // Not retryable (e.g., 401 auth error)
      await markQueueItemFailed(
        item.id,
        result.error || "Unknown error",
        false,
      );
      if (result.stopSync) {
        stopSyncLoop();
        notifyListeners("offline"); // Treat auth errors like going offline
      }
    }
  } catch (e: any) {
    console.error("Error processing queue item:", e);
  } finally {
    syncInProgress = false;
  }
}

/**
 * Execute a single queue item and return the result
 */
async function executeQueueItem(item: QueueItem): Promise<{
  success: boolean;
  retryable?: boolean;
  error?: string;
  serverScanId?: string;
  stopSync?: boolean;
}> {
  try {
    switch (item.type) {
      case "scan-single":
        return await executeScanSingle(item);
      case "scan-bulk":
        return await executeScanBulk(item);
      case "delete-scan":
        return await executeDeleteScan(item);
      case "day-note":
        return await executeDayNote(item);
      case "day-ready":
        return await executeDayReady(item);
      case "photo-scan-out":
        return await executePhotoScanOut(item);
      default:
        return { success: false, error: `Unknown item type: ${item.type}` };
    }
  } catch (e: any) {
    return {
      success: false,
      error: e?.message || "Unknown error",
      retryable: true,
    };
  }
}

async function executePhotoScanOut(item: QueueItem): Promise<any> {
  const { siteId, dateISO, photoUri, requestId, latitude, longitude, address } = item.payload;
  try {
    const token = await getToken();
    if (!token) {
      return { success: false, error: "Please sign in again to sync this photo scan-out.", retryable: false, stopSync: true };
    }
    const siteDayId = item.payload.siteDayId ??
      (await apiEnsureSiteDay(siteId, dateISO)).siteDayId;
    const actingForemanId = item.payload.actingForemanId ??
      await AsyncStorage.getItem("acting_foreman_id");
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (actingForemanId) headers["x-acting-foreman-id"] = actingForemanId;
    const uploadUrl = `${getApiBase()}/api/app/foreman/site-days/${encodeURIComponent(siteDayId)}/photos`;
    let photoId = item.payload.photoId;
    if (!photoId) {
      const uploaded = await uploadWithProgress(
        uploadUrl,
        { uri: photoUri, name: `site-day-${dateISO}.jpg`, type: "image/jpeg" },
        {
          ...(item.payload.uploadId ? { clientUploadId: item.payload.uploadId } : {}),
          ...(requestId ? { requestId } : {}),
          ...(latitude != null ? { latitude: String(latitude) } : {}),
          ...(longitude != null ? { longitude: String(longitude) } : {}),
          ...(address ? { address } : {}),
        },
        headers,
      );
      photoId = uploaded?.photo?.id;
      if (!photoId) throw new Error("The uploaded photo response did not include its record ID.");
      const { updateQueueItem } = await import("./storage");
      await updateQueueItem(item.id, {
        payload: { ...item.payload, siteDayId, photoId },
      });
    }
    await apiScanOutAll({
      siteDayId,
      photoId,
      latitude,
      longitude,
      address,
    });
    try { new File(photoUri).delete(); } catch { /* Queue completion must not fail on local cleanup. */ }
    return { success: true };
  } catch (e: any) {
    const error = e?.message || "Unable to sync the photo scan-out.";
    const status: number | undefined = e?.status;
    if (status === 401) {
      await clearToken();
      return { success: false, error: "Please sign in again to sync this photo scan-out.", retryable: false, stopSync: true };
    }
    return { success: false, error, retryable: !(status === 400 || status === 403 || status === 404 || status === 413) };
  }
}

/**
 * Execute scan-single operation
 */
async function executeScanSingle(item: QueueItem): Promise<any> {
  const { siteId, employeeCode, latitude, longitude, address } = item.payload;

  try {
    const result = await apiFetch("/api/app/attendance/scan", {
      method: "POST",
      body: JSON.stringify({
        siteId,
        employeeCode,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        address: address ?? null,
      }),
    });

    return {
      success: true,
      serverScanId: result.scan?.id,
    };
  } catch (e: any) {
    const error = e?.message || String(e);

    // Handle 409/400 duplicates
    if (
      error.includes("409") ||
      error.includes("already scanned") ||
      error.includes("duplicate")
    ) {
      // Mark as resolved; it's idempotent
      await markQueueItemResolved(item.id, "Already scanned today (server)");
      return { success: true };
    }

    // Handle auth errors
    if (error.includes("401") || error.includes("Unauthorized")) {
      await clearToken();
      return {
        success: false,
        error: "Authentication required",
        retryable: false,
        stopSync: true,
      };
    }

    return {
      success: false,
      error,
      retryable: !error.includes("invalid") && !error.includes("400"),
    };
  }
}

/**
 * Execute scan-bulk operation
 */
async function executeScanBulk(item: QueueItem): Promise<any> {
  const { siteId, workDateISO, scans, latitude, longitude, address } =
    item.payload;

  try {
    const result = await apiFetch("/api/app/attendance/bulk", {
      method: "POST",
      body: JSON.stringify({
        siteId,
        workDateISO,
        scans,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        address: address ?? null,
      }),
    });

    return { success: true };
  } catch (e: any) {
    const error = e?.message || String(e);

    if (error.includes("401")) {
      await clearToken();
      return {
        success: false,
        error: "Authentication required",
        retryable: false,
        stopSync: true,
      };
    }

    return {
      success: false,
      error,
      retryable: !error.includes("400"),
    };
  }
}

/**
 * Execute delete-scan operation
 */
async function executeDeleteScan(item: QueueItem): Promise<any> {
  const { scanId } = item.payload;

  try {
    await apiFetch(`/api/app/attendance/scan/${scanId}`, {
      method: "DELETE",
    });

    return { success: true };
  } catch (e: any) {
    const error = e?.message || String(e);

    // If scan not found on server, treat as success (idempotent)
    if (error.includes("404")) {
      return { success: true };
    }

    if (error.includes("401")) {
      await clearToken();
      return {
        success: false,
        error: "Authentication required",
        retryable: false,
        stopSync: true,
      };
    }

    return {
      success: false,
      error,
      retryable: !error.includes("400"),
    };
  }
}

/**
 * Execute day-note operation
 */
async function executeDayNote(item: QueueItem): Promise<any> {
  const { siteId, dateISO, reason, note } = item.payload;

  try {
    await apiFetch("/api/app/foreman/day/note", {
      method: "POST",
      body: JSON.stringify({ siteId, dateISO, reason, note }),
    });

    return { success: true };
  } catch (e: any) {
    const error = e?.message || String(e);

    if (error.includes("401")) {
      await clearToken();
      return {
        success: false,
        error: "Authentication required",
        retryable: false,
        stopSync: true,
      };
    }

    return {
      success: false,
      error,
      retryable: !error.includes("400"),
    };
  }
}

/**
 * Execute day-ready operation
 */
async function executeDayReady(item: QueueItem): Promise<any> {
  const { siteId, dateISO, readyToSubmit } = item.payload;

  try {
    await apiFetch("/api/app/foreman/day/ready", {
      method: "POST",
      body: JSON.stringify({ siteId, dateISO, readyToSubmit }),
    });

    return { success: true };
  } catch (e: any) {
    const error = e?.message || String(e);

    if (error.includes("401")) {
      await clearToken();
      return {
        success: false,
        error: "Authentication required",
        retryable: false,
        stopSync: true,
      };
    }

    return {
      success: false,
      error,
      retryable: !error.includes("400"),
    };
  }
}

// ============================================================================
// Backoff Calculation
// ============================================================================

/**
 * Calculate exponential backoff delay in milliseconds
 */
function calculateBackoff(attemptCount: number): number {
  const exp = Math.min(attemptCount, 5); // Cap at 5 to avoid huge delays
  const delay =
    BACKOFF_CONFIG.initial * Math.pow(BACKOFF_CONFIG.multiplier, exp);
  const maxDelay = Math.min(delay, BACKOFF_CONFIG.max);
  // Add jitter: ±20%
  const jitter = maxDelay * 0.2 * (Math.random() - 0.5);
  return maxDelay + jitter;
}

/**
 * Get a queue item from storage (needed for updateQueueItem)
 */
async function updateQueueItem(
  id: string,
  updates: Record<string, any>,
): Promise<void> {
  // Import at function scope to avoid circular dependency
  const { updateQueueItem: updateItem } = await import("./storage");
  return updateItem(id, updates);
}

// ============================================================================
// Sync Loop Control
// ============================================================================

/**
 * Start the background sync loop
 */
function startSyncLoop(): void {
  if (syncProcessTimer) return;

  syncProcessTimer = setInterval(() => {
    processNextItem().catch(console.error);
  }, SYNC_PROCESS_INTERVAL);
}

/**
 * Stop the background sync loop
 */
function stopSyncLoop(): void {
  if (syncProcessTimer) {
    clearInterval(syncProcessTimer);
    syncProcessTimer = null;
  }
}

// ============================================================================
// App Lifecycle
// ============================================================================

/**
 * Initialize the sync engine
 * Call this from app startup (e.g., in AuthProvider or a useEffect in root)
 */
export function initializeSyncEngine(): void {
  // Subscribe to network status changes from NetInfo (via networkMonitor.tsx)
  if (networkStatusUnsubscribe === null) {
    networkStatusUnsubscribe = onNetworkStatusChange(handleNetworkStatusChange);
  }

  // Listen to app state changes
  if (appStateSubscription === null) {
    appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        // App came to foreground; start sync if online
        if (isCurrentlyOnline()) {
          startSyncLoop();
        }
      } else {
        // App went to background; stop aggressive syncing
        stopSyncLoop();
      }
    });
  }

  // If we're online, start syncing
  if (isCurrentlyOnline()) {
    startSyncLoop();
  }
}

/**
 * Cleanup sync engine (for app shutdown, testing)
 */
export function cleanupSyncEngine(): void {
  stopSyncLoop();

  if (networkStatusUnsubscribe) {
    networkStatusUnsubscribe();
    networkStatusUnsubscribe = null;
  }

  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }

  listeners.clear();
  backoffMap.clear();
}

/**
 * Force sync immediately (useful for manual refresh)
 */
export async function forceSyncNow(): Promise<void> {
  if (isCurrentlyOnline()) {
    startSyncLoop();
    // Give the sync loop one chance to process
    await new Promise((resolve) => setTimeout(resolve, 100));
    await processNextItem();
  }
}
