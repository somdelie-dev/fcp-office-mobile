# Offline-First Architecture for Foreman Mobile App

## Executive Summary

This document describes the **offline-first implementation** for the Expo mobile app's foreman workflows. This enables foreman users to:

✅ **Scan attendance offline** with immediate UI feedback  
✅ **Queue mutations** (scans, notes, toggles) for sync when online  
✅ **Auto-sync with smart retry logic** (exponential backoff)  
✅ **Handle conflicts gracefully** (duplicates, auth errors, network issues)  
✅ **View merged local+server data** with "pending sync" indicators

**Web (supervisors/admins) remains online-only—no changes needed.**

---

## Architecture Overview

### High-Level Flow

```
┌─────────────────────────────────────┐
│   User Action (Offline)             │
│   e.g., scan employee card          │
└──────────────┬──────────────────────┘
               │
               ▼
        ┌────────────────────┐
        │  Check Network     │
        │  isCurrentlyOnline?│
        └────┬──────────┬────┘
             │          │
          YES│          │NO
             │          ▼
             │   ┌──────────────────┐
             │   │  Enqueue Mutation│
             │   │  (SQLite Queue)  │
             │   └──────────────────┘
             │          │
             ▼          └──────────┐
        ┌──────────────────┐       │
        │  Fetch Server    │       │
        │  (Online Path)   │       │
        └────────┬─────────┘       │
                 │                 │
                 ▼                 │
        ┌──────────────────┐       │
        │  Update UI       │◄──────┘
        │  (Optimistic)    │
        └──────────────────┘
                 │
                 ▼
        ┌──────────────────┐
        │  Network Returns │
        │  Sync Queue      │
        └────────┬─────────┘
                 │
                 ▼
        ┌──────────────────┐
        │ Process Items    │
        │ With Backoff     │
        └────────┬─────────┘
                 │
                 ├─→ 200: Mark Done ✓
                 ├─→ 409: Duplicate (Resolved) ⓘ
                 ├─→ 401: Auth Error (Stop) ✗
                 └─→ 5xx: Retry Later ⟳
```

### Key Components

#### 1. **Storage Layer** (`lib/offline/storage.ts`)

- **SQLite database** with two tables:
  - `queue`: Pending mutations to sync
  - `local_scans`: Scans created/deleted offline
- **Core functions:**
  - `enqueueItem()` / `getNextQueueItem()` / `deleteQueueItem()`
  - `createLocalScan()` / `updateLocalScan()` / `getLocalScans()`
  - `getOfflineStats()` for UI display

#### 2. **Queue Manager** (`lib/offline/queue.ts`)

- High-level API over storage
- **Functions:**
  - `enqueueScan()` - Single attendance scan
  - `enqueueBulkScan()` - Bulk scans
  - `enqueueDeleteScan()` - Delete with tombstone logic
  - `enqueueDayNote()` - Day flag/note
  - `enqueueDayReady()` - Ready toggle
  - `getAllPendingItems()` / `cancelQueueItem()` / `markQueueItemDone()`

#### 3. **Sync Engine** (`lib/offline/sync.ts`)

- Network detection with periodic probing
- Background sync loop (2s interval when online)
- Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s
- Conflict resolution for 409/400/401 errors
- Preserves queue on auth errors

#### 4. **API Integration** (`lib/api.ts`)

- **Modified `apiFetch()`** function:
  - Detects foreman mutations (POST/DELETE to specific paths)
  - Routes through queue if offline
  - Returns optimistic response immediately
  - Reads always go to server (never queued)

#### 5. **UI Hooks & Components** (`lib/offline/hooks.ts`, `components/OfflineStatus.tsx`)

- `useNetworkStatus()` - Real-time network status
- `usePendingQueue()` - Pending items with auto-refresh
- `useOfflineStats()` - Queue/scan statistics
- `<OfflineBanner />` - Status banner (shows offline/pending count)
- `<SyncQueueIcon />` - Header icon with badge count

#### 6. **Debug Screen** (`app/(foreman-stack)/sync-queue.tsx`)

- View all pending/failed queue items
- Force sync button
- Cancel individual items
- Error messages and retry counts

---

## Data Models

### QueueItem (SQLite `queue` table)

