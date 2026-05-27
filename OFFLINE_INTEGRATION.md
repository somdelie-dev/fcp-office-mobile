/\*\*

- OFFLINE-FIRST INTEGRATION GUIDE
-
- This file documents how to integrate offline-first support into existing screens.
- Follow the patterns below to add offline support to your foreman screens.
  \*/

// ============================================================================
// 1. IMPORT STATEMENTS
// ============================================================================

// Add these imports to scan.tsx and day/[key].tsx:
import { OfflineBanner, SyncQueueIcon } from "@/components/OfflineStatus";
import { useNetworkStatus } from "@/lib/offline/hooks";
import { mergeScans } from "@/lib/offline/merge";
import type { MergedScan } from "@/lib/offline/merge";

// ============================================================================
// 2. UPDATE SCAN SCREEN (app/[foreman]/scan.tsx)
// ============================================================================

/\*\*

- In ForemanScan component:
-
- 1.  Add network status tracking:
      \*/
      export default function ForemanScan() {
      // ... existing state ...
      const networkStatus = useNetworkStatus();

// ... existing code ...

/\*\*

- 2.  When displaying server scans, merge with local:
      \*/
      const displayScans = useMemo(async () => {
      if (!site || !day) return [];
      return await mergeScans(day.scans, site.id, dateISO);
      }, [day, site, dateISO]);

/\*\*

- 3.  Update the "Saved Today" list rendering to use merged data
- and show pending badges:
  \*/
  // In the FlatList for serverScans, change to:
  // data={displayScans}
  // And in renderItem, check: if (item.pendingSync) show badge "Pending sync"

/\*\*

- 4.  Add OfflineBanner at the top of the screen:
      _/
      return (
      <AuthStyleBackground>
      {networkStatus === "offline" && <OfflineBanner />}
      {/_ ... rest of screen ... \*/}
      </AuthStyleBackground>
      );
      }

// ============================================================================
// 3. UPDATE DAY DETAILS SCREEN (app/(foreman-stack)/day/[key].tsx)
// ============================================================================

/\*\*

- In ForemanDayDetails component:
-
- 1.  Add network status and merge logic
      \*/
      export default function ForemanDayDetails() {
      // ... existing state ...
      const networkStatus = useNetworkStatus();

// ... in refresh useEffect ...
const refresh = useCallback(
async (mode: "initial" | "pull" | "manual" = "manual") => {
if (!siteId || !dateISO) return;

      // ... existing code ...

      try {
        const res = await apiForemanDay(siteId, dateISO);

        // Merge local and server scans
        const merged = await mergeScans(res.day.scans, siteId, dateISO);
        const dayWithMerged = { ...res.day, scans: merged };

        setDay(dayWithMerged);
        // ... rest of refresh logic ...
      } catch (e: any) {
        // ... error handling ...
      }
    },
    [siteId, dateISO],

);

/\*\*

- 2.  When rendering scans list, show pending badge:
      _/
      // In the scans FlatList renderItem:
      renderItem={({ item }) => (
      <View>
      {/_ ... existing scan display ... \*/}
      {item.pendingSync && (
      <View style={styles.pendingBadge}>
      <Ionicons name="cloud-upload-outline" size={14} />
      <Text style={styles.pendingText}>Pending sync</Text>
      </View>
      )}
      </View>
      )}

/\*\*

- 3.  Add offline banner
      _/
      return (
      <AuthStyleBackground>
      {networkStatus === "offline" && <OfflineBanner />}
      {/_ ... rest of screen ... \*/}
      </AuthStyleBackground>
      );
      }

// ============================================================================
// 4. ADD SYNC QUEUE NAVIGATION
// ============================================================================

/\*\*

- In app/(foreman-stack)/\_layout.tsx or your navigation config,
- make sure sync-queue screen is accessible:
  _/
  export default function ForemanStackLayout() {
  return (
  <Stack>
  {/_ ... existing screens ... \*/}
  <Stack.Screen
  name="sync-queue"
  options={{
            title: "Sync Queue",
            presentation: "modal",
          }}
  />
  </Stack>
  );
  }

// ============================================================================
// 5. HANDLE NETWORK STATUS STYLING
// ============================================================================

/\*\*

