/**
 * Offline Data Merge Utilities
 *
 * Merges local (pending) scans with server data to show users a unified view
 * of attendance records while syncing in the background.
 */

import type { AttendanceScanDto } from "@/lib/apiClient";
import { getLocalScans } from "@/lib/offline/storage";

export interface MergedScan extends AttendanceScanDto {
  isLocal?: boolean;
  localId?: string;
  syncStatus?: "pending" | "synced" | "failed";
  pendingSync?: boolean;
}

/**
 * Merge local pending scans with server scans
 * Local scans are prepended and marked with pendingSync badge
 */
export async function mergeScans(
  serverScans: AttendanceScanDto[],
  siteId: string,
  dateISO: string,
): Promise<MergedScan[]> {
  try {
    const localScans = await getLocalScans(siteId, dateISO);

    // Create merged list: local first (reversed so newest first), then server
    const merged: MergedScan[] = [];

    // Add local scans
    for (const local of localScans.reverse()) {
      if (local.syncStatus !== "synced") {
        merged.push({
          id: local.id,
          scannedAt: local.createdAt,
          employee: {
            id: "",
            code: local.employeeCode,
            fullName: local.employeeCode, // Use code as display until server responds
          },
          isLocal: true,
          localId: local.id,
          syncStatus: local.syncStatus,
          pendingSync: true,
        });
      }
    }

    // Add server scans (excluding any that are also in local pendings with serverScanId)
    const syncedServerIds = new Set(
      localScans.filter((l) => l.serverScanId).map((l) => l.serverScanId),
    );

    for (const scan of serverScans) {
      if (!syncedServerIds.has(scan.id)) {
        merged.push({
          ...scan,
          pendingSync: false,
        });
      }
    }

    return merged;
  } catch (e) {
    console.error("Error merging scans:", e);
    return serverScans.map((s) => ({ ...s, pendingSync: false }));
  }
}

/**
 * Check if a scan is pending sync
 */
export function isPendingSync(scan: MergedScan): boolean {
  return scan.pendingSync === true;
}

/**
 * Format pending sync badge text
 */
export function getPendingSyncLabel(scan: MergedScan): string {
  if (!scan.pendingSync) return "";
  if (scan.syncStatus === "failed") return "Sync failed";
  return "Pending sync";
}