```typescript
{
  id: string; // UUID
  type: QueueItemType; // scan-single, scan-bulk, delete-scan, day-note, day-ready
  payload: Record<string, any>; // Request body
  createdAt: string; // ISO timestamp
  attemptCount: number; // Retry count
  lastError: string | null; // Error message
  status: QueueItemStatus; // pending, inflight, done, failed, canceled
  dependsOn: string | null; // ID of dependent item
}
```

### LocalScan (SQLite `local_scans` table)

```typescript
{
  id: string; // UUID (localId)
  siteId: string;
  workDateISO: string; // YYYY-MM-DD
  employeeCode: string;
  qrCodeValue: string;
  createdAt: string; // ISO timestamp
  syncStatus: "pending" | "synced" | "failed";
  serverScanId: string | null; // Maps to server ID after sync
}
```

---

## Sync Process

### When Network Comes Online

1. **Network detection**: Periodic probes (every 30s) detect online
2. **Start sync loop**: Process next queue item every 2s
3. **Fetch next item**: Get first pending/failed item with resolved dependencies
4. **Mark inflight**: Set status to "inflight" while syncing
5. **Execute HTTP request**: Based on item.type, call corresponding API
6. **Handle response:**
   - **200–299**: Mark as "done", map serverScanId, clear error
   - **409/400** (duplicate): Mark as "resolved" (idempotent)
   - **401** (auth): Stop sync, emit auth event, preserve queue
   - **5xx** (server error): Mark as "failed", retry with backoff
   - **Network error**: Leave as "pending", retry next cycle

### Backoff Strategy

```
Attempt 1: Retry after 1s
Attempt 2: Retry after 2s
Attempt 3: Retry after 4s
Attempt 4: Retry after 8s
Attempt 5: Retry after 16s
Attempt 6+: Retry after 30s
Each with ±20% jitter to avoid thundering herd
```

### Conflict Resolution

| Scenario                                | Behavior                                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Duplicate scan** (same employee+date) | Server returns 409/"already scanned"; marked as "resolved" (idempotent); UI shows "Already scanned today" |
| **Delete local scan** (not yet synced)  | Remove from `local_scans`, cancel create operation; no server call                                        |
| **Delete synced scan** (offline)        | Enqueue DELETE to server; if 404 on sync, still mark done (idempotent)                                    |
| **Auth error (401)**                    | Stop all syncing, emit event to prompt login, preserve queue                                              |
| **Network timeout**                     | Leave in queue, retry on next online check                                                                |
| **Concurrent updates**                  | Last write wins; optimistic UI, server state overrides on refresh                                         |

---

## Mutations Supported Offline

### 1. Scan Single

```
Offline: enqueueScan(siteId, employeeCode, qrCodeValue)
Online:  POST /api/app/attendance/scan { siteId, employeeCode }
```

### 2. Scan Bulk

```
Offline: enqueueBulkScan(siteId, dateISO, scans[])
Online:  POST /api/app/attendance/bulk { siteId, workDateISO, scans[] }
```

### 3. Delete Scan

```
Offline: enqueueDeleteScan(scanId, isLocalScan)
Online:  DELETE /api/app/attendance/scan/{scanId}
```

### 4. Day Note

```
Offline: enqueueDayNote(siteId, dateISO, reason, note)
Online:  POST /api/app/foreman/day/note { siteId, dateISO, reason, note }
```

### 5. Day Ready Toggle

```
Offline: enqueueDayReady(siteId, dateISO, readyToSubmit)
Online:  POST /api/app/foreman/day/ready { siteId, dateISO, readyToSubmit }
```

### Read Operations (Always Online)

- `GET /api/app/attendance/today` - Never queued
- `GET /api/app/foreman/day` - Never queued
- Any other read fails with "Request timed out" when offline

---

## UI Integration

### 1. Offline Banner

```tsx
import { OfflineBanner } from "@/components/OfflineStatus";

// Add to top of foreman screens
{
  networkStatus === "offline" && <OfflineBanner />;
}
```

Shows:

- 🛑 "Offline" (red) when no network
- ☁️ "{count} pending sync" (amber) when has pending items
- Tap to open sync queue debug screen

### 2. Sync Queue Icon

```tsx
// Add to header right in navigation options
import { SyncQueueIcon } from "@/components/OfflineStatus";

// In screen options
headerRight: () => <SyncQueueIcon />;
```

Shows badge count of pending items; tap opens sync queue debug screen.

### 3. Pending Sync Badge