- Add styles for pending badges (add to your StyleSheet):
  \*/
  const pendingBadgeStyles = {
  pendingBadge: {
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: "rgba(245, 158, 11, 0.1)",
  paddingHorizontal: 8,
  paddingVertical: 4,
  borderRadius: 6,
  borderColor: "#f59e0b",
  borderWidth: 1,
  marginTop: 8,
  gap: 4,
  },
  pendingText: {
  fontSize: 12,
  color: "#f59e0b",
  fontWeight: "600",
  },
  };

// ============================================================================
// 6. OFFLINE QUEUE BEHAVIOR
// ============================================================================

/\*\*

- When the user is OFFLINE:
-
- POST /api/app/attendance/scan
- → Enqueued by apiFetch
- → Returns optimistic response with localId
- → User sees scan in list immediately with "Pending sync" badge
- → When online, syncs to server
-
- POST /api/app/attendance/bulk
- → Similar to above; batch enqueued
-
- DELETE /api/app/attendance/scan/{id}
- → Enqueued; synced when online
-
- POST /api/app/foreman/day/note
- → Enqueued; synced when online
-
- POST /api/app/foreman/day/ready
- → Enqueued; synced when online
-
- All GET requests (apiAttendanceToday, apiForemanDay, etc.)
- → ALWAYS go to server (skip queue)
- → If offline, will fail with "Request timed out"
- → User will see last loaded data or "Failed to load"
  \*/

// ============================================================================
// 7. TESTING OFFLINE MODE
// ============================================================================

/\*\*

- To test offline mode:
-
- 1.  In dev tools, toggle network off (Chrome DevTools > Network tab > Offline)
- Or use React Native Debugger network tab
-
- 2.  Perform an action (scan, note, ready toggle)
- → Check that it shows "Pending sync" badge
- → Navigate to sync-queue screen to see queue
-
- 3.  Toggle network back on
- → Watch background sync process items
- → Scans should move from "Pending" to "Done"
-
- 4.  Refresh the day screen
- → Local scans should merge with server scans
-
- To debug SQLite:
- → Use Expo's SQLite debugging or adb shell to access database
- adb shell sqlite3 /data/data/com.yourapp/databases/offline.db
  \*/

// ============================================================================
// 8. KEY EXPORTS FROM OFFLINE MODULES
// ============================================================================

/\*\*

- From lib/offline/queue.ts:
- - enqueueScan(siteId, employeeCode, qrCodeValue)
- - enqueueBulkScan(siteId, workDateISO, scans)
- - enqueueDeleteScan(scanId, isLocalScan)
- - enqueueDayNote(siteId, dateISO, reason, note)
- - enqueueDayReady(siteId, dateISO, readyToSubmit)
- - getAllPendingItems()
- - cancelQueueItem(itemId)
-
- From lib/offline/sync.ts:
- - initializeSyncEngine() [called in AuthProvider]
- - getCurrentNetworkStatus()
- - isCurrentlyOnline()
- - onNetworkStatusChange(listener)
- - forceSyncNow()
- - cleanupSyncEngine()
-
- From lib/offline/hooks.ts:
- - useNetworkStatus()
- - usePendingQueue()
- - useOfflineStats()
-
- From lib/offline/merge.ts:
- - mergeScans(serverScans, siteId, dateISO)
- - isPendingSync(scan)
- - getPendingSyncLabel(scan)
-
- From components/OfflineStatus.tsx:
- - <OfflineBanner />
- - <SyncQueueIcon />
    */

// ============================================================================
// 9. CONFLICT RESOLUTION BEHAVIOR
// ============================================================================

/\*\*

- DUPLICATE SCAN (same employee + date):
- → Server returns 409 or "already scanned" error
- → Sync marks operation as "done" (idempotent)
- → UI shows "Already scanned today" in error message
- → User sees scan in queue but marked as resolved
-
- DELETE OFFLINE-ONLY SCAN:
- → enqueueDeleteScan(scanId, isLocalScan=true)
- → Just removes from local_scans; no server call needed
-
- DELETE SYNCED SCAN OFFLINE:
- → enqueueDeleteScan(scanId, isLocalScan=false)
- → Enqueued; synced when online
- → If scan no longer on server, still marked as done (idempotent)
-
- 401 AUTH ERROR:
- → Stops all syncing
- → Emits auth event → user prompted to re-login
- → Queue preserved until auth succeeds
- → After login, sync resumes automatically
  \*/
