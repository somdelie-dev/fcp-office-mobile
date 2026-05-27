/\*\*

- Type Definitions & Exports Reference
-
- This file documents all exported types and functions from the offline modules.
- Use this as a reference when integrating offline features into your screens.
  \*/

// ============================================================================
// TYPES (from lib/offline/storage.ts)
// ============================================================================

export type QueueItemType =
| "scan-single"
| "scan-bulk"
| "delete-scan"
| "day-note"
| "day-ready";

export type QueueItemStatus =
| "pending" // Waiting to sync
| "inflight" // Currently syncing
| "done" // Successfully synced
| "failed" // Failed, needs retry
| "canceled"; // User canceled

export interface QueueItem {
id: string;
type: QueueItemType;
payload: Record<string, any>;
createdAt: string; // ISO timestamp
attemptCount: number;
lastError: string | null;
status: QueueItemStatus;
dependsOn: string | null;
}

export interface LocalScan {
id: string;
siteId: string;
workDateISO: string;
employeeCode: string;
qrCodeValue: string;
createdAt: string; // ISO timestamp
syncStatus: "pending" | "synced" | "failed";
serverScanId: string | null;
}

// ============================================================================
// STORAGE EXPORTS (lib/offline/storage.ts)
// ============================================================================

/\*\*

- Enqueue a new item to be synced
- @returns Item ID
  \*/
  export async function enqueueItem(
  item: Omit<QueueItem, "id">
  ): Promise<string>;

/\*\*

- Get a specific queue item by ID
  \*/
  export async function getQueueItem(id: string): Promise<QueueItem | null>;

/\*\*

- Get all pending and failed items
  \*/
  export async function getPendingQueueItems(): Promise<QueueItem[]>;

/\*\*

- Get next item to sync (respects dependencies)
  \*/
  export async function getNextQueueItem(): Promise<QueueItem | null>;

/\*\*

- Update a queue item (status, attempts, error, etc)
  \*/
  export async function updateQueueItem(
  id: string,
  updates: Partial<Omit<QueueItem, "id">>
  ): Promise<void>;

/\*\*

- Delete a queue item
  \*/
  export async function deleteQueueItem(id: string): Promise<void>;

/\*\*

- Get all queue items (for debugging)
  \*/
  export async function getAllQueueItems(): Promise<QueueItem[]>;

/\*\*

- Create a local scan record
- @returns Local scan ID
  \*/
  export async function createLocalScan(
  scan: Omit<LocalScan, "id" | "createdAt">
  ): Promise<string>;

/\*\*

- Get a specific local scan by ID
  \*/
  export async function getLocalScan(id: string): Promise<LocalScan | null>;

/\*\*

- Get all local scans for a site and date
  \*/
  export async function getLocalScans(
  siteId: string,
  workDateISO: string
  ): Promise<LocalScan[]>;

/\*\*

- Delete a local scan
  \*/
  export async function deleteLocalScan(id: string): Promise<void>;

/\*\*

- Update a local scan (sync status, serverScanId)
  \*/
  export async function updateLocalScan(
  id: string,
  updates: Partial<Omit<LocalScan, "id" | "createdAt">>
  ): Promise<void>;

/\*\*

- Check if employee already has a scan for date at site
  \*/
  export async function hasLocalScan(
  siteId: string,
  workDateISO: string,
  employeeCode: string
  ): Promise<boolean>;

/\*\*

- Get statistics about queue and scans
  \*/
  export async function getOfflineStats(): Promise<{
  queue: {
  total: number;
  pending: number;
  inflight: number;
  failed: number;
  done: number;
  canceled: number;
  };
  scans: {
  total: number;
  pending: number;
  synced: number;
  failed: number;
  };
  }>;

/\*\*

- Clear all offline data (testing/reset only)
  \*/
  export async function clearOfflineData(): Promise<void>;

// ============================================================================
// QUEUE EXPORTS (lib/offline/queue.ts)
// ============================================================================

export interface EnqueueOptions {
dependsOn?: string; // ID of dependency
}

export interface SyncResult {
success: boolean;
serverScanId?: string;
message?: string;
}

/\*\*

- Enqueue a single attendance scan
- @returns queueItemId and localScanId
  \*/
  export async function enqueueScan(
  siteId: string,
  employeeCode: string,
  qrCodeValue: string,
  options?: EnqueueOptions
  ): Promise<{ queueItemId: string; localScanId: string }>;

/\*\*