```tsx
import { isPendingSync, getPendingSyncLabel } from "@/lib/offline/merge";

// In scan list rendering
{
  scan.pendingSync && (
    <View style={styles.pendingBadge}>
      <Text>⟳ {getPendingSyncLabel(scan)}</Text>
    </View>
  );
}
```

### 4. Merged Scans

```tsx
import { mergeScans } from "@/lib/offline/merge";

// When loading day data
const merged = await mergeScans(serverScans, siteId, dateISO);
// Displays local scans first (reversed), then server scans
// Local scans marked with pendingSync = true
```

### 5. Sync Queue Debug Screen

```tsx
// Navigate to view pending items
import { useRouter } from "expo-router";

const router = useRouter();
router.push("/(foreman-stack)/sync-queue");
```

Shows:

- Network status badge
- Queue statistics (pending, synced, failed, etc.)
- List of all queue items with status, error, attempt count
- Force sync button
- Cancel/retry buttons for failed items

---

## File Structure

```
lib/
  api.ts                         [MODIFIED] Added offline queue routing
  auth.tsx                       [MODIFIED] Initialize sync engine on app start
  offline/
    storage.ts                   [NEW] SQLite persistence layer
    queue.ts                     [NEW] High-level queue API
    sync.ts                      [NEW] Network detection + sync loop
    hooks.ts                     [NEW] React hooks for UI
    merge.ts                     [NEW] Merge local + server data
app/
  (foreman)/
    scan.tsx                     [INTEGRATE] Add offline banner, merge scans
  (foreman-stack)/
    day/[key].tsx               [INTEGRATE] Add offline banner, merge scans
    sync-queue.tsx              [NEW] Debug UI for queue
    _layout.tsx                 [INTEGRATE] Add sync-queue screen to navigation
components/
  OfflineStatus.tsx             [NEW] Offline banner + sync icon components
OFFLINE_INTEGRATION.md           [NEW] Integration guide with code examples
```

---

## Setup Instructions

### 1. Copy Offline Modules

All files in `lib/offline/` are already created:

- ✅ `storage.ts` - SQLite layer
- ✅ `queue.ts` - Queue API
- ✅ `sync.ts` - Sync engine
- ✅ `hooks.ts` - React hooks
- ✅ `merge.ts` - Data merge utility

### 2. Update Dependencies

**Already satisfied**:

- ✅ `expo-sqlite` (~16.0.10) - already in package.json
- ✅ `@react-native-async-storage/async-storage` (2.2.0) - already installed

### 3. Update Existing Files

- **`lib/api.ts`** ✅ [DONE] - Added queue routing for foreman mutations
- **`lib/auth.tsx`** ✅ [DONE] - Initialize sync engine

### 4. Integrate UI Components

- **`components/OfflineStatus.tsx`** ✅ [CREATED]
  - Import and add `<OfflineBanner />` to foreman screens
  - Add `<SyncQueueIcon />` to navigation header

- **`app/(foreman)/scan.tsx`** [TODO]
  - Add offline banner
  - Merge local + server scans before display
  - Show pending badges

- **`app/(foreman-stack)/day/[key].tsx`** [TODO]
  - Add offline banner
  - Merge local + server scans
  - Show pending badges

- **`app/(foreman-stack)/sync-queue.tsx`** ✅ [CREATED] - Debug UI

### 5. Update Navigation

- **`app/(foreman-stack)/_layout.tsx`** [TODO]
  - Ensure `sync-queue` screen is in Stack
  - Add `headerRight: () => <SyncQueueIcon />` to relevant screens

---

## Testing Checklist

- [ ] **Network Offline**
  - [ ] Scan employee card → appears in list with "Pending sync" badge
  - [ ] Navigate to sync queue → see scan in pending items
  - [ ] Banner shows "Offline" and pending count
  - [ ] Attempts to load server data show error (reads always online)

- [ ] **Network Returns**
  - [ ] Background sync starts automatically
  - [ ] Queue items move from "pending" → "done" with backoff timing
  - [ ] Scan synced → "serverScanId" assigned, local sync status updates
  - [ ] Refresh day screen → merged list shows server data
  - [ ] Pending badge disappears once synced

- [ ] **Duplicate Scan**
  - [ ] Scan same employee twice offline
  - [ ] Go online → first scan syncs normally
  - [ ] Second scan attempts to sync, gets 409
  - [ ] Item marked as "resolved", shows "Already scanned today"
  - [ ] User can see the conflict in sync queue

