/**
 * Queue Management API
 *
 * High-level queue operations for enqueueing, processing, and managing
 * offline mutations.
 */

import {
  createLocalScan,
  deleteLocalScan,
  enqueueItem,
  getLocalScans,
  getNextQueueItem,
  getPendingQueueItems,
  hasLocalScan,
  QueueItem,
  QueueItemStatus,
  updateLocalScan,
  updateQueueItem,
} from "./storage";

export interface EnqueueOptions {
  dependsOn?: string; // ID of operation this depends on
}

export interface LocationPayload {
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
}

export interface SyncResult {
  success: boolean;
  serverScanId?: string; // If operation resulted in a server ID
  message?: string;
}

/**
 * Enqueue a single attendance scan
 */
export async function enqueueScan(
  siteId: string,
  employeeCode: string,
  qrCodeValue: string,
  options?: EnqueueOptions,
  location?: LocationPayload | null,
): Promise<{ queueItemId: string; localScanId: string }> {
  // Create local scan record
  const localScanId = await createLocalScan({
    siteId,
    workDateISO: todayISO(),
    employeeCode,
    qrCodeValue,
    syncStatus: "pending",
    serverScanId: null,
  });

  // Enqueue sync operation
  const queueItemId = await enqueueItem({
    type: "scan-single",
    payload: {
      siteId,
      employeeCode,
      qrCodeValue,
      localScanId,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      address: location?.address ?? null,
    },
    createdAt: new Date().toISOString(),
    attemptCount: 0,
    lastError: null,
    status: "pending",
    dependsOn: options?.dependsOn ?? null,
  });

  return { queueItemId, localScanId };
}

/**
 * Enqueue bulk attendance scans
 */
export async function enqueueBulkScan(
  siteId: string,
  workDateISO: string,
  scans: Array<{ qrCodeValue: string }>,
  options?: EnqueueOptions,
  location?: LocationPayload | null,
): Promise<{ queueItemId: string; localScanIds: string[] }> {
  const localScanIds: string[] = [];

  for (const scan of scans) {
    const scanId = await createLocalScan({
      siteId,
      workDateISO,
      employeeCode: "", // Will be extracted from QR or set by server
      qrCodeValue: scan.qrCodeValue,
      syncStatus: "pending",
      serverScanId: null,
    });
    localScanIds.push(scanId);
  }

  const queueItemId = await enqueueItem({
    type: "scan-bulk",
    payload: {
      siteId,
      workDateISO,
      scans,
      localScanIds,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      address: location?.address ?? null,
    },
    createdAt: new Date().toISOString(),
    attemptCount: 0,
    lastError: null,
    status: "pending",
    dependsOn: options?.dependsOn ?? null,
  });

  return { queueItemId, localScanIds };
}

/**
 * Enqueue scan deletion
 * If the scan hasn't been synced yet, this will remove it locally and cancel the create operation.
 * If it has been synced, this will enqueue a DELETE to the server.
 */
export async function enqueueDeleteScan(
  scanId: string,
  isLocalScan: boolean = false,
): Promise<{ queueItemId: string } | { localOnly: true }> {
  if (isLocalScan) {
    // Scan only exists locally; just remove it
    await deleteLocalScan(scanId);
    return { localOnly: true };
  }

  // Server scan; enqueue DELETE
  const queueItemId = await enqueueItem({
    type: "delete-scan",
    payload: { scanId },
    createdAt: new Date().toISOString(),
    attemptCount: 0,
    lastError: null,
    status: "pending",
    dependsOn: null,
  });

  return { queueItemId };
}

/**
 * Enqueue day note
 */
export async function enqueueDayNote(
  siteId: string,
  dateISO: string,
  reason: string | null,
  note: string | null,
): Promise<string> {
  return enqueueItem({
    type: "day-note",
    payload: { siteId, dateISO, reason, note },
    createdAt: new Date().toISOString(),
    attemptCount: 0,
    lastError: null,
    status: "pending",
    dependsOn: null,
  });
}

/**
 * Enqueue day ready toggle
 */
export async function enqueueDayReady(
  siteId: string,
  dateISO: string,
  readyToSubmit: boolean,
): Promise<string> {
  return enqueueItem({
    type: "day-ready",
    payload: { siteId, dateISO, readyToSubmit },
    createdAt: new Date().toISOString(),
    attemptCount: 0,
    lastError: null,
    status: "pending",
    dependsOn: null,
  });
}

/**
 * Get the next queue item ready to sync
 */
export async function getNextItemToSync(): Promise<QueueItem | null> {
  return getNextQueueItem();
}

/**
 * Get all pending queue items
 */
export async function getAllPendingItems(): Promise<QueueItem[]> {
  return getPendingQueueItems();
}

/**
 * Mark a queue item as done after successful sync
 */
export async function markQueueItemDone(
  itemId: string,
  result?: SyncResult,
): Promise<void> {
  const updates: any = {
    status: "done" as QueueItemStatus,
    lastError: null,
  };

  // If this was a scan operation and we have a serverScanId, update the local scan
  if (result?.serverScanId) {
    const item = await getNextItemToSync();
    if (item?.id === itemId && item.type === "scan-single") {
      const localScanId = item.payload.localScanId;
      await updateLocalScan(localScanId, {
        syncStatus: "synced",
        serverScanId: result.serverScanId,
      });
    }
  }

  await updateQueueItem(itemId, updates);
}

/**
 * Mark a queue item as failed
 */
export async function markQueueItemFailed(
  itemId: string,
  error: string,
  retryable: boolean = true,
): Promise<void> {
  await updateQueueItem(itemId, {
    status: (retryable ? "failed" : "failed") as QueueItemStatus,
    lastError: error,
  });
}

/**
 * Mark a queue item as resolved/ignored (e.g., duplicate scan already on server)
 */
export async function markQueueItemResolved(
  itemId: string,
  message?: string,
): Promise<void> {
  // Mark as done but preserve the message in payload for UI
  await updateQueueItem(itemId, {
    status: "done",
    lastError: message || null,
  });
}

/**
 * Cancel a pending queue item
 */
export async function cancelQueueItem(itemId: string): Promise<void> {
  await updateQueueItem(itemId, {
    status: "canceled" as QueueItemStatus,
  });
}

/**
 * Check if employee has already been scanned today locally
 */
export async function hasEmployeeBeenScannedToday(
  siteId: string,
  employeeCode: string,
): Promise<boolean> {
  return hasLocalScan(siteId, todayISO(), employeeCode);
}

/**
 * Get local scans for a day
 */
export async function getLocalScansForDay(
  siteId: string,
  dateISO: string,
): Promise<any[]> {
  const scans = await getLocalScans(siteId, dateISO);
  return scans.map((scan) => ({
    ...scan,
    isLocal: true,
  }));
}

/**
 * Helper: Get today's date as ISO string
 */
function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