- Enqueue bulk attendance scans
- @returns queueItemId and localScanIds
  \*/
  export async function enqueueBulkScan(
  siteId: string,
  workDateISO: string,
  scans: Array<{ qrCodeValue: string }>,
  options?: EnqueueOptions
  ): Promise<{ queueItemId: string; localScanIds: string[] }>;

/\*\*

- Enqueue scan deletion
- Handles both local-only and synced scans with tombstone logic
  \*/
  export async function enqueueDeleteScan(
  scanId: string,
  isLocalScan?: boolean
  ): Promise<{ queueItemId: string } | { localOnly: true }>;

/\*\*

- Enqueue day note
- @returns queueItemId
  \*/
  export async function enqueueDayNote(
  siteId: string,
  dateISO: string,
  reason: string | null,
  note: string | null
  ): Promise<string>;

/\*\*

- Enqueue day ready toggle
- @returns queueItemId
  \*/
  export async function enqueueDayReady(
  siteId: string,
  dateISO: string,
  readyToSubmit: boolean
  ): Promise<string>;

/\*\*

- Get next item ready to sync
  \*/
  export async function getNextItemToSync(): Promise<QueueItem | null>;

/\*\*

- Get all pending items
  \*/
  export async function getAllPendingItems(): Promise<QueueItem[]>;

/\*\*

- Mark item as done after successful sync
  \*/
  export async function markQueueItemDone(
  itemId: string,
  result?: SyncResult
  ): Promise<void>;

/\*\*

- Mark item as failed
  \*/
  export async function markQueueItemFailed(
  itemId: string,
  error: string,
  retryable?: boolean
  ): Promise<void>;

/\*\*

- Mark item as resolved (e.g., duplicate scan already on server)
  \*/
  export async function markQueueItemResolved(
  itemId: string,
  message?: string
  ): Promise<void>;

/\*\*

- Cancel a pending item
  \*/
  export async function cancelQueueItem(itemId: string): Promise<void>;

/\*\*

- Check if employee has been scanned today
  \*/
  export async function hasEmployeeBeenScannedToday(
  siteId: string,
  employeeCode: string
  ): Promise<boolean>;

/\*\*

- Get local scans for a specific day
  \*/
  export async function getLocalScansForDay(
  siteId: string,
  dateISO: string
  ): Promise<any[]>;

// ============================================================================
// SYNC EXPORTS (lib/offline/sync.ts)
// ============================================================================

export type NetworkStatus = "online" | "offline";

type SyncListener = (status: NetworkStatus) => void;

/\*\*

- Initialize the sync engine (call in app startup)
- Should be called once in AuthProvider
  \*/
  export function initializeSyncEngine(): void;

/\*\*

- Cleanup sync engine (for shutdown or testing)
  \*/
  export function cleanupSyncEngine(): void;

/\*\*

- Get current network status
- @returns "online" or "offline"
  \*/
  export function getCurrentNetworkStatus(): NetworkStatus;

/\*\*

- Check if we're currently online
  \*/
  export function isCurrentlyOnline(): boolean;

/\*\*

- Subscribe to network status changes
- @returns Unsubscribe function
  \*/
  export function onNetworkStatusChange(
  listener: SyncListener
  ): () => void;

/\*\*

- Force sync immediately (manual trigger)
  \*/
  export async function forceSyncNow(): Promise<void>;

// ============================================================================
// HOOKS EXPORTS (lib/offline/hooks.ts)
// ============================================================================

/\*\*

- Hook: Get current network status
- @returns "online" | "offline"
  \*/
  export function useNetworkStatus(): NetworkStatus;

/\*\*

- Hook: Get pending queue items with auto-refresh
- @returns { items, count, loading, refresh }
  \*/
  export function usePendingQueue(): {
  items: QueueItem[];
  count: number;
  loading: boolean;
  refresh: () => Promise<void>;
  };

/\*\*

- Hook: Get offline sync statistics
- @returns { stats, loading, refresh }
  \*/
  export function useOfflineStats(): {
  stats: {
  queue: Record<string, number>;
  scans: Record<string, number>;
  } | null;
  loading: boolean;
  refresh: () => Promise<void>;
  };

// ============================================================================
// MERGE EXPORTS (lib/offline/merge.ts)
// ============================================================================

import type { AttendanceScanDto } from "@/lib/apiClient";

export interface MergedScan extends AttendanceScanDto {
isLocal?: boolean;
localId?: string;
syncStatus?: "pending" | "synced" | "failed";
pendingSync?: boolean;
}

/\*\*