- [ ] **Delete Offline**
  - [ ] Create scan offline
  - [ ] Delete it before sync
  - [ ] Item removed from local_scans, create operation canceled
  - [ ] No DELETE request sent when online

- [ ] **Delete After Sync**
  - [ ] Create and sync scan online
  - [ ] Go offline, delete it
  - [ ] DELETE enqueued
  - [ ] Go online → DELETE syncs, item marked done
  - [ ] Refresh list → scan no longer appears

- [ ] **Auth Error**
  - [ ] Queue some items
  - [ ] Change password/logout (401 error)
  - [ ] Sync stops, auth event emitted
  - [ ] User prompted to re-login
  - [ ] After login, sync resumes automatically

- [ ] **Foreman vs Supervisor Isolation**
  - [ ] Foreman (mobile): offline scans work ✓
  - [ ] Supervisor (web): timesheets still online-only ✓
  - [ ] Admin (web): approvals still online-only ✓

---

## Performance Considerations

### Sync Frequency

- **Network check**: Every 30s (efficient, minimal battery impact)
- **Sync loop**: Every 2s when online (responsive, not aggressive)
- **Backoff**: Up to 30s max delay (respects server, avoids hammering)

### SQLite Optimization

- **WAL mode** enabled (Write-Ahead Logging) for concurrent access
- **Indexes** on `status`, `dependsOn`, `siteId+workDateISO`
- **Batch operations** via transactions (built into `runAsync`)

### Memory Usage

- **Lazy-loaded hooks**: `useNetworkStatus()`, `usePendingQueue()` refresh on demand
- **No global state**: Only SQLite and network listeners active
- **Auto-cleanup**: Timers cleared when app backgrounded

---

## Troubleshooting

### "Offline but network seems OK"

- **Issue**: `isCurrentlyOnline()` returns false
- **Fix**: Network probes `/health` endpoint; ensure server responds
- **Debug**: Check `adb logcat` or React Native Debugger console for probe errors

### "Scans not syncing"

- **Issue**: Queue items stuck in "pending"
- **Fix**:
  1. Check sync queue screen for error message
  2. Verify auth token is valid (401 errors stop sync)
  3. Use "Force Sync Now" button to trigger manually
  4. Check server logs for 5xx errors

### "Duplicates in list after merge"

- **Issue**: Same scan appears twice (local + server)
- **Fix**:
  - Check `local_scans.serverScanId` mapping
  - Ensure `mergeScans()` filters duplicates
  - Refresh list after sync completes

### "SQLite "database is locked" error"

- **Issue**: Concurrent writes to database
- **Fix**:
  - SQLite uses WAL mode; shouldn't happen
  - If persists, clear app data and reinitialize
  - Check for multiple sync processes running

---

## Future Enhancements

### Phase 2: Conflict Resolution UI

- Show user-friendly conflict dialogs
- Allow manual retry or dismiss of failed items
- Export queue to CSV for support debugging

### Phase 3: Partial Sync

- Sync read-only endpoints (photos, documents) incrementally
- Cache supervisor timesheets for read-only offline view

### Phase 4: Analytics

- Track sync metrics (success rate, average retry count, latency)
- Monitor database size and cleanup old items

---

## API Contract

### Server Assumptions

This implementation assumes:

1. **Idempotent mutations**: POST/DELETE calls can be safely retried
2. **Unique constraints**:
   - `AttendanceScan(employeeId, workDate)` unique across all sites
   - `AttendanceScan(siteDayId, employeeId)` unique per site-day
3. **409/400 on duplicates**: Returns conflict status with descriptive message
4. **401 on auth failure**: Requires re-login (token refresh not supported)
5. **Timestamps**: Server accepts ISO format (YYYY-MM-DDTHH:mm:ss.sssZ)

### Client Guarantees

- Queue preserves order (FIFO + dependencies)
- No mutation succeeds without unique ID assignment
- Local data never overwrites server state (merge strategy preserves server truth)

---

## Support & Questions

Refer to:

- **Integration guide**: [OFFLINE_INTEGRATION.md](OFFLINE_INTEGRATION.md)
- **Source code comments**: Each module is heavily documented
- **Debug screen**: `sync-queue.tsx` shows real-time queue state