- Merge local pending scans with server scans
- Local scans appear first (reversed), marked with pendingSync
  \*/
  export async function mergeScans(
  serverScans: AttendanceScanDto[],
  siteId: string,
  dateISO: string
  ): Promise<MergedScan[]>;

/\*\*

- Check if a scan is pending sync
  \*/
  export function isPendingSync(scan: MergedScan): boolean;

/\*\*

- Get label text for a pending scan
  \*/
  export function getPendingSyncLabel(scan: MergedScan): string;

// ============================================================================
// COMPONENT EXPORTS (components/OfflineStatus.tsx)
// ============================================================================

/\*\*

- Component: Offline status banner
- Shows "Offline" (red) or "{count} pending syncs" (amber)
- Tappable to open sync queue screen
- Returns null if online and no pending items
  \*/
  export function OfflineBanner(): React.ReactElement | null;

/\*\*

- Component: Sync queue icon for navigation header
- Shows badge with pending count
- Returns null if no pending items
  \*/
  export function SyncQueueIcon(): React.ReactElement | null;

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/\*\*

- EXAMPLE 1: Track network status in component
  \*/

import { useNetworkStatus } from "@/lib/offline/hooks";

function MyScreen() {
const networkStatus = useNetworkStatus();

return (
<View>
{networkStatus === "offline" && (
<Text>⚠️ You are offline</Text>
)}
</View>
);
}

/\*\*

- EXAMPLE 2: Show pending queue count
  \*/

import { usePendingQueue } from "@/lib/offline/hooks";

function MyScreen() {
const { count } = usePendingQueue();

return (
<View>
{count > 0 && <Text>Pending syncs: {count}</Text>}
</View>
);
}

/\*\*

- EXAMPLE 3: Merge and display scans
  \*/

import { mergeScans, isPendingSync } from "@/lib/offline/merge";

async function loadScans(siteId: string, dateISO: string) {
const serverScans = await apiAttendanceToday(siteId);
const merged = await mergeScans(serverScans.day.scans, siteId, dateISO);

merged.forEach(scan => {
if (isPendingSync(scan)) {
console.log(`${scan.employee.code} pending sync`);
}
});

return merged;
}

/\*\*

- EXAMPLE 4: Queue a scan
  \*/

import { enqueueScan } from "@/lib/offline/queue";

async function handleScan(siteId: string, employeeCode: string) {
const { localScanId } = await enqueueScan(
siteId,
employeeCode,
employeeCode // Use code as QR for now
);

console.log(`Scan queued: ${localScanId}`);
// Update UI immediately with optimistic feedback
}

/\*\*

- EXAMPLE 5: Force manual sync
  \*/

import { forceSyncNow } from "@/lib/offline/sync";

async function handleManualSync() {
await forceSyncNow();
// Queue will be processed immediately
}

/\*\*

- EXAMPLE 6: Cancel a failed item
  \*/

import { cancelQueueItem } from "@/lib/offline/queue";

async function handleCancelItem(itemId: string) {
await cancelQueueItem(itemId);
// Item will be marked as "canceled"
}

// ============================================================================
// COMMON PATTERNS
// ============================================================================

/\*\*

- PATTERN 1: Show offline banner + sync icon
  \*/

import { OfflineBanner, SyncQueueIcon } from "@/components/OfflineStatus";

function MyScreen() {
return (
<View>
<OfflineBanner />
{/_ ... screen content ... _/}
</View>
);
}

// In navigation options:
// headerRight: () => <SyncQueueIcon />

/\*\*

- PATTERN 2: Merge and display scans
  \*/

import { mergeScans } from "@/lib/offline/merge";

function ScanList({ siteId, dateISO, serverScans }) {
const [scans, setScans] = useState([]);

useEffect(() => {
mergeScans(serverScans, siteId, dateISO).then(setScans);
}, [serverScans, siteId, dateISO]);

return (
<FlatList
data={scans}
renderItem={({ item }) => (
<View>
<Text>{item.employee.fullName}</Text>
{item.pendingSync && <Text>⟳ Pending</Text>}
</View>
)}
/>
);
}

/\*\*

- PATTERN 3: Monitor queue stats
  \*/

import { useOfflineStats } from "@/lib/offline/hooks";

function DebugPanel() {
const { stats } = useOfflineStats();

if (!stats) return null;

return (
<View>
<Text>Pending: {stats.queue.pending}</Text>
<Text>Done: {stats.queue.done}</Text>
<Text>Failed: {stats.queue.failed}</Text>
</View>
);
}
